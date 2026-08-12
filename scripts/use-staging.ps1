# Carga el entorno de STAGING en la sesión actual de PowerShell y verifica que
# haya quedado COMPLETO antes de dejarte correr nada.
#
# POR QUÉ EXISTE
# --------------
# `.env.staging.local` trae DATABASE_URL de staging pero no las variables de
# Supabase Auth. Cargarlo a mano y correr un seed produce un entorno PARTIDO:
# dotenv completa las que faltan desde `.env.local`, así que Drizzle escribe en
# staging mientras el SDK de Auth lee de tu base local. El 2026-08-11 eso hizo
# que `seed:test` avisara "seeding into a REMOTE project (http://127.0.0.1:54321)"
# — la palabra REMOTO con una URL local — y muriera recién en el paso 3.
#
# Este script se niega a dejarte el entorno a medias.
#
# Uso:
#   . .\scripts\use-staging.ps1      # el punto inicial importa: aplica a TU sesión
#   pnpm repair:dni --allow-remote

$ErrorActionPreference = "Stop"
$envFile = ".env.staging.local"

if (-not (Test-Path $envFile)) {
  Write-Host "No encuentro $envFile en $(Get-Location)." -ForegroundColor Red
  return
}

Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), 'Process')
}

# Las tres que cualquier script de datos necesita. DATABASE_URL sola alcanza
# para los que sólo escriben en la base (repair:dni), pero NO para los seeds,
# que además crean usuarios por el SDK de Auth.
$required = @("DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_, 'Process') }

function Get-HostOnly([string]$url) {
  if (-not $url) { return "(sin definir)" }
  return ($url -replace '^[a-z+]+://', '' -replace '.*@', '' -replace '[/?].*', '')
}

$dbHost = Get-HostOnly $env:DATABASE_URL
$sbHost = Get-HostOnly $env:NEXT_PUBLIC_SUPABASE_URL
$dbLocal = $dbHost -match '127\.0\.0\.1|localhost'
$sbLocal = $sbHost -match '127\.0\.0\.1|localhost'

Write-Host ""
Write-Host "  Base de datos  -> $dbHost  $(if ($dbLocal) {'(LOCAL)'} else {'(REMOTO)'})"
Write-Host "  Supabase Auth  -> $sbHost  $(if ($sbLocal) {'(LOCAL)'} else {'(REMOTO)'})"
Write-Host ""

if ($missing.Count -gt 0) {
  Write-Host "INCOMPLETO. Falta en ${envFile}:" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
  Write-Host ""
  Write-Host "Podes correr scripts que SOLO escriben en la base (pnpm repair:dni)." -ForegroundColor Yellow
  Write-Host "NO corras los seeds: van a partir el entorno." -ForegroundColor Red
  Write-Host "Las que faltan salen del dashboard de Supabase del proyecto de staging." -ForegroundColor Yellow
  return
}

if ($dbLocal -ne $sbLocal) {
  Write-Host "ENTORNO PARTIDO — no corras nada." -ForegroundColor Red
  Write-Host "Una apunta a local y la otra a remoto. Revisa $envFile." -ForegroundColor Red
  return
}

if ($dbLocal) {
  Write-Host "Entorno LOCAL cargado." -ForegroundColor Green
} else {
  Write-Host "Entorno STAGING cargado y completo." -ForegroundColor Green
  Write-Host "Acordate de --allow-remote en cada comando." -ForegroundColor Green
}
Write-Host ""
