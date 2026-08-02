# SoftQraft — start local stack + open Live test UI (WebRTC + Echo + optional HLS/TURN)
param(
  [string]$GatewayUrl = "http://localhost:8080",
  [string]$ApiKey = "dev-local-key",
  [switch]$SkipCompose,
  [switch]$HostGateway,   # run gateway via pnpm on host instead of container
  [switch]$WithTurn,      # docker compose --profile turn-bridge
  [switch]$SyncNodeIp,    # run sync-livekit-node-ip.ps1 before compose
  [switch]$RebuildGateway
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== SoftQraft local live (market-grade ready) ==" -ForegroundColor Cyan

if ($SyncNodeIp) {
  Write-Host "Syncing LiveKit node_ip to LAN address..."
  & (Join-Path $Root "scripts\sync-livekit-node-ip.ps1")
}

if (-not $SkipCompose) {
  $compose = Join-Path $Root "deploy\compose\docker-compose.yml"
  $envFile = Join-Path $Root "deploy\compose\.env"
  if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $Root "deploy\env\media.env.example") $envFile
    Write-Host "Created deploy/compose/.env from example"
  }

  # Prefer LAN IP for TURN_HOST when empty / loopback
  try {
    $lan = (
      Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } |
      Sort-Object InterfaceMetric |
      Select-Object -First 1 -ExpandProperty IPAddress
    )
    if ($lan) {
      $envText = Get-Content $envFile -Raw
      if ($envText -match "(?m)^TURN_HOST=127\.0\.0\.1\s*$" -or $envText -notmatch "(?m)^TURN_HOST=") {
        if ($envText -match "(?m)^TURN_HOST=") {
          $envText = $envText -replace "(?m)^TURN_HOST=.*$", "TURN_HOST=$lan"
        } else {
          $envText = $envText.TrimEnd() + "`nTURN_HOST=$lan`n"
        }
        Set-Content -Path $envFile -Value $envText -NoNewline
        Write-Host "Set TURN_HOST=$lan in deploy/compose/.env"
      }
    }
  } catch {
    Write-Host "Could not auto-detect TURN_HOST: $_" -ForegroundColor Yellow
  }

  Write-Host "Starting Docker media plane..."
  if ($WithTurn) {
    docker compose -f $compose --profile turn-bridge up -d
  } else {
    docker compose -f $compose up -d
  }
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed — is Docker Desktop running?"
  }

  if ($RebuildGateway) {
    Write-Host "Rebuilding gateway image..."
    docker compose -f $compose up -d --build gateway
  }
}

# Wait for gateway
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
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
  Write-Host "  docker compose -f deploy/compose/docker-compose.yml up -d --build gateway"
  Write-Host "  Or: .\scripts\start-local-live.ps1 -HostGateway -SkipCompose"
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
  $env:HLS_PUBLIC_BASE_URL="http://localhost:9000/sqrm-recordings"
  $env:HLS_KEY_TEMPLATE="hls/{externalId}/{sessionId}"
  $env:GATEWAY_SERVICE_API_KEYS="dev-local-key"
  $env:TURN_ENABLED="true"
  $env:TURN_HOST="127.0.0.1"
  $env:TURN_USERNAME="softqraft"
  $env:TURN_PASSWORD="softqraftturn"
  pnpm run build:gateway
  pnpm dev:gateway
'@
}

$demo = Join-Path $Root "examples\local-live-test\index.html"
if (-not (Test-Path $demo)) {
  throw "Missing $demo"
}

$port = 5177
$demoDir = Split-Path $demo

Write-Host ""
Write-Host "Live test UI:  http://localhost:$port/" -ForegroundColor Green
Write-Host "  Host:        Go live → allow camera/mic (Echo auto by default)"
Write-Host "  HLS:         check Auto-start HLS or click Start HLS egress"
Write-Host "  WebRTC view: second tab, role=realtime_viewer, paste session id, Join"
Write-Host "  HLS view:    second tab, role=hls_viewer, paste session id, Join"
Write-Host "  MinIO:       http://localhost:9001  (softqraft / softqraftsecret)"
Write-Host "  Gateway:     $GatewayUrl"
Write-Host "  Smoke API:   .\scripts\smoke-phase1.ps1"
Write-Host "  Smoke 3:     .\scripts\smoke-phase3.ps1"
Write-Host ""
Write-Host "Press Ctrl+C to stop the static server." -ForegroundColor Yellow

Start-Process "http://localhost:$port/?gateway=$([uri]::EscapeDataString($GatewayUrl))&apiKey=$([uri]::EscapeDataString($ApiKey))&role=host&identity=local-host"

$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) {
  Set-Location $demoDir
  python -m http.server $port
} else {
  npx --yes serve -l $port $demoDir
}
