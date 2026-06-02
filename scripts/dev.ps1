# ============================================================
# Modo desenvolvimento (hot reload) - porta 3000
# Uso:  .\scripts\dev.ps1
# ============================================================

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
    Write-Host "Arquivo .env nao existe. Rode .\scripts\setup.ps1 primeiro." -ForegroundColor Red
    exit 1
}

Write-Host "==> Iniciando Vite dev em http://localhost:3000" -ForegroundColor Cyan
bun run dev
