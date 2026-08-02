//! 望仔 · 规则集镜像自动切换
//! 背景：默认脚本里的 rule-providers 全部指向 raw.githubusercontent.com（或
//! github.com/.../raw/...），国内直连经常超时/抽风，导致内核启动时规则加载
//! 失败、分流错乱。
//!
//! 做法：在 enhance() 生成最终 config（此时 rule-providers 已经被脚本塞好）
//! 之后、写入运行时配置文件之前，对每个 rule-provider 的 url 做一次短超时
//! 探测，按优先级依次尝试"原始地址 -> 镜像1 -> 镜像2 -> jsdelivr"，命中第一个
//! 可访问的就替换进最终 config；全部失败则保留原始地址，不阻断启动流程。
//!
//! 20 个左右的 provider 之间并发探测，避免拖慢启动耗时；单个 provider 内部
//! 按优先级顺序探测（短超时 + 提前命中即停）。

use once_cell::sync::Lazy;
use serde_yaml_ng::{Mapping, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 单次探测超时，避免某个镜像卡住拖慢整体启动
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// 整个探测任务（含最多 4 个候选地址依次尝试）的硬性上限。
/// 就算 reqwest 内部因为系统级 DNS 解析异常没有严格遵守 PROBE_TIMEOUT，
/// 这层外部超时也能保证每个 provider 最多占用这么久就会被强制放弃，
/// 不会无限期拖住整个 generate() 流程。
const TASK_HARD_TIMEOUT: Duration = Duration::from_secs(10);

/// 探测结果缓存多久算新鲜。规则集可用性不会分钟级变化，
/// 缓存命中时直接复用结果、完全跳过网络探测，
/// 让绝大多数 generate() 调用（比如用户只是切个 TUN 开关）瞬间完成。
const CACHE_TTL: Duration = Duration::from_secs(60 * 60); // 1 小时

struct CacheEntry {
    resolved_url: String,
    resolved_at: Instant,
}

static PROBE_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// 对 config 里的 rule-providers 做镜像探测和替换。
/// 任何异常都只记日志、不返回 Err，绝不因为探测失败阻断内核启动。
pub async fn patch_rule_providers(config: &mut Mapping) {
    let Some(Value::Mapping(providers)) = config.get_mut(Value::String("rule-providers".into())) else {
        return; // 没有 rule-providers 字段，不用处理
    };

    // 望仔·本地化优先：本地 .mrs 已释放则强制 type:file、删 url/interval，
    // mihomo 只读本地、本模块也不再联网探测（导入/更新秒加载的关键）。
    // 在最后一道统一兜底，无论界面全局脚本写什么都被覆盖，无需用户改 UI。
    if let Ok(app_home) = crate::utils::dirs::app_home_dir() {
        for (_k, v) in providers.iter_mut() {
            if let Some(m) = v.as_mapping_mut() {
                let path_str = m
                    .get(Value::String("path".into()))
                    .and_then(|p| p.as_str())
                    .map(|s| s.to_string());
                if let Some(path_str) = path_str {
                    let rel = path_str.strip_prefix("./").unwrap_or(&path_str);
                    if app_home.join(rel).exists() {
                        let mut new_m = Mapping::new();
                        new_m.insert(Value::String("type".into()), Value::String("file".into()));
                        if let Some(f) = m.get(Value::String("format".into())).cloned() {
                            new_m.insert(Value::String("format".into()), f);
                        }
                        if let Some(b) = m.get(Value::String("behavior".into())).cloned() {
                            new_m.insert(Value::String("behavior".into()), b);
                        }
                        if let Some(pv) = m.get(Value::String("path".into())).cloned() {
                            new_m.insert(Value::String("path".into()), pv);
                        }
                        *m = new_m;
                    }
                }
            }
        }
    }

    // 收集 (provider_key, original_url) 列表，避免边遍历边可变借用冲突
    let all_targets: Vec<(Value, String)> = providers
        .iter()
        .filter_map(|(k, v)| {
            let url = v.as_mapping()?.get(Value::String("url".into()))?.as_str()?;
            Some((k.clone(), url.to_string()))
        })
        .collect();

    if all_targets.is_empty() {
        return;
    }

    // 第一遍：查缓存，命中且未过期的直接应用结果，不需要发任何网络请求。
    // 只有缓存缺失/过期的那部分，才需要真正走探测流程。
    let mut need_probe: Vec<(Value, String)> = Vec::new();
    {
        let cache = PROBE_CACHE.lock().unwrap();
        for (key, original_url) in all_targets {
            match cache.get(&original_url) {
                Some(entry) if entry.resolved_at.elapsed() < CACHE_TTL => {
                    if entry.resolved_url != original_url {
                        if let Some(Value::Mapping(provider)) = providers.get_mut(&key) {
                            provider.insert(Value::String("url".into()), Value::String(entry.resolved_url.clone()));
                        }
                    }
                }
                _ => need_probe.push((key, original_url)),
            }
        }
    }

    if need_probe.is_empty() {
        return; // 全部命中缓存，本次 generate() 不需要任何网络探测
    }

    let client = match reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() {
        Ok(c) => c,
        Err(e) => {
            clash_verge_logging::logging!(
                warn,
                clash_verge_logging::Type::Config,
                "规则集镜像探测：构建 HTTP 客户端失败，跳过探测: {}",
                e
            );
            return;
        }
    };

    // 并发探测：每个 provider 一个 tokio task，内部顺序试候选地址，
    // 外层再包一层硬超时兜底，防止极端情况下单个任务卡住不返回。
    let mut handles = Vec::with_capacity(need_probe.len());
    for (key, original_url) in need_probe {
        let client = client.clone();
        handles.push(tokio::spawn(async move {
            let candidates = build_candidates(&original_url);
            let picked = tokio::time::timeout(TASK_HARD_TIMEOUT, pick_reachable(&client, &candidates))
                .await
                .unwrap_or(None); // 超时也视为"没探测出可用地址"，走兜底逻辑
            (key, original_url, picked)
        }));
    }

    for handle in handles {
        let (key, original_url, picked) = match handle.await {
            Ok(v) => v,
            Err(e) => {
                clash_verge_logging::logging!(
                    warn,
                    clash_verge_logging::Type::Config,
                    "规则集镜像探测：任务异常: {}",
                    e
                );
                continue;
            }
        };

        let Some(best_url) = picked else {
            // 全部候选都失败（或整体超时），保留原始地址，不做任何改动，
            // 也不写入缓存——下次 generate() 时会重新尝试，
            // 避免把"这次网络恰好抽风"永久缓存下来。
            clash_verge_logging::logging!(
                warn,
                clash_verge_logging::Type::Config,
                "规则集镜像探测：{:?} 所有候选地址均不可达/超时，保留原始地址",
                key
            );
            continue;
        };

        if best_url != original_url {
            clash_verge_logging::logging!(
                info,
                clash_verge_logging::Type::Config,
                "规则集镜像探测：{:?} 切换为可用镜像 {}",
                key,
                best_url
            );
        }

        if let Some(Value::Mapping(provider)) = providers.get_mut(&key) {
            provider.insert(Value::String("url".into()), Value::String(best_url.clone()));
        }

        // 探测成功，写入缓存，供后续 generate() 直接复用
        PROBE_CACHE.lock().unwrap().insert(
            original_url,
            CacheEntry {
                resolved_url: best_url,
                resolved_at: Instant::now(),
            },
        );
    }
}

/// 按优先级构建候选地址列表：原始地址 -> 反代镜像们 -> jsdelivr（能解析出来才加）
fn build_candidates(original_url: &str) -> Vec<String> {
    let mut list = vec![original_url.to_string()];

    // 反向代理型镜像：直接把完整原始 URL 拼在镜像域名后面即可，
    // 不需要理解 GitHub URL 内部结构，兼容性最好。
    for prefix in ["https://ghfast.top/", "https://gh-proxy.com/"] {
        list.push(format!("{prefix}{original_url}"));
    }

    // jsdelivr 需要把 GitHub raw URL 解析成 owner/repo@branch/path 格式，
    // 解析不出来（比如遇到不认识的 URL 结构）就跳过，不影响其它候选。
    if let Some(jsdelivr_url) = to_jsdelivr_url(original_url) {
        list.push(jsdelivr_url);
    }

    list
}

/// 尝试把常见的两种 GitHub raw URL 结构转换成 jsdelivr 的 gh 格式：
///   https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
///   https://github.com/{owner}/{repo}/raw/{branch_or_refs}/{path}
/// 转换为：
///   https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}
/// 无法识别的结构一律返回 None，调用方会跳过这个候选，不影响其它镜像。
fn to_jsdelivr_url(original_url: &str) -> Option<String> {
    let rest = original_url
        .strip_prefix("https://raw.githubusercontent.com/")
        .or_else(|| {
            original_url.strip_prefix("https://github.com/").and_then(|s| {
                s.split_once("/raw/").map(|(owner_repo, tail)| {
                    // 重新拼回 "owner/repo/tail"，方便和上面统一按 "/" 切分处理
                    Box::leak(format!("{owner_repo}/{tail}").into_boxed_str()) as &str
                })
            })
        })?;

    let mut parts = rest.splitn(3, '/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    let branch_and_path = parts.next()?;

    // 处理 "refs/heads/xxx/真实路径" 这种把完整 git ref 塞进 URL 的写法，
    // jsdelivr 只认分支短名，取 "refs/heads/" 之后的第一段当分支名。
    let (branch, path) = if let Some(after_refs) = branch_and_path.strip_prefix("refs/heads/") {
        after_refs.split_once('/')?
    } else {
        branch_and_path.split_once('/').unwrap_or((branch_and_path, ""))
    };

    if path.is_empty() {
        return None;
    }

    Some(format!("https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}"))
}

/// 按顺序探测候选地址，返回第一个可达的；全部失败返回 None。
async fn pick_reachable(client: &reqwest::Client, candidates: &[String]) -> Option<String> {
    for url in candidates {
        if probe_one(client, url).await {
            return Some(url.clone());
        }
    }
    None
}

/// 探测单个 URL 是否可达。优先 HEAD（省流量），
/// 部分镜像/服务器不支持 HEAD 时退化成只拿 1 字节的 GET（Range: bytes=0-0）。
async fn probe_one(client: &reqwest::Client, url: &str) -> bool {
    if let Ok(resp) = client.head(url).send().await {
        if resp.status().is_success() {
            return true;
        }
    }

    match client.get(url).header("Range", "bytes=0-0").send().await {
        Ok(resp) => resp.status().is_success() || resp.status().as_u16() == 206,
        Err(_) => false,
    }
}
