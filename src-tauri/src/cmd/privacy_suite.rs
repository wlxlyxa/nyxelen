//! 望仔 · 隐私套件（自包含：安全批 #04/#13 + 断网急救 + 还原点）
//! 本文件不依赖任何 core 子模块，helper 自带，避免 mod 声明遗漏导致编译失败。
//! 急救逻辑与项目根目录 emergency.ps1 同源：只修联网基础设施，不动隐私策略。
use super::CmdResult;

#[cfg(windows)]
fn run_ps(script: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt as _;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("调用 PowerShell 失败: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("PowerShell 执行失败: {err}"));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(not(windows))]
fn run_ps(_script: &str) -> Result<String, String> {
    Err("该功能目前仅支持 Windows".into())
}

// ===== #04 Teredo / 6to4 / ISATAP 隧道禁用 =====
#[tauri::command]
pub fn enable_teredo_protection() -> CmdResult<()> {
    run_ps("netsh interface teredo set state disabled | Out-Null")?;
    run_ps("netsh interface 6to4 set state state=disabled | Out-Null")?;
    run_ps("netsh interface isatap set state disabled | Out-Null")?;
    Ok(())
}

#[tauri::command]
pub fn disable_teredo_protection() -> CmdResult<()> {
    run_ps("netsh interface teredo set state default | Out-Null")?;
    run_ps("netsh interface 6to4 set state state=enabled | Out-Null")?;
    run_ps("netsh interface isatap set state enabled | Out-Null")?;
    Ok(())
}

#[tauri::command]
pub fn check_teredo_protection_status() -> bool {
    #[cfg(windows)]
    {
        let off = |s: &str| s.trim().eq_ignore_ascii_case("true");
        let t = run_ps(
            "(netsh interface teredo show state | Out-String) -match 'disabled|禁用'",
        )
        .unwrap_or_default();
        let s = run_ps(
            "(netsh interface 6to4 show state | Out-String) -match 'disabled|禁用'",
        )
        .unwrap_or_default();
        let i = run_ps(
            "(netsh interface isatap show state | Out-String) -match 'disabled|禁用'",
        )
        .unwrap_or_default();
        off(&t) && off(&s) && off(&i)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

// ===== #13 局域网广播族全关 =====
const BCAST_SERVICES: &[&str] = &["SSDPSRV", "upnphost", "FDResPub", "WMPNetworkSvc"];

#[tauri::command]
pub fn enable_broadcast_protection() -> CmdResult<()> {
    run_ps(
        r#"New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Name 'EnableMulticast' -Value 0 -Type DWord"#,
    )?;
    for s in BCAST_SERVICES {
        let _ = run_ps(&format!(
            "Stop-Service -Name '{s}' -Force -ErrorAction SilentlyContinue; Set-Service -Name '{s}' -StartupType Manual -ErrorAction SilentlyContinue"
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn disable_broadcast_protection() -> CmdResult<()> {
    run_ps(
        r#"Remove-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Name 'EnableMulticast' -ErrorAction SilentlyContinue"#,
    )?;
    for s in BCAST_SERVICES {
        let _ = run_ps(&format!(
            "Set-Service -Name '{s}' -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service -Name '{s}' -ErrorAction SilentlyContinue"
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn check_broadcast_protection_status() -> bool {
    #[cfg(windows)]
    {
        run_ps(
            r#"(Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Name 'EnableMulticast' -ErrorAction SilentlyContinue).EnableMulticast -eq 0"#,
        )
        .map(|v| v.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

// ===== 断网急救（与 emergency.ps1 同源，只修联网基础设施） =====
#[tauri::command]
pub fn emergency_rescue() -> CmdResult<()> {
    let script = r#"
Get-NetFirewallRule -DisplayName '望仔-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName '望仔-KillSwitch' -ErrorAction SilentlyContinue
$ips='HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
Set-ItemProperty -Path $ips -Name ProxyEnable -Value 0 -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $ips -Name ProxyServer -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $ips -Name AutoConfigURL -ErrorAction SilentlyContinue
Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object { Enable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue }
Restart-Service -Name Dnscache -Force -ErrorAction SilentlyContinue
ipconfig /flushdns | Out-Null
Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { Disable-NetAdapter -Name $_.Name -Confirm:$false -ErrorAction SilentlyContinue; Enable-NetAdapter -Name $_.Name -Confirm:$false -ErrorAction SilentlyContinue }
netsh winsock reset | Out-Null; netsh int ip reset | Out-Null; netsh int ipv4 reset | Out-Null; netsh int ipv6 reset | Out-Null
"#;
    run_ps(script)?;
    Ok(())
}

// ===== 防线③：创建系统还原点 =====
#[tauri::command]
pub fn create_system_restore_point() -> CmdResult<()> {
    run_ps(
        "Checkpoint-Computer -Description '望仔-高危操作前' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop | Out-Null",
    )?;
    Ok(())
}

/// 一次 PowerShell 进程启动，合并查询 Teredo(三合一) + 广播族，
/// 专治“进设置页卡 10 秒”：原来要串行起 4 次 powershell.exe 冷启动。
#[derive(serde::Serialize)]
pub struct PrivacySuiteStatus {
    pub teredo: bool,
    pub bcast: bool,
}

#[tauri::command]
pub fn check_privacy_suite_status() -> PrivacySuiteStatus {
    #[cfg(windows)]
    {
        let script = r#"$t=(netsh interface teredo show state|Out-String) -match 'disabled|禁用'; $s=(netsh interface 6to4 show state|Out-String) -match 'disabled|禁用'; $i=(netsh interface isatap show state|Out-String) -match 'disabled|禁用'; $b=(Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Name 'EnableMulticast' -ErrorAction SilentlyContinue).EnableMulticast -eq 0; "$($t -and $s -and $i)|$b""#;
        match run_ps(script) {
            Ok(out) => {
                let mut parts = out.split('|');
                let teredo = parts
                    .next()
                    .map(|s| s.trim().eq_ignore_ascii_case("true"))
                    .unwrap_or(false);
                let bcast = parts
                    .next()
                    .map(|s| s.trim().eq_ignore_ascii_case("true"))
                    .unwrap_or(false);
                PrivacySuiteStatus { teredo, bcast }
            }
            Err(_) => PrivacySuiteStatus {
                teredo: false,
                bcast: false,
            },
        }
    }
    #[cfg(not(windows))]
    {
        PrivacySuiteStatus {
            teredo: false,
            bcast: false,
        }
    }
}