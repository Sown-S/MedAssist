# Khôi phục CSDL từ một bản sao lưu theo Architecture v1.9 §5.4.1: khôi phục vào CSDL mới, kiểm quyền,
# rồi mới đổi tên thay CSDL đang chạy. Không dùng pg_restore --clean trên CSDL đang chạy vì lệnh đó cấp lại
# UPDATE cho medassist_app trên audit_log và stock_movement (bảng chỉ ghi thêm).
# Dùng: .\deploy\scripts\restore.ps1 -File deploy\backups\medassist_20261020_2200.dump
# CSDL cũ được giữ lại tên medassist_truoc_<thời điểm> để quay lại nếu cần.
param([Parameter(Mandatory)] [string] $File)
$ErrorActionPreference = "Stop"
$Deploy = Split-Path -Parent $PSScriptRoot
$Compose = @("compose", "-f", "$Deploy\docker-compose.yml", "--env-file", "$Deploy\.env")
$New = "medassist_restore"
$Old = "medassist_truoc_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

function Psql([string] $Db, [string[]] $Rest) {
    docker @Compose exec -T db psql -U postgres -d $Db -v ON_ERROR_STOP=1 -qtA @Rest
    if ($LASTEXITCODE) { throw "psql thất bại trên $Db" }
}

$File = (Resolve-Path $File).Path
$answer = Read-Host "Khôi phục sẽ THAY CSDL đang chạy bằng $File (CSDL cũ giữ tên $Old). Gõ KHOIPHUC để tiếp tục"
if ($answer -ne "KHOIPHUC") { Write-Host "Đã hủy."; exit 1 }

docker @Compose cp $File db:/tmp/restore.dump
if ($LASTEXITCODE) { throw "Không chép được file sao lưu vào container db" }
try {
    Psql postgres @("-c", "DROP DATABASE IF EXISTS $New", "-c", "CREATE DATABASE $New")
    # Vai trò đã có sẵn nên mật khẩu ở đây không được dùng; chỉ đặt owner, múi giờ, quyền CONNECT, schema.
    Psql postgres @("-v", "dbname=$New", "-v", "owner_pw=x", "-v", "app_pw=x", "-v", "backup_pw=x",
                    "-f", "/docker-entrypoint-initdb.d/sql/01_roles.sql")
    docker @Compose exec -T db pg_restore -U medassist_owner -d $New --no-owner --exit-on-error --single-transaction /tmp/restore.dump
    if ($LASTEXITCODE) { throw "pg_restore thất bại (mã $LASTEXITCODE): CSDL đang chạy chưa bị đụng tới" }

    # Bản sao lưu lấy từ CSDL từng khôi phục bằng cách cũ có thể mang theo quyền UPDATE thừa: thu hồi lại.
    docker @Compose exec -T db psql -U medassist_owner -d $New -v ON_ERROR_STOP=1 -q -c "REVOKE UPDATE, DELETE, TRUNCATE ON audit_log, stock_movement FROM medassist_app"
    if ($LASTEXITCODE) { throw "Không thu hồi được quyền thừa trên $New" }
    $bad = Psql $New @("-c", @"
SELECT string_agg(t || ':' || p, ', ') FROM (VALUES
  ('audit_log', 'UPDATE', false), ('audit_log', 'DELETE', false), ('stock_movement', 'UPDATE', false),
  ('stock_movement', 'DELETE', false), ('visit', 'UPDATE', true), ('audit_log', 'INSERT', true)) v(t, p, want)
WHERE has_table_privilege('medassist_app', t, p) <> want
"@)
    if ($bad) { throw "Quyền của medassist_app sau khôi phục không đúng ($bad): giữ nguyên CSDL đang chạy" }

    docker @Compose stop api worker
    Psql postgres @("-c", "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'medassist' AND pid <> pg_backend_pid()",
                    "-c", "ALTER DATABASE medassist RENAME TO $Old",
                    "-c", "ALTER DATABASE $New RENAME TO medassist")
} catch {
    try { Psql postgres @("-c", "DROP DATABASE IF EXISTS $New") } catch { }
    throw
} finally {
    docker @Compose exec -T db rm -f /tmp/restore.dump
    docker @Compose start api worker
}
Write-Host "Đã khôi phục từ $File. CSDL cũ: $Old (xóa khi chắc chắn: ... exec db psql -U postgres -c 'DROP DATABASE $Old')"
