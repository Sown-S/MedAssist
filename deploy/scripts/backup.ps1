# Sao lưu CSDL bằng vai trò chỉ-đọc medassist_backup vào deploy/backups (KHÔNG commit), giữ $Keep bản mới nhất.
# File mã hóa AES-256 bằng BACKUP_PASSPHRASE trong deploy/.env (NFR02); restore.ps1 giải mã.
# -CopyTo: chép thêm sang ổ thứ hai / USB / thư mục mạng (NFR04). Chạy tay hoặc theo lịch (register-backup-task.ps1).
param([int] $Keep = 14, [string] $CopyTo = "")
$ErrorActionPreference = "Stop"
$Deploy = Split-Path -Parent $PSScriptRoot
$Compose = @("compose", "-f", "$Deploy\docker-compose.yml", "--env-file", "$Deploy\.env")

$Backups = "$Deploy\backups"
New-Item -ItemType Directory -Force -Path $Backups | Out-Null
$name = "medassist_$(Get-Date -Format 'yyyyMMdd_HHmm').dump.enc"

# pg_dump ghi file trong container rồi chép ra: chuyển hướng ">" của PowerShell làm hỏng file nhị phân.
# Mã hóa ngay trong container để bản rõ không ra ổ đĩa máy admin hay USB. Khóa đọc từ biến môi trường của
# container, không đưa vào dòng lệnh. Không dùng dấu " trong lệnh: PowerShell 5.1 làm mất khi gọi docker.
$dump = 'set -eo pipefail; [ ${#BACKUP_PASSPHRASE} -gt 0 ] || exit 3; command -v openssl >/dev/null || exit 4; ' +
        'pg_dump -U medassist_backup -d medassist -Fc | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt ' +
        '-pass env:BACKUP_PASSPHRASE -out /tmp/backup.dump.enc'
docker @Compose exec -T db bash -c $dump
$code = $LASTEXITCODE
if ($code -eq 3) { throw "Thiếu BACKUP_PASSPHRASE trong deploy\.env: thêm vào rồi chạy start.ps1 để container db nhận khóa" }
if ($code -eq 4) { throw "Container db không có openssl để mã hóa" }
if ($code) { docker @Compose exec -T db rm -f /tmp/backup.dump.enc; throw "pg_dump hoặc mã hóa thất bại (mã $code)" }
docker @Compose cp db:/tmp/backup.dump.enc "$Backups\$name"
docker @Compose exec -T db rm -f /tmp/backup.dump.enc

Get-ChildItem "$Backups\medassist_*.dump*" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item
Write-Host "Đã sao lưu: backups\$name"
if ($CopyTo) {
    try {
        New-Item -ItemType Directory -Force -Path $CopyTo | Out-Null
        Copy-Item "$Backups\$name" $CopyTo
        Get-ChildItem "$CopyTo\medassist_*.dump*" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item
        Write-Host "Đã chép sang: $CopyTo\$name"
    } catch {
        # Bản trong deploy\backups vẫn còn; báo lỗi để Task Scheduler ghi lần chạy thất bại
        Write-Host "Không chép được sang ${CopyTo}: $_" -ForegroundColor Red
        exit 1
    }
}
