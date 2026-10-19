# Đăng ký Task Scheduler chạy backup.ps1 hằng ngày. Chạy PowerShell với quyền Administrator.
param([string] $At = "22:00")
$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "backup.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun
Register-ScheduledTask -TaskName "MedAssist - Sao luu CSDL" -Action $action -Trigger $trigger -Settings $settings `
    -User $env:USERNAME -RunLevel Highest -Force | Out-Null
Write-Host "Đã đăng ký sao lưu hằng ngày lúc $At (Task Scheduler: 'MedAssist - Sao luu CSDL')."
