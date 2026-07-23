//! 望仔 · 内核看门狗
//! 只在用户开着 TUN 模式时才生效，每隔几秒检查一次：
//!   1. 内核进程是否还在跑
//!   2. "Meta Tunnel" 这张 TUN 虚拟网卡是否还存在于系统里
//! 任一异常 -> 立刻触发杀死开关拦截流量 + 尝试自动重启内核
//! 恢复正常 -> 解除拦截

use crate::cmd::kill_switch;
use crate::config::Config;
use crate::core::manager::{CoreManager, RunningMode};
use crate::process::AsyncHandler;
use clash_verge_logging::{Type, logging};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_secs(4);
// 重启冷却时间：避免内核反复崩溃时疯狂重启刷屏
const RESTART_COOLDOWN: Duration = Duration::from_secs(10);
// TUN 网卡驱动的固定描述字符串（已通过 ipconfig /all 实测确认）
const TUN_ADAPTER_MARK: &[u8] = b"Meta Tunnel";

static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);
static LAST_RESTART_ATTEMPT: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));

/// 应用启动时调用一次，之后常驻后台轮询
pub fn start() {
    if WATCHDOG_STARTED.swap(true, Ordering::AcqRel) {
        return; // 已经启动过，防止重复
    }

    AsyncHandler::spawn(|| async move {
        logging!(info, Type::Core, "网络防泄漏看门狗已启动");
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            check_once().await;
        }
    });
}

async fn check_once() {
    let tun_enabled = Config::verge().await.latest_arc().enable_tun_mode.unwrap_or(false);

    if !tun_enabled {
        // 用户根本没打算用 TUN 保护，任何时候都不应该让用户被卡在断网状态
        if kill_switch::is_active() {
            if let Err(e) = kill_switch::unblock_all_outbound() {
                logging!(warn, Type::Core, "看门狗解除阻断失败: {}", e);
            } else {
                logging!(info, Type::Core, "TUN 模式已关闭，看门狗已解除网络阻断");
            }
        }
        return;
    }

    let running_mode = CoreManager::global().get_running_mode();
    let core_alive = !matches!(*running_mode, RunningMode::NotRunning);
    let tun_present = check_tun_adapter_present();

    let healthy = core_alive && tun_present;

    if healthy {
        if kill_switch::is_active() {
            if let Err(e) = kill_switch::unblock_all_outbound() {
                logging!(warn, Type::Core, "看门狗解除阻断失败: {}", e);
            } else {
                logging!(info, Type::Core, "内核与 TUN 网卡已恢复正常，解除网络阻断");
            }
        }
        return;
    }

    // 走到这里说明异常：内核没在跑，或者网卡不见了，但用户配置里 TUN 应该是开着的
    logging!(
        warn,
        Type::Core,
        "检测到异常（内核运行:{}，TUN网卡在:{}），触发看门狗保护",
        core_alive,
        tun_present
    );

    if !kill_switch::is_active() {
        if let Err(e) = kill_switch::block_all_outbound() {
            logging!(error, Type::Core, "看门狗触发阻断失败: {}", e);
        }
    }

    try_restart_with_cooldown().await;
}

async fn try_restart_with_cooldown() {
    // 关键防线：无论是巡检发现异常，还是内核 Terminated 事件触发，
    // 走到"要不要重启内核"这一步之前，必须先确认激活状态仍然有效。
    // 否则激活码过期的用户，内核一崩溃就会被看门狗自动救活，
    // 相当于绕过了到期停止逻辑。
    if !is_activation_valid().await {
        logging!(
            warn,
            Type::Core,
            "激活码已过期或无效，看门狗放弃自动重启（继续保持阻断）"
        );
        return;
    }

    {
        let mut last = LAST_RESTART_ATTEMPT.lock().unwrap();
        if let Some(t) = *last {
            if t.elapsed() < RESTART_COOLDOWN {
                return; // 冷却中，不重复尝试，避免刷屏式重启
            }
        }
        *last = Some(Instant::now());
    }

    logging!(info, Type::Core, "看门狗尝试自动重启内核");
    if let Err(e) = CoreManager::global().restart_core().await {
        logging!(error, Type::Core, "看门狗自动重启内核失败: {}", e);
    }
}

/// 调用 cmd::license::check_license_silent 做只读校验，
/// 不弹通知、不产生副作用，适合看门狗这种后台高频调用的场景。
/// 任何异常（校验出错、未激活、已过期、机器不匹配等）一律当作"无效"处理，
/// 宁可保守地不重启，也不让过期用户被意外救活。
async fn is_activation_valid() -> bool {
    match crate::cmd::license::check_license_silent() {
        Ok(status) => status.activated,
        Err(e) => {
            logging!(warn, Type::Core, "看门狗校验激活状态失败，按无效处理: {}", e);
            false
        }
    }
}

/// 通过 ipconfig /all 的原始输出字节，直接搜索 TUN 网卡描述字符串。
/// 用原始字节匹配而不是先转成字符串，是为了绕开中文 Windows 下
/// cmd 输出编码（GBK）可能导致的乱码问题——反正目标字符串是纯 ASCII，
/// 在 GBK/UTF-8 下字节序列都一样，直接按字节找最稳妥。
#[cfg(windows)]
fn check_tun_adapter_present() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("ipconfig")
        .arg("/all")
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(o) => o.stdout.windows(TUN_ADAPTER_MARK.len()).any(|w| w == TUN_ADAPTER_MARK),
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn check_tun_adapter_present() -> bool {
    false
}

/// 由 core/manager/state.rs 在检测到"内核意外退出"时调用
/// （用户主动点停止不会走到这里，见 intentional_stop 标记）
pub fn on_core_crashed() {
    AsyncHandler::spawn(|| async move {
        let tun_enabled = Config::verge().await.latest_arc().enable_tun_mode.unwrap_or(false);

        if !tun_enabled {
            return; // 没开 TUN，内核崩了也不用杀死开关兜底
        }

        logging!(warn, Type::Core, "检测到内核意外退出，看门狗立即介入");

        // 阻断永远先执行——无论是否已过期激活，内核一旦意外消失，
        // 先堵上流量再说，这是 Kill Switch 的职责，防泄漏优先级最高。
        if let Err(e) = kill_switch::block_all_outbound() {
            logging!(error, Type::Core, "崩溃触发阻断失败: {}", e);
        }

        // 是否重启，交给 try_restart_with_cooldown 内部的激活校验决定。
        try_restart_with_cooldown().await;
    });
}
