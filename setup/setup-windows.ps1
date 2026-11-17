<#
.SYNOPSIS
  WakePC 小程序目标机一次性配置脚本：启用 WinRM（HTTP + Basic 认证）与 Wake-on-LAN。

.DESCRIPTION
  以管理员身份在目标 Windows 电脑上运行一次即可：
    Set-ExecutionPolicy Bypass -Scope Process -Force
    .\setup-windows.ps1

  本脚本会：
    1. 启用 WinRM 服务并设为开机自启
    2. 开启 Basic 认证与 AllowUnencrypted（仅限局域网使用！）
    3. 放行防火墙 5985 端口（仅限 Private 网络）
    4. 尝试为物理网卡开启 Wake-on-LAN（魔术包唤醒）
    5. 输出本机 IP / MAC，方便在小程序中填写

  兼容 Windows PowerShell 5.1 与 PowerShell 7。
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

Write-Host "`n=== [1/5] 启用 WinRM 服务 ===" -ForegroundColor Cyan
Set-Service -Name WinRM -StartupType Automatic
Start-Service -Name WinRM
winrm quickconfig -q -force 2>$null | Out-Null
Write-Host "WinRM 已启动并设为自动启动"

Write-Host "`n=== [2/5] 配置认证方式 ===" -ForegroundColor Cyan
Set-Item -Path WSMan:\localhost\Service\Auth\Basic -Value $true
Set-Item -Path WSMan:\localhost\Service\AllowUnencrypted -Value $true
Write-Host "已启用 Basic 认证与未加密传输（请仅在可信局域网内使用）" -ForegroundColor Yellow

# 若电脑使用 Microsoft 账户登录，Basic 认证需要本地账户。给出提示。
$localUsers = Get-LocalUser | Where-Object { $_.Enabled } | Select-Object -ExpandProperty Name
Write-Host "当前可用的本地账户: $($localUsers -join ', ')"
Write-Host "提示：小程序中请填写本地账户。若只有 Microsoft 账户，请先创建本地管理员账户。" -ForegroundColor Yellow

Write-Host "`n=== [3/5] 配置防火墙 ===" -ForegroundColor Cyan
$ruleName = 'WakePC-WinRM-HTTP'
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $ruleName -DisplayName 'WakePC WinRM (HTTP 5985)' `
        -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Allow -Profile Private, Domain | Out-Null
}
Write-Host "已放行 TCP 5985（Private/Domain 网络）"

Write-Host "`n=== [4/5] 开启网卡 Wake-on-LAN ===" -ForegroundColor Cyan
$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' }
foreach ($ad in $adapters) {
    try {
        # 关闭「允许计算机关闭此设备以节约电源」之外，开启魔术包唤醒
        powercfg -deviceenablewake $ad.InterfaceDescription 2>$null
        $wol = Get-NetAdapterPowerManagement -Name $ad.Name -ErrorAction SilentlyContinue
        if ($wol) {
            Set-NetAdapterPowerManagement -Name $ad.Name -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue
        }
        Write-Host "网卡 [$($ad.Name)] 已尝试开启魔术包唤醒"
    } catch {
        Write-Host "网卡 [$($ad.Name)] 配置失败: $_" -ForegroundColor Yellow
    }
}
Write-Host "注意：还需在 BIOS/UEFI 中开启 Wake-on-LAN，并建议关闭 Windows 快速启动（powercfg /h off 或控制面板-电源选项）。" -ForegroundColor Yellow

Write-Host "`n=== [5/5] 本机信息（填入小程序） ===" -ForegroundColor Cyan
foreach ($ad in $adapters) {
    $ip = (Get-NetIPAddress -InterfaceIndex $ad.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254.*' }).IPAddress
    Write-Host ("  网卡: {0}`n  IP:  {1}`n  MAC: {2}`n" -f $ad.Name, ($ip -join ', '), $ad.MacAddress)
}

Write-Host "配置完成 ✔ 可在小程序中「测试连接」验证。" -ForegroundColor Green
