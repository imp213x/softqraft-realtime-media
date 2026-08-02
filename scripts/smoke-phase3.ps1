# SoftQraft Realtime Media — Phase 3 market-grade API smoke
# Prerequisites: docker compose up (LiveKit + Gateway + MinIO); optional TURN profile
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$ApiKey = "dev-local-key",
  [string]$OtherApiKey = ""  # e.g. demo-key when GATEWAY_TENANTS includes demo
)

$ErrorActionPreference = "Stop"
$headers = @{
  Authorization = "Bearer $ApiKey"
  "Content-Type"  = "application/json"
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [string]$Body,
    [hashtable]$Hdr = $headers
  )
  if ($PSBoundParameters.ContainsKey("Body")) {
    return Invoke-RestMethod -Uri $Url -Method $Method -Headers $Hdr -Body $Body
  }
  $authOnly = @{ Authorization = $Hdr.Authorization }
  return Invoke-RestMethod -Uri $Url -Method $Method -Headers $authOnly
}

Write-Host "== Phase 3 smoke (tokens iceServers + HLS egress type) ==" -ForegroundColor Cyan

Write-Host "== health =="
Invoke-RestMethod -Uri "$BaseUrl/health" | ConvertTo-Json

$idem = "smoke3-$(Get-Date -Format 'yyyyMMddHHmmss')"
$createBody = @{
  idempotencyKey = $idem
  externalId     = "local-dev"
  profile        = "hybrid_live"
  audience       = @{ mode = "hybrid"; visibility = "public" }
  metadata       = @{ consumer = "smoke-phase3" }
} | ConvertTo-Json -Depth 5

Write-Host "== create hybrid session =="
$session = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions" -Body $createBody
$session | ConvertTo-Json -Depth 6
$sessionId = $session.sessionId
if ($session.tenantId) { Write-Host "tenantId=$($session.tenantId)" }

Write-Host "== mint host token (expect iceServers) =="
$tokenBody = @{
  identity   = "host-smoke3"
  name       = "Smoke3 Host"
  role       = "host"
  ttlSeconds = 600
} | ConvertTo-Json
$token = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/tokens" -Body $tokenBody
Write-Host "token length=$($token.token.Length) realtimeUrl=$($token.realtimeUrl)"
if ($token.iceServers) {
  Write-Host "iceServers groups: $($token.iceServers.Count)" -ForegroundColor Green
  $token.iceServers | ConvertTo-Json -Depth 5
} else {
  Write-Host "WARN: no iceServers on token (set TURN_ENABLED/TURN_HOST on Gateway)" -ForegroundColor Yellow
}

Write-Host "== start room_composite_hls (may stay empty without publisher) =="
$hlsBody = @{
  type = "room_composite_hls"
  options = @{
    keyTemplate             = "hls/{externalId}/{sessionId}"
    segmentDurationSeconds  = 2
    livePlaylistName        = "live.m3u8"
  }
} | ConvertTo-Json -Depth 5
try {
  $hls = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/egress" -Body $hlsBody
  $hls | ConvertTo-Json -Depth 6
  if ($hls.playback.hlsUrl) {
    Write-Host "playback.hlsUrl=$($hls.playback.hlsUrl)" -ForegroundColor Green
  } else {
    Write-Host "WARN: no playback.hlsUrl (set HLS_PUBLIC_BASE_URL)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "HLS egress start error (rebuild gateway if 501): $_" -ForegroundColor Yellow
}

if ($OtherApiKey) {
  Write-Host "== tenant isolation (other key should 404) =="
  $other = @{ Authorization = "Bearer $OtherApiKey" }
  try {
    Invoke-RestMethod -Uri "$BaseUrl/v1/sessions/$sessionId" -Method GET -Headers $other | Out-Null
    throw "Expected 404 for cross-tenant GET"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 404) {
      Write-Host "Isolation OK (404)" -ForegroundColor Green
    } else {
      Write-Host "Isolation check: $_" -ForegroundColor Yellow
    }
  }
}

Write-Host "== playback =="
try {
  Invoke-Json -Method GET -Url "$BaseUrl/v1/sessions/$sessionId/playback" | ConvertTo-Json -Depth 5
} catch {
  Write-Host "playback: $_" -ForegroundColor Yellow
}

Write-Host "== end session =="
Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/end" -Body "{}" | ConvertTo-Json -Depth 5

Write-Host "Phase 3 smoke finished." -ForegroundColor Green
Write-Host "Full UI: .\scripts\start-local-live.ps1 -RebuildGateway"
Write-Host "Docs:    docs/operations/local-live-test.md  |  docs/operations/turn-hls-cdn.md"
