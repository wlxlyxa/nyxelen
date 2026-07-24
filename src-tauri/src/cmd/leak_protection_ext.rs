//! 望仔 · 深度防泄漏扩展（NCSI / QUIC / WPAD / OCSP / LLMNR / DNS 缓存）
//! 全部为 Windows 注册表 / 浏览器策略 / 系统命令操作，照搬 webrtc_control 的同构结构。
//! 每个功能提供 enable_*（开启防护）/ disable_*（恢复默认）/ check_*_status（查询当前是否已防护）。
//! 注意：OCSP 与 LLMNR 的注册表键采用业界通用方向；若个别系统路径不同，check 会返回 false，
//! 但不会崩溃，enable/disable 也会给出明确错误提示。

use super::CmdResult;

#[derive(Clone, Copy)]
enum Root {
    Hklm,
    Hkcu,
}

#[cfg(windows)]
fn predef(r: Root) -> winreg::RegKey {
    match r {
        Root::Hklm => winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE),
        Root::Hkcu => winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER),
    }
}

#[cfg(windows)]
fn write_dword(r: Root, path: &str, name: &str, val: u32) -> Result<(), String> {
    let root = predef(r);
    let (key, _disposition) = root
        .create_subkey(path)
        .map_err(|e| format!("写入注册表失败（可能需要以管理员身份运行望仔）: {e}"))?;
    key.set_value(name, &val)
        .map_err(|e| format!("设置注册表值失败: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn delete_value(r: Root, path: &str, name: &str) -> Result<(), String> {
    let root = predef(r);
    match root.open_subkey_with_flags(path, winreg::enums::KEY_SET_VALUE) {
        Ok(key) => {
            let _ = key.delete_value(name);
            Ok(())
        }
        Err(_) => Ok(()),
    }
}

#[cfg(windows)]
fn read_dword_eq(r: Root, path: &str, name: &str, expect: u32) -> bool {
    let root = predef(r);
    match root.open_subkey(path) {
        Ok(key) => matches!(key.get_value::<u32, _>(name), Ok(v) if v == expect),
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn write_dword(_r: Root, _path: &str, _name: &str, _val: u32) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}

#[cfg(not(windows))]
fn delete_value(_r: Root, _path: &str, _name: &str) -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}

#[cfg(not(windows))]
fn read_dword_eq(_r: Root, _path: &str, _name: &str, _expect: u32) -> bool {
    false
}

#[cfg(windows)]
fn flush_dns() -> Result<(), String> {
    use std::os::windows::process::CommandExt as _;
    std::process::Command::new("ipconfig")
        .arg("/flushdns")
        .creation_flags(0x0800_0000)
        .output()
        .map_err(|e| format!("清空 DNS 缓存失败: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn flush_dns() -> Result<(), String> {
    Err("该功能目前仅支持 Windows".into())
}

// ===== 1. NCSI 直连阻断 =====
const NCSI_PATH: &str = r"SYSTEM\CurrentControlSet\Services\NlaSvc\Parameters\Internet";

#[tauri::command]
pub fn enable_ncsi_protection() -> CmdResult<()> {
    write_dword(Root::Hklm, NCSI_PATH, "EnableActiveProbing", 0)?;
    Ok(())
}

#[tauri::command]
pub fn disable_ncsi_protection() -> CmdResult<()> {
    write_dword(Root::Hklm, NCSI_PATH, "EnableActiveProbing", 1)?;
    Ok(())
}

#[tauri::command]
pub fn check_ncsi_protection_status() -> CmdResult<bool> {
    Ok(read_dword_eq(Root::Hklm, NCSI_PATH, "EnableActiveProbing", 0))
}

// ===== 2. QUIC / HTTP3 阻断（Chrome + Edge 策略） =====
const CHROME_POLICY_PATH: &str = r"SOFTWARE\Policies\Google\Chrome";
const EDGE_POLICY_PATH: &str = r"SOFTWARE\Policies\Microsoft\Edge";

#[tauri::command]
pub fn enable_quic_protection() -> CmdResult<()> {
    write_dword(Root::Hklm, CHROME_POLICY_PATH, "QuicAllowed", 0)?;
    write_dword(Root::Hklm, EDGE_POLICY_PATH, "QuicAllowed", 0)?;
    Ok(())
}

#[tauri::command]
pub fn disable_quic_protection() -> CmdResult<()> {
    delete_value(Root::Hklm, CHROME_POLICY_PATH, "QuicAllowed")?;
    delete_value(Root::Hklm, EDGE_POLICY_PATH, "QuicAllowed")?;
    Ok(())
}

#[tauri::command]
pub fn check_quic_protection_status() -> CmdResult<bool> {
    Ok(
        read_dword_eq(Root::Hklm, CHROME_POLICY_PATH, "QuicAllowed", 0)
            && read_dword_eq(Root::Hklm, EDGE_POLICY_PATH, "QuicAllowed", 0),
    )
}

// ===== 3. WPAD 自动代理发现关闭（HKCU，无需管理员） =====
const WPAD_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

#[tauri::command]
pub fn enable_wpad_protection() -> CmdResult<()> {
    write_dword(Root::Hkcu, WPAD_PATH, "AutoDetect", 0)?;
    let _ = delete_value(Root::Hkcu, WPAD_PATH, "AutoConfigURL");
    Ok(())
}

#[tauri::command]
pub fn disable_wpad_protection() -> CmdResult<()> {
    write_dword(Root::Hkcu, WPAD_PATH, "AutoDetect", 1)?;
    Ok(())
}

#[tauri::command]
pub fn check_wpad_protection_status() -> CmdResult<bool> {
    Ok(read_dword_eq(Root::Hkcu, WPAD_PATH, "AutoDetect", 0))
}

// ===== 4. 在线证书检查（根证书自动更新）关闭 =====
const OCSP_PATH: &str = r"SOFTWARE\Policies\Microsoft\SystemCertificates\AuthRoot";

#[tauri::command]
pub fn enable_ocsp_protection() -> CmdResult<()> {
    write_dword(Root::Hklm, OCSP_PATH, "DisableRootAutoUpdate", 1)?;
    Ok(())
}

#[tauri::command]
pub fn disable_ocsp_protection() -> CmdResult<()> {
    delete_value(Root::Hklm, OCSP_PATH, "DisableRootAutoUpdate")?;
    Ok(())
}

#[tauri::command]
pub fn check_ocsp_protection_status() -> CmdResult<bool> {
    Ok(read_dword_eq(
        Root::Hklm,
        OCSP_PATH,
        "DisableRootAutoUpdate",
        1,
    ))
}

// ===== 5. 局域网名称解析（LLMNR / mDNS 多播）防护 =====
const LLMNR_PATH: &str = r"SOFTWARE\Policies\Microsoft\Windows NT\DNSClient";

#[tauri::command]
pub fn enable_llmnr_protection() -> CmdResult<()> {
    write_dword(Root::Hklm, LLMNR_PATH, "EnableMulticast", 0)?;
    Ok(())
}

#[tauri::command]
pub fn disable_llmnr_protection() -> CmdResult<()> {
    delete_value(Root::Hklm, LLMNR_PATH, "EnableMulticast")?;
    Ok(())
}

#[tauri::command]
pub fn check_llmnr_protection_status() -> CmdResult<bool> {
    Ok(read_dword_eq(Root::Hklm, LLMNR_PATH, "EnableMulticast", 0))
}

// ===== 6. DNS 缓存防护（开启即清一次系统 DNS 缓存；状态存配置） =====
#[tauri::command]
pub fn enable_dns_cache_guard() -> CmdResult<()> {
    flush_dns()?;
    Ok(())
}

#[tauri::command]
pub fn disable_dns_cache_guard() -> CmdResult<()> {
    Ok(())
}

#[tauri::command]
pub async fn check_dns_cache_guard_status() -> CmdResult<bool> {
    Ok(crate::config::Config::verge()
        .await
        .data_arc()
        .dns_cache_guard
        .unwrap_or(false))
}
/// 供内核配置重载 / 重启成功后调用：若用户开启了「DNS 缓存防护」，
/// 自动清空一次系统 DNS 缓存，消除切换配置 / 重启内核后旧直连解析残留造成的泄漏窗口。
/// 注意：单纯切节点不经过配置重载，故本钩子不覆盖切节点（如需覆盖须在前端切节点处另挂）。
pub async fn flush_dns_if_guard_enabled() {
    let enabled = crate::config::Config::verge()
        .await
        .data_arc()
        .dns_cache_guard
        .unwrap_or(false);
    if enabled {
        let _ = flush_dns();
    }
}