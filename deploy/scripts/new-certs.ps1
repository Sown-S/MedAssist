# Tạo CA của dự án (lần đầu) và chứng chỉ máy chủ cho Caddy. Khóa riêng nằm trong deploy/certs, KHÔNG commit.
# Dùng: .\deploy\scripts\new-certs.ps1 -HostName 192.168.1.10            (IP máy admin)
#       .\deploy\scripts\new-certs.ps1 -HostName 192.168.1.10,may-admin  (nhiều IP / tên máy)
# Chứng chỉ công khai của CA (certs/medassist-root-ca.crt) chép sang client/certs qua PR, Anh duyệt.
param(
    [Parameter(Mandatory)] [string[]] $HostName,
    [int] $ServerDays = 825
)
$ErrorActionPreference = "Stop"
$Certs = Join-Path (Split-Path -Parent $PSScriptRoot) "certs"
New-Item -ItemType Directory -Force -Path $Certs | Out-Null
$OpenSsl = @("run", "--rm", "-v", "${Certs}:/certs", "-w", "/certs", "alpine/openssl")

if (-not (Test-Path "$Certs\medassist-root-ca.key")) {
    docker @OpenSsl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes `
        -keyout medassist-root-ca.key -out medassist-root-ca.crt `
        -subj "/CN=MedAssist Root CA" `
        -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
    if ($LASTEXITCODE) { throw "Tạo CA thất bại" }
    Write-Host "Đã tạo CA mới: certs\medassist-root-ca.crt (cài lên mọi máy client / đóng gói vào app)"
}

$san = ($HostName | ForEach-Object {
    if ($_ -as [ipaddress]) { "IP:$_" } else { "DNS:$_" }
}) -join ","
@"
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
"@ | Set-Content -Encoding ascii "$Certs\server.ext"

docker @OpenSsl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=$($HostName[0])"
if ($LASTEXITCODE) { throw "Tạo khóa máy chủ thất bại" }
docker @OpenSsl x509 -req -in server.csr -CA medassist-root-ca.crt -CAkey medassist-root-ca.key `
    -CAcreateserial -out server.crt -days $ServerDays -sha256 -extfile server.ext
if ($LASTEXITCODE) { throw "Ký chứng chỉ máy chủ thất bại" }
Remove-Item "$Certs\server.csr", "$Certs\server.ext"
Write-Host "Đã cấp certs\server.crt cho: $san (hạn $ServerDays ngày). Khởi động lại caddy để nhận chứng chỉ mới."
