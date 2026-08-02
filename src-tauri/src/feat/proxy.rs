use crate::{
    config::{Config, IVerge},
    core::handle,
};
use clash_verge_logging::{Type, logging};
use std::env;
use tauri_plugin_clipboard_manager::ClipboardExt as _;

/// Toggle system proxy on/off
pub async fn toggle_system_proxy() -> bool {
    let verge = Config::verge().await;
    let current = verge.latest_arc().enable_system_proxy.unwrap_or(false);
    let auto_close_connection = verge.latest_arc().auto_close_connection.unwrap_or(false);

    // 如果当前系统代理即将关闭，且自动关闭连接设置为true，则关闭所有连接
    if current
        && auto_close_connection
        && let Err(err) = handle::Handle::mihomo().await.close_all_connections().await
    {
        logging!(error, Type::ProxyMode, "Failed to close all connections: {err}");
    }

    let requested = !current;
    let patch_result = super::patch_verge(
        &IVerge {
            enable_system_proxy: Some(requested),
            ..IVerge::default()
        },
        false,
    )
    .await;

    match patch_result {
        Ok(_) => {
            handle::Handle::refresh_verge();
            requested
        }
        Err(err) => {
            logging!(error, Type::ProxyMode, "{err}");
            current
        }
    }
}

/// Toggle TUN mode on/off
/// Returns the updated toggle state
pub async fn toggle_tun_mode(not_save_file: Option<bool>) -> bool {
    let current = Config::verge().await.latest_arc().enable_tun_mode.unwrap_or(false);
    let enable = !current;

    match super::patch_verge(
        &IVerge {
            enable_tun_mode: Some(enable),
            ..IVerge::default()
        },
        not_save_file.unwrap_or(false),
    )
    .await
    {
        Ok(_) => {
            handle::Handle::refresh_verge();
            // 块2-A：关 TUN 后，后台等 Meta 虚拟网卡消失；超时仍残留则尝试强制禁用。
            // 后台跑、不阻塞 toggle 返回（用户关 TUN 不卡）。
            if !enable {
                tokio::spawn(async {
                    wait_for_tun_adapter_gone().await;
                    if tun_adapter_present() {
                        if let Err(e) = force_release_tun_adapter().await {
                            logging!(warn, Type::ProxyMode, "TUN 虚拟网卡残留，强制释放失败（可能需管理员权限）: {e}");
                        }
                    }
                });
            }
            enable
        }
        Err(err) => {
            logging!(error, Type::ProxyMode, "{err}");
            current
        }
    }
}

/// 检测 Meta（Meta Tunnel）虚拟网卡是否仍在（Status Up）。
/// 按 InterfaceDescription 精确匹配 "Meta Tunnel"，不误伤其他网卡。
fn tun_adapter_present() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -like '*Meta Tunnel*' }).Count",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .trim()
            .parse::<i32>()
            .map(|n| n > 0)
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// 关 TUN 后轮询等 Meta 消失（最多约 4 秒：8 次 × 500ms）。
async fn wait_for_tun_adapter_gone() {
    for _ in 0..8 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if !tun_adapter_present() {
            return;
        }
    }
}

/// 强制释放残留的 Meta 虚拟网卡：禁用它（只精确匹配 Meta Tunnel，可逆）。
/// 需管理员权限；权限不足返回 Err（前端降级提示用户手动）。
/// 注意：这是"禁用"(Down) 不是"删除"——设备仍在驱动里，但不再抓流量，套娃解除。
async fn force_release_tun_adapter() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let script = "Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*Meta Tunnel*' } | Disable-NetAdapter -Confirm:$false -ErrorAction Stop";
    let out = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .await
        .map_err(|e| format!("调用 PowerShell 失败: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "禁用 Meta 网卡失败（可能需要管理员权限）: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

#[tauri::command]
pub fn check_tun_adapter_present_cmd() -> bool {
    tun_adapter_present()
}

#[tauri::command]
pub async fn force_release_tun_adapter_cmd() -> Result<String, String> {
    force_release_tun_adapter()
        .await
        .map(|_| "已强制释放 TUN 虚拟网卡".to_string())
}

/// Copy proxy environment variables to clipboard
pub async fn copy_clash_env() {
    let env_ip = env::var("CLASH_VERGE_REV_IP").ok();
    let verge_cfg = Config::verge().await.latest_arc();
    let ip = env_ip
        .as_deref()
        .unwrap_or_else(|| verge_cfg.proxy_host.as_deref().unwrap_or("127.0.0.1"));

    let app_handle = handle::Handle::app_handle();
    let port = verge_cfg.verge_mixed_port.unwrap_or(7897);
    let http_proxy = format!("http://{ip}:{port}");
    let socks5_proxy = format!("socks5://{ip}:{port}");

    let clipboard = app_handle.clipboard();

    let default_env = {
        #[cfg(not(target_os = "windows"))]
        {
            "bash"
        }
        #[cfg(target_os = "windows")]
        {
            "powershell"
        }
    };
    let env_type = verge_cfg.env_type.as_deref().unwrap_or(default_env);

    let export_text = match env_type {
        "bash" => format!("export https_proxy={http_proxy} http_proxy={http_proxy} all_proxy={socks5_proxy}"),
        "cmd" => format!("set http_proxy={http_proxy}\r\nset https_proxy={http_proxy}"),
        "powershell" => {
            format!("$env:HTTP_PROXY=\"{http_proxy}\"; $env:HTTPS_PROXY=\"{http_proxy}\"")
        }
        "nushell" => {
            format!("load-env {{ http_proxy: \"{http_proxy}\", https_proxy: \"{http_proxy}\" }}")
        }
        "fish" => format!("set -x http_proxy {http_proxy}; set -x https_proxy {http_proxy}"),
        _ => {
            logging!(error, Type::ProxyMode, "copy_clash_env: Invalid env type! {env_type}");
            return;
        }
    };

    if clipboard.write_text(&export_text).is_err() {
        logging!(error, Type::ProxyMode, "Failed to write to clipboard");
    }
}
