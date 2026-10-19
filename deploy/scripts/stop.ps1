# Tắt hệ thống, giữ nguyên dữ liệu (volume pgdata, model Ollama).
$ErrorActionPreference = "Stop"
$Deploy = Split-Path -Parent $PSScriptRoot
$Compose = @("compose", "-f", "$Deploy\docker-compose.yml", "--env-file", "$Deploy\.env")

docker @Compose stop
