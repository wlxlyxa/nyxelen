//! 望仔 · 物理网卡锁（只读 / 只删命令封装）
//! 见 core::firewall_allow 中关于"为何不提供 enable"的说明。
use super::CmdResult;

#[tauri::command]
pub fn list_physical_nics() -> Vec<String> {
    crate::core::firewall_allow::list_physical_nics()
}

#[tauri::command]
pub fn check_physical_nic_lock_status() -> bool {
    crate::core::firewall_allow::check_physical_nic_lock_status()
}

#[tauri::command]
pub fn disable_physical_nic_lock() -> CmdResult<()> {
    crate::core::firewall_allow::disable_physical_nic_lock();
    Ok(())
}