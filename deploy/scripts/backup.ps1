# Sao lưu CSDL bằng vai trò chỉ-đọc medassist_backup vào deploy/backups (KHÔNG commit), giữ $Keep bản mới nhất.
# -CopyTo: chép thêm sang ổ thứ hai / USB / thư mục mạng (NFR04). Chạy tay hoặc theo lịch (register-backup-task.ps1).
param([int] $Keep = 14, [string] $CopyTo = "")
$ErrorActionPreference = "Stop"
$Deploy = Split-Path -Parent $PSScriptRoot
$Compose = @("compose", "-f", "$Deploy\docker-compose.yml", "--env-file", "$Deploy\.env")

$Backups = "$Deploy\backups"
New-Item -ItemType Directory -Force -Path $Backups | Out-Null
$name = "medassist_$(Get-Date -Format 'yyyyMMdd_HHmm').dump"

# pg_dump ghi file trong container rồi chép ra: chuyển hướng ">" của PowerShell làm hỏng file nhị phân.
docker @Compose exec -T db pg_dump -U medassist_backup -d medassist -Fc -f /tmp/backup.dump
if ($LASTEXITCODE) { throw "pg_dump thất bại" }
docker @Compose cp db:/tmp/backup.dump "$Backups\$name"
docker @Compose exec -T db rm -f /tmp/backup.dump

Get-ChildItem "$Backups\medassist_*.dump" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item
Write-Host "Đã sao lưu: backups\$name"
if ($CopyTo) {
    try {
        New-Item -ItemType Directory -Force -Path $CopyTo | Out-Null
        Copy-Item "$Backups\$name" $CopyTo
        Get-ChildItem "$CopyTo\medassist_*.dump" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item
        Write-Host "Đã chép sang: $CopyTo\$name"
    } catch {
        # Bản trong deploy\backups vẫn còn; báo lỗi để Task Scheduler ghi lần chạy thất bại
        Write-Host "Không chép được sang ${CopyTo}: $_" -ForegroundColor Red
        exit 1
    }
}
