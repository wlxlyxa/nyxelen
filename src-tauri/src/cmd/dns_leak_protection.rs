//! 望仔 · DNS 防泄漏（浏览器安全DNS + Windows智能多宿主解析）
//! 拆成两组独立命令，方便前端做"主开关统一控制 + 子选项单独关闭"的界面。
//!
//! 1. DoH：浏览器自带"安全DNS"会绕开系统DNS配置，直连公共DoH服务器，
//!    不受望仔 TUN 模式的 dns-hijack 规则约束，需要企业策略强制关闭。
//! 2. SMHNR：Windows"智能多宿主名称解析"，多网卡时会同时向所有网卡发DNS查询，
//!    可能导致 DNS 请求从物理网卡泄露给运营商，即使 TUN 已启用。
//!
//! 来源均为官方文档记载的策略机制：
//!   - Chrome/Edge: DnsOverHttpsMode = "off"
//!   - Windows: DNSClient\DisableSmartNameResolution = 1, EnableMultiCast = 0

use super::CmdResult;

const CHROME_PATH: &str = r"SOFTWARE\Policies\Google\Chrome";
const EDGE_PATH: &str = r"SOFTWARE\Policies\Microsoft\Edge";
const DNSCLIENT_PATH: &str = r"SOFTWARE\Policies\Microsoft\Windows NT\DNSClient";

#[cfg(windows)]
mod win {
    use winreg::RegKey;
    use winreg::enums::*;

    pub fn write_string(reg_path: &str, value_name: &str, value_data: &str) -> Result<(), String> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let (key, _) = hklm
            .create_subkey(reg_path)
            .map_err(|e| format!("写入注册表失败（可能需要以管理员身份运行望仔）: {e}"))?;
        key.set_value(value_name, &value_data)
            .map_err(|e| format!("设置策略值失败: {e}"))?;
        Ok(())
    }

    pub fn write_dword(reg_path: &str, value_name: &str, value_data: u32) -> Result<(), String> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let (key, _) = hklm
            .create_subkey(reg_path)
            .map_err(|e| format!("写入注册表失败（可能需要以管理员身份运行望仔）: {e}"))?;
        key.set_value(value_name, &value_data)
            .map_err(|e| format!("设置策略值失败: {e}"))?;
        Ok(())
    }

    pub fn remove_value(reg_path: &str, value_name: &str) -> Result<(), String> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        match hklm.open_subkey_with_flags(reg_path, KEY_SET_VALUE) {
            Ok(key) => {
                let _ = key.delete_value(value_name);
                Ok(())
            }
            Err(_) => Ok(()),
        }
    }

    pub fn read_string_matches(reg_path: &str, value_name: &str, expected: &str) -> bool {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        match hklm.open_subkey(reg_path) {
            Ok(key) => {
                let v: Result<String, _> = key.get_value(value_name);
                matches!(v, Ok(s) if s == expected)
            }
            Err(_) => false,
        }
    }

    pub fn read_dword_matches(reg_path: &str, value_name: &str, expected: u32) -> bool {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        match hklm.open_subkey(reg_path) {
            Ok(key) => {
                let v: Result<u32, _> = key.get_value(value_name);
                matches!(v, Ok(n) if n == expected)
            }
            Err(_) => false,
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn write_string(_a: &str, _b: &str, _c: &str) -> Result<(), String> {
        Err("该功能目前仅支持 Windows".into())
    }
    pub fn write_dword(_a: &str, _b: &str, _c: u32) -> Result<(), String> {
        Err("该功能目前仅支持 Windows".into())
    }
    pub fn remove_value(_a: &str, _b: &str) -> Result<(), String> {
        Err("该功能目前仅支持 Windows".into())
    }
    pub fn read_string_matches(_a: &str, _b: &str, _c: &str) -> bool {
        false
    }
    pub fn read_dword_matches(_a: &str, _b: &str, _c: u32) -> bool {
        false
    }
}

// ==================== DoH（浏览器安全DNS）====================

/// 关闭 Chrome/Edge 的"安全DNS"(DoH)
#[tauri::command]
pub fn enable_doh_block() -> CmdResult<()> {
    win::write_string(CHROME_PATH, "DnsOverHttpsMode", "off")?;
    win::write_string(EDGE_PATH, "DnsOverHttpsMode", "off")?;
    Ok(())
}

/// 恢复浏览器"安全DNS"默认行为
#[tauri::command]
pub fn disable_doh_block() -> CmdResult<()> {
    win::remove_value(CHROME_PATH, "DnsOverHttpsMode")?;
    win::remove_value(EDGE_PATH, "DnsOverHttpsMode")?;
    Ok(())
}

#[tauri::command]
pub fn check_doh_block_status() -> CmdResult<bool> {
    Ok(win::read_string_matches(CHROME_PATH, "DnsOverHttpsMode", "off")
        && win::read_string_matches(EDGE_PATH, "DnsOverHttpsMode", "off"))
}

// ==================== SMHNR（Windows 智能多宿主解析）====================

/// 关闭 Windows 智能多宿主名称解析 + LLMNR 广播查询
#[tauri::command]
pub fn enable_smhnr_protection() -> CmdResult<()> {
    win::write_dword(DNSCLIENT_PATH, "DisableSmartNameResolution", 1)?;
    win::write_dword(DNSCLIENT_PATH, "EnableMultiCast", 0)?;
    Ok(())
}

/// 恢复 Windows 默认的多宿主解析行为
#[tauri::command]
pub fn disable_smhnr_protection() -> CmdResult<()> {
    win::remove_value(DNSCLIENT_PATH, "DisableSmartNameResolution")?;
    win::remove_value(DNSCLIENT_PATH, "EnableMultiCast")?;
    Ok(())
}

#[tauri::command]
pub fn check_smhnr_protection_status() -> CmdResult<bool> {
    Ok(win::read_dword_matches(DNSCLIENT_PATH, "DisableSmartNameResolution", 1)
        && win::read_dword_matches(DNSCLIENT_PATH, "EnableMultiCast", 0))
}
