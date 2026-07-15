# QA environment bootstrap for the local integration build.
# Checks Supabase containers, build freshness, starts the production server,
# smoke-tests key routes, and verifies seed accounts exist.
# Usage: pwsh scripts/qa-up.ps1 [-Port 3000]
param([int]$Port = 3000)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host "== DIM QA up =="

# 1. Supabase containers
$db = docker ps --filter "name=supabase_db_DIM" --format "{{.Status}}"
if (-not $db) {
    Write-Host "Supabase is not running - starting (pnpm db:start)..."
    cmd /c "pnpm db:start"
    if ($LASTEXITCODE -ne 0) { Write-Error "supabase start failed" }
} else {
    Write-Host "Supabase: $db"
}

# 2. Build freshness (warn only - QA may intentionally target an older build)
$buildIdPath = Join-Path $repo ".next/BUILD_ID"
if (-not (Test-Path $buildIdPath)) {
    Write-Error "No production build found (.next/BUILD_ID missing). Run: pnpm build"
}
$buildTime = (Get-Item $buildIdPath).LastWriteTimeUtc
$headEpoch = [long](git log -1 --format=%ct)
$headTime = [DateTimeOffset]::FromUnixTimeSeconds($headEpoch).UtcDateTime
$headSha = git log -1 --format=%h
if ($headTime -gt $buildTime) {
    Write-Warning "Build is OLDER than HEAD ($headSha). QA may not reflect the latest commits. Run: pnpm build"
} else {
    Write-Host "Build is fresh relative to HEAD ($headSha)."
}

# 3. Server
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host "Port $Port already listening - reusing running server."
} else {
    Write-Host "Starting production server on port $Port..."
    $env:PORT = $Port
    Start-Process -FilePath "cmd" -ArgumentList "/c", "pnpm", "start" -WorkingDirectory $repo -WindowStyle Hidden
}

# 4. Smoke-test key routes
$routes = @("/", "/login", "/perdidas")
foreach ($route in $routes) {
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:$Port$route" -UseBasicParsing -TimeoutSec 5
            Write-Host ("smoke {0} -> {1}" -f $route, $resp.StatusCode)
            $ok = $true
            break
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $ok) { Write-Error "smoke FAILED: $route never responded on port $Port" }
}

# 5. Seed accounts present?
# NOTE: refugio@dim.test is an organization CONTACT email (organizations table),
# not an auth account — the shelter-admin login accounts are orgadmin@dim.test
# (seed-test-users) and alejo@dim.test (seed-demo).
$expected = @(
    "admin@dim.test", "govt@dim.test", "vet@dim.test", "owner@dim.test",
    "orgadmin@dim.test", "alejo@dim.test", "carla@dim.test", "lilian@dim.test"
)
$emailsCsv = "'" + ($expected -join "','") + "'"
$found = docker exec supabase_db_DIM psql -U postgres -d postgres -t -A -c "select email from auth.users where email in ($emailsCsv)" |
    ForEach-Object { $_.Trim() } | Where-Object { $_ }
$missing = $expected | Where-Object { $found -notcontains $_ }
if ($missing) {
    Write-Warning ("Missing seed accounts: {0}. Run: pnpm tsx scripts/seed-demo-spine.ts" -f ($missing -join ", "))
} else {
    Write-Host "All expected seed accounts present."
}

Write-Host "QA environment ready: http://localhost:$Port"
