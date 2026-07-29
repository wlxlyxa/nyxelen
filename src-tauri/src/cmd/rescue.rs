//! 望仔 · 应用内断网急救启动器
//! 点击按钮 → 自动弹 UAC 提权 → 以管理员运行打包在 resources 里的 emergency.ps1。
//! 这样即使望仔本身不是管理员启动，急救也能删掉 SYSTEM 创建的防火墙规则。
use super::CmdResult;
use tauri::Manager as _;

#[cfg(windows)]
#[tauri::command]
pub fn launch_rescue(app: tauri::AppHandle) -> CmdResult<()> {
    use std::os::windows::process::CommandExt as _;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    // 兼容打包后脚本在资源根目录或 resources 子目录两种情况
    let candidates = [
        app.path()
            .resolve("emergency.ps1", tauri::path::BaseDirectory::Resource),
        app.path()
            .resolve("resources/emergency.ps1", tauri::path::BaseDirectory::Resource),
    ];
    let ps1 = candidates
        .into_iter()
        .filter_map(|c| c.ok())
        .find(|p| p.exists())
        .ok_or_else(|| "未找到急救脚本 emergency.ps1，请确认它已放进 src-tauri/resources/ 并重新打包".to_string())?;
    // Start-Process -Verb RunAs 弹 UAC 提权，以管理员跑急救脚本
    let cmd = format!(
        "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'",
        ps1.display()
    );
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &cmd])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("启动急救失败: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn launch_rescue(_app: tauri::AppHandle) -> CmdResult<()> {
    Err("断网急救目前仅支持 Windows".into())
}
