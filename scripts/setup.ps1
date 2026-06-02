# ============================================================
# GP3K Sistemas - Setup local (Windows PowerShell)
# Uso:  .\scripts\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "==> Verificando Bun..." -ForegroundColor Cyan
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "Bun nao encontrado. Instalando..." -ForegroundColor Yellow
    powershell -c "irm bun.sh/install.ps1 | iex"
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
}
bun --version

Write-Host "==> Verificando cloudflared..." -ForegroundColor Cyan
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "cloudflared nao encontrado. Instale com:" -ForegroundColor Yellow
    Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
}

Write-Host "==> Copiando .env.example -> .env (se nao existir)..." -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "ATENCAO: edite .env e preencha SUPABASE_SERVICE_ROLE_KEY e LOVABLE_API_KEY" -ForegroundColor Red
}

Write-Host "==> Instalando dependencias..." -ForegroundColor Cyan
bun install

Write-Host ""
Write-Host "Setup concluido!" -ForegroundColor Green
Write-Host "Proximos passos:"
Write-Host "  1) Edite .env com seus segredos"
Write-Host "  2) Rode:  .\scripts\dev.ps1        (modo desenvolvimento)"
Write-Host "  3) Ou:    .\scripts\start.ps1      (build + producao + tunel Cloudflare)"
