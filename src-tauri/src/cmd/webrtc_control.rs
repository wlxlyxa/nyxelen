//! 望仔 · WebRTC 防泄漏控制
//! 原理：写入 Chrome / Edge 各自官方支持的企业策略注册表项，
//! 强制这两个浏览器的 WebRTC 流量必须走代理，不允许绕过代理直连暴露真实 IP。
//!
//! 注意：Chrome 和 Edge 虽然同为 Chromium 内核，但这个策略的命名和取值格式
//! 是各自独立定义的，不能直接照搬：
//!   - Chrome: 值名 WebRtcIPHandling，取值 disable_non_proxied_udp（下划线小写）
//!   - Edge:   值名 WebRtcLocalhostIpHandling，取值 DisableNonProxiedUdp（驼峰）
//!
//! 副作用（已告知用户）：Chrome/Edge 设置页会显示"您的浏览器由您的组织管理"提示，
//! 这是 Windows 展示托管策略的标准行为。

use super::CmdResult;

struct BrowserPolicy {
    reg_path: &'static str,
    value_name: &'static str,
    value_data: &'static str,
}

const CHROME_POLICY: BrowserPolicy = BrowserPolicy {
    reg_path: r"SOFTWARE\Policies\Google\Chrome",
    value_name: "WebRtcIPHandling",
    value_data: "disable_non_proxied_udp",
};

const EDGE_POLICY: BrowserPolicy = BrowserPolicy {
    reg_path: r"SOFTWARE\Policies\Microsoft\Edge",
    value_name: "WebRtcLocalhostIpHandling",
    value_data: "disable_non_proxied_udp",
};

#[cfg(windows)]
fn write_policy(policy: &BrowserPolicy) -> Result<(), String> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let (key, _disposition) = hklm
        .create_subkey(policy.reg_path)
        .map_err(|e| format!("写入注册表失败（可能需要以管理员身份运行 Nyxelen）: {e}"))?;
    key.set_value(policy.value_name, &policy.value_data)
        .map_err(|e| format!("设置策略值失败: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn remove_policy(policy: &BrowserPolicy) -> Result<(), String> {
    use winreg::RegKey;
    use winreg::enums::*;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    match hklm.open_subkey_with_flags(policy.reg_path, KEY_SET_VALUE) {
        Ok(key) => {
            let _ = key.delete_value(policy.value_name);
            Ok(())
        }
        Err(_) => Ok(()),
    }
}

#[cfg(windows)]
fn read_policy(policy: &BrowserPolicy) -> bool {
    use winreg::RegKey;

    let hklm = RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE);
    match hklm.open_subkey(policy.reg_path) {
        Ok(key) => {
            let value: Result<String, _> = key.get_value(policy.value_name);
            matches!(value, Ok(v) if v == policy.value_data)
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn write_policy(_policy: &BrowserPolicy) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}

#[cfg(not(windows))]
fn remove_policy(_policy: &BrowserPolicy) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}

#[cfg(not(windows))]
fn read_policy(_policy: &BrowserPolicy) -> bool {
    false
}

/// 打开 WebRTC 防泄漏（Chrome + Edge）
#[tauri::command]
pub fn enable_webrtc_control() -> CmdResult<()> {
    write_policy(&CHROME_POLICY)?;
    write_policy(&EDGE_POLICY)?;
    Ok(())
}

/// 关闭 WebRTC 防泄漏（Chrome + Edge），恢复浏览器默认行为
#[tauri::command]
pub fn disable_webrtc_control() -> CmdResult<()> {
    remove_policy(&CHROME_POLICY)?;
    remove_policy(&EDGE_POLICY)?;
    Ok(())
}

/// 查询当前是否已开启（两个浏览器都设置了才算开启，任一未设置视为关闭）
#[tauri::command]
pub fn check_webrtc_control_status() -> CmdResult<bool> {
    Ok(read_policy(&CHROME_POLICY) && read_policy(&EDGE_POLICY))
}
