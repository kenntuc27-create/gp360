# ============================================================
# Build de producao + servidor + tunel Cloudflare
# Uso:  .\scripts\start.ps1
#       .\scripts\start.ps1 -Hostname app.seudominio.com
# ============================================================

param(
    [string]$Hostname = "",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
    Write-Host "Arquivo .env nao existe. Rode .\scripts\setup.ps1 primeiro." -ForegroundColor Red
    exit 1
}

Write-Host "==> Build de producao..." -ForegroundColor Cyan
bun run build

Write-Host "==> Iniciando preview na porta $Port..." -ForegroundColor Cyan
$preview = Start-Process -FilePath "bun" -ArgumentList "run","preview","--","--port",$Port,"--host","127.0.0.1" -PassThru -NoNewWindow

Start-Sleep -Seconds 4

Write-Host "==> Subindo tunel Cloudflare..." -ForegroundColor Cyan
try {
    if ([string]::IsNullOrWhiteSpace($Hostname)) {
        Write-Host "Tunel rapido (URL temporaria *.trycloudflare.com)" -ForegroundColor Yellow
        cloudflared tunnel --url "http://127.0.0.1:$Port"
    } else {
        Write-Host "Tunel nomeado para $Hostname" -ForegroundColor Yellow
        cloudflared tunnel --hostname $Hostname --url "http://127.0.0.1:$Port"
    }
} finally {
    Write-Host "==> Encerrando preview..." -ForegroundColor Cyan
    if ($preview -and -not $preview.HasExited) { Stop-Process -Id $preview.Id -Force }
}
