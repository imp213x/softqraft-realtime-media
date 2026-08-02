# SoftQraft — start local stack (if needed) + open Live test UI
param(
  [string]$GatewayUrl = "http://localhost:8080",
  [string]$ApiKey = "dev-local-key",
  [switch]$SkipCompose,
  [switch]$HostGateway  # run gateway via pnpm on host instead of container
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== SoftQraft local live ==" -ForegroundColor Cyan

if (-not $SkipCompose) {
  $compose = Join-Path $Root "deploy\compose\docker-compose.yml"
  $envFile = Join-Path $Root "deploy\compose\.env"
  if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $Root "deploy\env\media.env.example") $envFile
    Write-Host "Created deploy/compose/.env from example"
  }

  Write-Host "Starting Docker media plane..."
  docker compose -f $compose up -d
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed — is Docker Desktop running?"
  }
}

# Wait for gateway
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "$GatewayUrl/ready" -TimeoutSec 2
    if ($r.status -eq "ready") {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  Write-Host "Gateway not ready at $GatewayUrl" -ForegroundColor Yellow
  Write-Host "If using Compose gateway without CORS rebuild, run:" -ForegroundColor Yellow
  Write-Host "  docker compose -f deploy/compose/docker-compose.yml up -d --build gateway"
  Write-Host "Or host gateway: pnpm dev:gateway with env from deploy/env/media.env.example"
}

if ($HostGateway) {
  Write-Host "Start host gateway in another terminal:" -ForegroundColor Cyan
  Write-Host @'
  cd C:\Dev\live-streaming-platform
  $env:LIVEKIT_URL="http://localhost:7880"
  $env:LIVEKIT_REALTIME_URL="ws://localhost:7880"
  $env:LIVEKIT_API_KEY="softqraft_dev_key"
  $env:LIVEKIT_API_SECRET="softqraft_dev_secret_change_me_before_prod"
  $env:S3_BUCKET_NAME="sqrm-recordings"
  $env:AWS_ACCESS_KEY_ID="softqraft"
  $env:AWS_SECRET_ACCESS_KEY="softqraftsecret"
  $env:S3_ENDPOINT="http://localhost:9000"
  $env:S3_FORCE_PATH_STYLE="true"
  $env:GATEWAY_SERVICE_API_KEYS="dev-local-key"
  pnpm --filter @softqraft/shared build
  pnpm dev:gateway
'@
}

$demo = Join-Path $Root "examples\local-live-test\index.html"
if (-not (Test-Path $demo)) {
  throw "Missing $demo"
}

# Serve static demo (file:// blocks some module CDN + camera quirks)
$port = 5177
$demoDir = Split-Path $demo

Write-Host "Serving live test UI on http://localhost:$port/" -ForegroundColor Green
Write-Host "  Host tab: open the page, click Go live, allow camera/mic"
Write-Host "  Viewer: open a second tab, set role=realtime_viewer, paste session id, Join"
Write-Host "  MinIO:  http://localhost:9001  (softqraft / softqraftsecret)"
Write-Host "  Gateway: $GatewayUrl"
Write-Host ""
Write-Host "Press Ctrl+C to stop the static server." -ForegroundColor Yellow

# Open browser
Start-Process "http://localhost:$port/?gateway=$([uri]::EscapeDataString($GatewayUrl))&apiKey=$([uri]::EscapeDataString($ApiKey))&role=host&identity=local-host"

# Python is commonly available on Windows; fall back to npx serve
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) {
  Set-Location $demoDir
  python -m http.server $port
} else {
  npx --yes serve -l $port $demoDir
}
