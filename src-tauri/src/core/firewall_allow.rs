//! 望仔 · 防火墙精确放行规则
//! 背景：TUN 模式下，如果 Windows 防火墙处于开启状态，内核进程的出站流量
//! 和/或 TUN 虚拟网卡本身可能被默认策略挡住，导致无法上网。
//!
//! 这个模块不碰"防火墙整体开关"，只针对"内核进程"和"TUN 虚拟网卡接口"
//! 各加一条精确的 Allow 规则——用户的 Windows 防火墙可以全程保持开启，
//! 只是专门给望仔开了个绿灯，其它软件、其它流量完全不受影响。
//!
//! 这跟"整体关闭防火墙"是完全不同的行为类别：安装软件时请求防火墙放行
//! 是所有正规程序的标准操作，不会被安全软件的行为分析当成异常动作。
//!
//! 内核进程的可执行文件路径不是硬编码/猜测出来的——sidecar 是通过 Tauri
//! 的 shell().sidecar() 高层封装启动的，实际路径由 Tauri 内部解析，
//! 我们的代码里并不直接持有这个路径字符串。所以改用更可靠的做法：
//! 进程已经 spawn 成功、拿到了 PID，直接问操作系统"这个 PID 对应的可执行
//! 文件实际在哪"，这个信息 100% 准确，不依赖任何路径拼接猜测。
use std::sync::atomic::{AtomicU32, Ordering};
/// TUN 虚拟网卡的接口别名（对应 `Get-NetAdapter` 里的 Name 字段，
/// 不是 InterfaceDescription "Meta Tunnel" 那个描述文字）
const TUN_INTERFACE_ALIAS: &str = "Meta";
const CORE_RULE_NAME: &str = "望仔-Core-Allow";
const TUN_RULE_NAME: &str = "望仔-TUN-Allow";
/// 记录当前内核进程的 PID，方便清理规则时确认（也用于避免重复添加同一
/// PID 对应路径的规则）。0 表示当前没有记录中的内核进程。
static CURRENT_CORE_PID: AtomicU32 = AtomicU32::new(0);
#[cfg(windows)]
fn run_powershell(script: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("调用 PowerShell 失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell 执行失败: {stderr}"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
#[cfg(not(windows))]
fn run_powershell(_script: &str) -> Result<String, String> {
    Err("该功能目前仅支持 Windows".into())
}
/// 用 PID 反查该进程实际运行的可执行文件路径。
/// 进程已经在跑了，这个查询 100% 准确，不依赖任何路径拼接猜测。
fn resolve_exe_path_by_pid(pid: u32) -> Result<String, String> {
    let script = format!("(Get-Process -Id {pid} -ErrorAction Stop).Path");
    let path = run_powershell(&script)?;
    if path.is_empty() {
        return Err(format!("PID {pid} 对应的进程路径为空"));
    }
    Ok(path)
}
/// 添加一条防火墙放行规则，允许指定可执行文件的所有出站流量。
/// 用 New-NetFirewallRule 而不是 netsh，是因为它对特殊字符路径处理更稳，
/// 且和 kill_switch.rs 里操作 profile 状态用的是同一套 cmdlet 体系，风格统一。
/// 幂等：先删掉同名旧规则再新增，避免因路径变化（比如内核升级）导致规则重复堆积。
fn allow_program(rule_name: &str, exe_path: &str) -> Result<(), String> {
    let delete_script = format!("Remove-NetFirewallRule -DisplayName '{rule_name}' -ErrorAction SilentlyContinue");
    let _ = run_powershell(&delete_script);

    let add_script = format!(
        "New-NetFirewallRule -DisplayName '{rule_name}' -Direction Outbound -Program '{exe_path}' -Action Allow -Profile Any | Out-Null"
    );
    run_powershell(&add_script)?;
    Ok(())
}
/// 添加一条防火墙放行规则，允许指定网络接口（按 InterfaceAlias）的所有出站流量。
fn allow_interface(rule_name: &str, interface_alias: &str) -> Result<(), String> {
    let delete_script = format!("Remove-NetFirewallRule -DisplayName '{rule_name}' -ErrorAction SilentlyContinue");
    let _ = run_powershell(&delete_script);

    let add_script = format!(
        "New-NetFirewallRule -DisplayName '{rule_name}' -Direction Outbound -InterfaceAlias '{interface_alias}' -Action Allow -Profile Any | Out-Null"
    );
    run_powershell(&add_script)?;
    Ok(())
}
/// 删除一条防火墙规则（按名字），不存在也不当错误处理，保证幂等。
fn remove_rule(rule_name: &str) {
    let script = format!("Remove-NetFirewallRule -DisplayName '{rule_name}' -ErrorAction SilentlyContinue");
    let _ = run_powershell(&script);
}
/// 内核进程刚 spawn 成功后调用：反查其真实可执行文件路径，加一条放行规则。
/// 应该在拿到 child 的 PID 之后立刻调用一次。
pub fn allow_core_process(pid: u32) {
    match resolve_exe_path_by_pid(pid) {
        Ok(exe_path) => {
            if let Err(e) = allow_program(CORE_RULE_NAME, &exe_path) {
                clash_verge_logging::logging!(
                    warn,
                    clash_verge_logging::Type::Core,
                    "添加内核进程防火墙放行规则失败: {}",
                    e
                );
            } else {
                clash_verge_logging::logging!(
                    info,
                    clash_verge_logging::Type::Core,
                    "已添加内核进程防火墙放行规则: {}",
                    exe_path
                );
                CURRENT_CORE_PID.store(pid, Ordering::Release);
            }
        }
        Err(e) => {
            clash_verge_logging::logging!(
                warn,
                clash_verge_logging::Type::Core,
                "反查内核进程路径失败（PID {}），跳过防火墙放行规则: {}",
                pid,
                e
            );
        }
    }
}
/// TUN 网卡建立成功后调用：给这张虚拟网卡加一条放行规则。
pub fn allow_tun_interface() {
    if let Err(e) = allow_interface(TUN_RULE_NAME, TUN_INTERFACE_ALIAS) {
        clash_verge_logging::logging!(
            warn,
            clash_verge_logging::Type::Core,
            "添加 TUN 网卡防火墙放行规则失败: {}",
            e
        );
    } else {
        clash_verge_logging::logging!(info, clash_verge_logging::Type::Core, "已添加 TUN 网卡防火墙放行规则");
    }
}
/// 内核停止/TUN 关闭时调用：清理掉两条放行规则，不在系统里留痕迹。
pub fn cleanup_rules() {
    remove_rule(CORE_RULE_NAME);
    remove_rule(TUN_RULE_NAME);
    remove_rule(PHYS_LOCK_BLOCK);
    remove_rule(PHYS_LOCK_ALLOW_PROXY);
    remove_rule(PHYS_LOCK_ALLOW_LAN);
    CURRENT_CORE_PID.store(0, Ordering::Release);
    clash_verge_logging::logging!(info, clash_verge_logging::Type::Core, "已清理望仔防火墙放行规则");
}

// =====================================================================
// 物理网卡出站锁 —— 仅"只读 / 只删"安全件
// ---------------------------------------------------------------------
// 重要：经核对 Windows 防火墙语义（Block 规则优先于 Allow 规则），
// 用 netsh / New-NetFirewallRule 无法安全实现"物理网卡 block-all 而不断代理"
// （block-all 会连代理出站一起 block，allow_core_process 也救不了）。
// 因此本模块【故意不提供 enable】，只提供列网卡 / 查状态 / 解除，
// 全部为只读或只删操作，绝不会造成断网。
// 真正的物理锁需走 WFP sublayer 权重方案，列为后续专项。
// =====================================================================
const PHYS_LOCK_BLOCK: &str = "望仔-物理锁-block";
const PHYS_LOCK_ALLOW_PROXY: &str = "望仔-物理锁-allow-proxy";
const PHYS_LOCK_ALLOW_LAN: &str = "望仔-物理锁-allow-lan";

/// 列出当前在线的物理网卡名（只读，安全）。供将来 WFP 方案的下拉选择。
#[cfg(windows)]
pub fn list_physical_nics() -> Vec<String> {
    let script = "Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Select-Object -ExpandProperty Name";
    match run_powershell(script) {
        Ok(out) => out
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[cfg(not(windows))]
pub fn list_physical_nics() -> Vec<String> {
    Vec::new()
}

/// 查询是否残留物理锁规则（只读，安全）。
#[cfg(windows)]
pub fn check_physical_nic_lock_status() -> bool {
    let script = format!(
        "(Get-NetFirewallRule -DisplayName '{PHYS_LOCK_BLOCK}' -ErrorAction SilentlyContinue | Measure-Object).Count"
    );
    matches!(run_powershell(&script), Ok(v) if v.trim().parse::<i64>().unwrap_or(0) > 0)
}

#[cfg(not(windows))]
pub fn check_physical_nic_lock_status() -> bool {
    false
}

/// 删除物理锁规则（只删，幂等，安全）。没启用过也不报错。
pub fn disable_physical_nic_lock() {
    remove_rule(PHYS_LOCK_BLOCK);
    remove_rule(PHYS_LOCK_ALLOW_PROXY);
    remove_rule(PHYS_LOCK_ALLOW_LAN);
}


/// 当前内核进程的可执行文件路径（供物理网卡锁 permit 白名单用）。内核未运行返回 None。
pub fn current_core_exe_path() -> Option<String> {
    let pid = CURRENT_CORE_PID.load(Ordering::Acquire);
    if pid == 0 {
        return None;
    }
    resolve_exe_path_by_pid(pid).ok()
}