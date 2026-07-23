//! 望仔 · 全局禁用 IPv6
//! 双管齐下：
//!   1. 立即执行 Disable-NetAdapterBinding，马上生效，不用重启
//!   2. 顺手把注册表 DisabledComponents 设成 0xFF，保证以后每次开机
//!      IPv6（包括隧道接口）都保持关闭，不会重启后又恢复
//!
//! 来源：微软官方文档 + CIS 安全基线双重确认的标准做法，非野路子。
//! 注意：第 2 步注册表设置需要重启电脑才能完全生效，第 1 步已经保证了
//! "现在立刻"的防泄漏效果，重启只是让保护更彻底（包含隧道接口）。

use super::CmdResult;
use crate::process::AsyncHandler;
use std::time::Duration;

const REG_PATH: &str = r"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters";
const REG_VALUE: &str = "DisabledComponents";
const DISABLE_VALUE: u32 = 0xFF;
const REAPPLY_RETRY_TIMES: u32 = 5;
const REAPPLY_RETRY_INTERVAL: Duration = Duration::from_millis(800);
/// TUN 虚拟网卡的名称关键字（沿用 watchdog.rs 里确认过的固定描述字符串）
const TUN_ADAPTER_NAME_HINT: &str = "Meta Tunnel";

/// 检查 TUN 网卡当前是否已经出现在 Get-NetAdapter 列表里（Up 状态）。
/// 用一次显式查询，而不是依赖"禁用命令的退出码"来判断网卡是否存在——
/// 后者即使网卡不存在也会返回成功（SilentlyContinue 吞掉的是"处理失败"，
/// 不是"网卡缺席"，二者不能等价）。
#[cfg(windows)]
fn tun_adapter_present() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.InterfaceDescription -like '*Meta Tunnel*'}).Count",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.trim().parse::<u32>().unwrap_or(0) > 0
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn tun_adapter_present() -> bool {
    false
}

/// 供 CoreManager 在 service 模式下 TUN 网卡创建成功后调用。
/// 只有当用户之前开启过 IPv6 防泄漏时才生效。
/// 轮询确认 TUN 网卡真的出现在系统里之后，才执行禁用绑定；
/// 不能依赖禁用命令本身的退出码作为"网卡已就绪"的信号。
#[cfg(windows)]
pub fn reapply_after_tun_start() {
    if read_registry() != Some(DISABLE_VALUE) {
        return;
    }

    AsyncHandler::spawn(|| async move {
        for attempt in 0..REAPPLY_RETRY_TIMES {
            tokio::time::sleep(REAPPLY_RETRY_INTERVAL).await;

            let present = tokio::task::spawn_blocking(tun_adapter_present).await.unwrap_or(false);

            if !present {
                crate::logging!(
                    warn,
                    crate::Type::Core,
                    "TUN 网卡尚未就绪，等待重试（第 {}/{} 次）",
                    attempt + 1,
                    REAPPLY_RETRY_TIMES
                );
                continue;
            }

            // 确认网卡已出现，再执行真正的禁用操作
            let result = tokio::task::spawn_blocking(|| {
                run_powershell(
                    "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | ForEach-Object { Disable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue }",
                )
            })
            .await;

            match result {
                Ok(Ok(())) => {
                    crate::logging!(
                        info,
                        crate::Type::Core,
                        "IPv6 防泄漏已对 TUN 网卡重新应用（第 {} 次尝试确认网卡就绪后执行）",
                        attempt + 1
                    );
                    return;
                }
                Ok(Err(e)) => {
                    crate::logging!(warn, crate::Type::Core, "重新应用 IPv6 禁用失败: {}", e);
                    return;
                }
                Err(e) => {
                    crate::logging!(warn, crate::Type::Core, "任务执行失败: {}", e);
                    return;
                }
            }
        }

        crate::logging!(
            warn,
            crate::Type::Core,
            "等待 {} 次后 TUN 网卡仍未就绪，放弃本次 IPv6 重新应用",
            REAPPLY_RETRY_TIMES
        );
    });
}

#[cfg(not(windows))]
pub fn reapply_after_tun_start() {}
#[cfg(windows)]
fn run_powershell(script: &str) -> Result<(), String> {
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
    Ok(())
}

#[cfg(windows)]
fn write_registry(value: u32) -> Result<(), String> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let (key, _) = hklm
        .create_subkey(REG_PATH)
        .map_err(|e| format!("写入注册表失败（需要管理员权限）: {e}"))?;
    key.set_value(REG_VALUE, &value)
        .map_err(|e| format!("设置 DisabledComponents 失败: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn read_registry() -> Option<u32> {
    use winreg::RegKey;
    let hklm = RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE);
    hklm.open_subkey(REG_PATH)
        .ok()
        .and_then(|key| key.get_value::<u32, _>(REG_VALUE).ok())
}

#[cfg(not(windows))]
fn run_powershell(_script: &str) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}
#[cfg(not(windows))]
fn write_registry(_value: u32) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}
#[cfg(not(windows))]
fn read_registry() -> Option<u32> {
    None
}

/// 立即禁用所有网卡的 IPv6 绑定 + 写入注册表保证重启后依然禁用
#[tauri::command]
pub fn enable_ipv6_block() -> CmdResult<()> {
    // 立即生效这步允许部分失败（比如某些虚拟网卡本来就没有ms_tcpip6绑定），
    // 不因为个别网卡失败就中断整体流程
    // 只处理 Up 状态的网卡（含 TUN 虚拟网卡），跳过已禁用的网卡，减少循环开销
    let _ = run_powershell(
        "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | ForEach-Object { Disable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue }",
    );
    write_registry(DISABLE_VALUE)?;
    Ok(())
}

/// 恢复 IPv6：重新绑定所有网卡 + 清空注册表设置
#[tauri::command]
pub fn disable_ipv6_block() -> CmdResult<()> {
    let _ = run_powershell(
        "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | ForEach-Object { Enable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue }",
    );
    write_registry(0)?;
    Ok(())
}

/// 查询当前状态（只看注册表这个持久化标记，作为"用户是否开启过这个开关"的依据）
#[tauri::command]
pub fn check_ipv6_block_status() -> CmdResult<bool> {
    Ok(read_registry() == Some(DISABLE_VALUE))
}
