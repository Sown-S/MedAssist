# Khôi phục CSDL từ một bản sao lưu. GHI ĐÈ dữ liệu hiện tại; api và worker tạm dừng trong lúc khôi phục.
# Dùng: .\deploy\scripts\restore.ps1 -File deploy\backups\medassist_20261020_2200.dump
param([Parameter(Mandatory)] [string] $File)
$ErrorActionPreference = "Stop"
$Deploy = Split-Path -Parent $PSScriptRoot
$Compose = @("compose", "-f", "$Deploy\docker-compose.yml", "--env-file", "$Deploy\.env")

$File = (Resolve-Path $File).Path
$answer = Read-Host "Khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại bằng $File. Gõ KHOIPHUC để tiếp tục"
if ($answer -ne "KHOIPHUC") { Write-Host "Đã hủy."; exit 1 }

docker @Compose stop api worker
docker @Compose cp $File db:/tmp/restore.dump
docker @Compose exec -T db pg_restore -U medassist_owner -d medassist --clean --if-exists --no-owner --single-transaction /tmp/restore.dump
$code = $LASTEXITCODE
docker @Compose exec -T db rm -f /tmp/restore.dump
docker @Compose start api worker
if ($code) { throw "pg_restore thất bại (mã $code): dữ liệu cũ vẫn giữ nguyên vì chạy trong một transaction" }
Write-Host "Đã khôi phục từ $File"
