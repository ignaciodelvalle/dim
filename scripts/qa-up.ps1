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
# Stale-server guard (incident 2026-07-23, twice): a server started BEFORE the
# last rebuild keeps serving its old in-memory BUILD_ID while .next on disk has
# a new one — every page then 400s on the dead chunk hashes. "Something listens
# on :3000" is NOT enough; the served build must MATCH the disk build. We probe
# a page and look for the on-disk BUILD_ID in its /_next/static asset URLs; on
# mismatch the stale server is killed and a fresh one started.
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    $diskBuildId = (Get-Content $buildIdPath -Raw).Trim()
    $servedFresh = $false
    try {
        $probe = Invoke-WebRequest -Uri "http://localhost:$Port/login" -UseBasicParsing -TimeoutSec 10
        if ($probe.Content -match [regex]::Escape("/_next/static/$diskBuildId/")) { $servedFresh = $true }
    } catch {
        Write-Warning "Probe of the running server failed - treating it as stale."
    }
    if ($servedFresh) {
        Write-Host "Port $Port already listening and serving the on-disk build ($diskBuildId) - reusing."
    } else {
        Write-Warning "Server on port $Port serves a DIFFERENT build than .next on disk - restarting it."
        $listening | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        $listening = $null
    }
}
if ($listening) {
    # fresh server confirmed above - nothing to do
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
