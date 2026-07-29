//! 望仔 · 打开 Windows 系统还原向导
//! 望仔不直接执行还原（还原=提权+强制重启+回滚整机，不该由代理应用进程发起），
//! 只帮用户打开 Windows 自带的系统还原向导 GUI（rstrui.exe），
//! 还原点的选择、确认、重启都在系统向导里完成——守住边界，又省去用户去开始菜单搜索。
use super::CmdResult;

#[cfg(windows)]
#[tauri::command]
pub fn open_system_restore() -> CmdResult<()> {
    std::process::Command::new("rstrui.exe")
        .spawn()
        .map_err(|e| format!("打开系统还原向导失败: {e}（可去开始菜单搜“创建还原点”手动打开）"))?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn open_system_restore() -> CmdResult<()> {
    Err("系统还原仅 Windows 支持".into())
}
