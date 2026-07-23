//! 望仔 · 杀死开关（Kill Switch）
//! 原理：往 Windows 防火墙加一条"阻止所有出站流量"的高优先级规则。
//! 触发时机由 core/watchdog.rs 决定（内核意外退出 / TUN 网卡消失），
//! 本模块只负责"拦"和"解除拦截"这两个动作本身。
//!
//! 状态用进程内的 AtomicBool 自己记着，不去反查 netsh 的输出文本
//! （netsh 的提示文字依赖系统语言，反查不可靠；反正规则只有望仔自己会加/删）。

use super::CmdResult;
use std::sync::atomic::{AtomicBool, Ordering};

static ACTIVE: AtomicBool = AtomicBool::new(false);

const RULE_NAME: &str = "望仔-KillSwitch";

#[cfg(windows)]
fn run_netsh(args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("netsh")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("调用 netsh 失败: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("netsh 执行失败: {stderr}"));
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_netsh(_args: &[&str]) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}

/// 立即阻断所有出站流量（可能需要管理员权限）
pub fn block_all_outbound() -> Result<(), String> {
    run_netsh(&[
        "advfirewall",
        "firewall",
        "add",
        "rule",
        &format!("name={RULE_NAME}"),
        "dir=out",
        "action=block",
        "enable=yes",
        "profile=any",
    ])?;
    ACTIVE.store(true, Ordering::Release);
    Ok(())
}

/// 解除阻断，恢复正常联网
pub fn unblock_all_outbound() -> Result<(), String> {
    // 删除规则即使规则不存在也不当作错误处理，保证幂等
    let _ = run_netsh(&[
        "advfirewall",
        "firewall",
        "delete",
        "rule",
        &format!("name={RULE_NAME}"),
    ]);
    ACTIVE.store(false, Ordering::Release);
    Ok(())
}

pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}

// ==================== Tauri 命令（供前端查询/手动测试用）====================

#[tauri::command]
pub fn kill_switch_status() -> CmdResult<bool> {
    Ok(is_active())
}

/// 手动测试用：前端点一下按钮立刻触发阻断，验证效果
#[tauri::command]
pub fn kill_switch_test_block() -> CmdResult<()> {
    block_all_outbound().map_err(Into::into)
}

#[tauri::command]
pub fn kill_switch_manual_unblock() -> CmdResult<()> {
    unblock_all_outbound().map_err(Into::into)
}
