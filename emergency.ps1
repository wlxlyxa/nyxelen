$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] NOT admin. Open PowerShell as Administrator, then run again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "===== WangZai rescue START =====" -ForegroundColor Cyan
Write-Host "[1/6] removing WangZai firewall rules (wildcard + KillSwitch) ..." -ForegroundColor Yellow
Get-NetFirewallRule -DisplayName '望仔-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName '望仔-KillSwitch' -ErrorAction SilentlyContinue
Write-Host "[2/6] clearing system proxy ..." -ForegroundColor Yellow
$ips = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
Set-ItemProperty -Path $ips -Name ProxyEnable -Value 0 -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $ips -Name ProxyServer -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $ips -Name AutoConfigURL -ErrorAction SilentlyContinue
Write-Host "[3/6] re-enabling IPv6 bindings ..." -ForegroundColor Yellow
Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object { Enable-NetAdapterBinding -Name $PSItem.Name -ComponentID 'ms_tcpip6' -ErrorAction SilentlyContinue }
Write-Host "[4/6] restarting DNS client and flushing cache ..." -ForegroundColor Yellow
Restart-Service -Name Dnscache -Force -ErrorAction SilentlyContinue
ipconfig /flushdns | Out-Null
Write-Host "[5/6] restarting physical adapters ..." -ForegroundColor Yellow
Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $PSItem.Status -eq 'Up' } | ForEach-Object { Disable-NetAdapter -Name $PSItem.Name -Confirm:$false -ErrorAction SilentlyContinue; Enable-NetAdapter -Name $PSItem.Name -Confirm:$false -ErrorAction SilentlyContinue }
Write-Host "[6/6] resetting network stack (reboot needed to fully apply) ..." -ForegroundColor Yellow
netsh winsock reset | Out-Null
netsh int ip reset | Out-Null
netsh int ipv4 reset | Out-Null
netsh int ipv6 reset | Out-Null
Write-Host "===== WangZai rescue DONE =====" -ForegroundColor Green
Write-Host "If still offline, REBOOT the PC." -ForegroundColor Yellow
Read-Host "Press Enter to exit"