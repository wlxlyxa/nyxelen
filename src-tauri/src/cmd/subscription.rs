//! 望仔 · 通用订阅下载：返回 URL 原始文本，前端识别 base64 / sing-box json / clash yaml
use super::CmdResult;

#[cfg(windows)]
#[tauri::command]
pub fn download_subscription_text(url: String) -> CmdResult<String> {
    use std::os::windows::process::CommandExt as _;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let escaped = url.replace('\'', "''");
    let script = format!(
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -Uri '{escaped}' -UseBasicParsing -TimeoutSec 30).Content"
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("调用 PowerShell 失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("下载订阅失败: {stderr}").into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn download_subscription_text(_url: String) -> CmdResult<String> {
    Err("通用订阅下载目前仅支持 Windows".into())
}
