//! 望仔 · 隐私操作 + 断网急救（系统级，自包含）
//! 本模块不依赖 leak_protection_ext / verge 等任何模块，helper 全部自带，
//! 以保证无论磁盘处于何种中间态都能独立编译、不与已有代码冲突。
//! 急救逻辑与项目根目录 emergency.ps1 同源：只修联网基础设施，不动隐私策略。

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
#[cfg(windows)]
pub fn enable_teredo_protection() -> Result<(), String> {
    run_ps("netsh interface teredo set state disabled | Out-Null; netsh interface 6to4 set state state=disabled | Out-Null; netsh interface isatap set state disabled | Out-Null")?;
    Ok(())
}
#[cfg(windows)]
pub fn disable_teredo_protection() -> Result<(), String> {
    run_ps("netsh interface teredo set state default | Out-Null")?;
    run_ps("netsh interface 6to4 set state state=enabled | Out-Null")?;
    run_ps("netsh interface isatap set state enabled | Out-Null")?;
    Ok(())
}
/// 三者皆 disabled 才算已防护。注意：powershell 的 -match 输出 "True"/"False"，
/// 必须判断是否等于 True，绝不能用 is_empty()（"False" 也不是空串）。
pub fn check_teredo_protection_status() -> bool {
    #[cfg(windows)]
    {
        let is_off = |out: &str| out.trim().eq_ignore_ascii_case("true");
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
        is_off(&t) && is_off(&s) && is_off(&i)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

// ===== #13 局域网广播族全关（LLMNR 注册表 + 其余停服务，全部幂等不崩） =====
const BCAST_SERVICES: &[&str] = &[
    "SSDPSRV",       // SSDP / UPnP 发现
    "upnphost",      // UPnP 设备宿主
    "FDResPub",      // WS-Discovery 资源发布
    "WMPNetworkSvc", // 网络共享相关广播（部分环境）
];
#[cfg(windows)]
pub fn enable_broadcast_protection() -> Result<(), String> {
    let stop_script = BCAST_SERVICES
        .iter()
        .map(|s| format!("Stop-Service -Name '{s}' -Force -ErrorAction SilentlyContinue; Set-Service -Name '{s}' -StartupType Manual -ErrorAction SilentlyContinue"))
        .collect::<Vec<_>>()
        .join("; ");
    run_ps(&format!(
        r#"New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -Name 'EnableMulticast' -Value 0 -Type DWord; {stop_script}"#
    ))?;
    Ok(())
}
#[cfg(windows)]
pub fn disable_broadcast_protection() -> Result<(), String> {
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

// ===== 断网急救：与 emergency.ps1 同源（只修联网基础设施） =====
pub fn emergency_rescue() -> Result<(), String> {
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

// ===== 防线③：创建系统还原点（高危操作前的终极保险） =====
pub fn create_system_restore_point() -> Result<(), String> {
    // 还原点是"高危操作前的终极保险"，属可选兜底：
    // 系统还原服务被禁（精简/优化/家庭版常见）时 Checkpoint-Computer 必失败，
    // 这是正常机器状态，不该弹大红条、更不该阻断备份/急救主流程。失败静默跳过。
    let _ = run_ps(
        "Checkpoint-Computer -Description '望仔-高危操作前' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop | Out-Null",
    );
    Ok(())
}