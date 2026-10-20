# Bật toàn bộ hệ thống trên máy admin. Lần đầu: build image, tạo CSDL, chạy migration, tải model Ollama.
# Dùng: .\deploy\scripts\start.ps1        (GPU NVIDIA)
#       .\deploy\scripts\start.ps1 -Cpu   (máy không có GPU)
#       thêm -OllamaLan: mở cổng 11434 cho máy dev trong nhóm (chỉ giai đoạn phát triển)
param([switch] $Cpu, [switch] $OllamaLan)
$ErrorActionPreference = "Stop"
$Deploy = Split-Path -Parent $PSScriptRoot
$Compose = @("compose", "-f", "$Deploy\docker-compose.yml", "--env-file", "$Deploy\.env")

if (-not (Test-Path "$Deploy\.env")) { throw "Thiếu deploy\.env: sao chép từ deploy\.env.example rồi điền mật khẩu" }
if (-not (Test-Path "$Deploy\certs\server.crt")) { throw "Thiếu chứng chỉ: chạy .\deploy\scripts\new-certs.ps1 -HostName <IP máy admin>" }
if ($Cpu) { $Compose += @("-f", "$Deploy\docker-compose.cpu.yml") }
if ($OllamaLan) { $Compose += @("-f", "$Deploy\docker-compose.ollama-lan.yml") }

docker @Compose up -d --build
if ($LASTEXITCODE) { throw "docker compose up thất bại" }

$model = (Get-Content "$Deploy\.env" | Where-Object { $_ -match "^OLLAMA_MODEL=" }) -replace "^OLLAMA_MODEL=", ""
# PowerShell 5.1 coi stderr của lệnh ngoài là lỗi khi Stop; ở đây "not found" là kết quả mong đợi.
$ErrorActionPreference = "Continue"
docker @Compose exec -T ollama ollama show $model *> $null
$missing = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($missing) {
    Write-Host "Đang tải model $model (lần đầu, có thể mất vài phút)..."
    docker @Compose exec -T ollama ollama pull $model
    if ($LASTEXITCODE) { throw "Tải model thất bại" }
}
docker @Compose ps
