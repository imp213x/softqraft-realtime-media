# SoftQraft Realtime Media — Phase 1 API smoke (Gateway + LiveKit)
# Prerequisites:
#   docker compose -f deploy/compose/docker-compose.yml up -d
#   OR: media plane up + pnpm dev:gateway with deploy/env settings
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$ApiKey = "dev-local-key"
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
    [string]$Body
  )
  $authOnly = @{ Authorization = "Bearer $ApiKey" }
  if ($PSBoundParameters.ContainsKey("Body")) {
    return Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers -Body $Body
  }
  # No body: omit Content-Type (Fastify rejects empty JSON bodies)
  return Invoke-RestMethod -Uri $Url -Method $Method -Headers $authOnly
}

Write-Host "== health =="
Invoke-RestMethod -Uri "$BaseUrl/health" | ConvertTo-Json

Write-Host "== ready =="
try {
  Invoke-RestMethod -Uri "$BaseUrl/ready" | ConvertTo-Json
} catch {
  Write-Host "ready failed (is LiveKit up?): $_" -ForegroundColor Yellow
}

$idem = "smoke-$(Get-Date -Format 'yyyyMMddHHmmss')"
$createBody = @{
  idempotencyKey = $idem
  externalId     = "demo-workspace"
  roomName       = "workspace-demo-smoke"
  profile        = "creator_live_webrtc"
  audience       = @{ mode = "realtime"; visibility = "public" }
  metadata       = @{ consumer = "smoke" }
} | ConvertTo-Json -Depth 5

Write-Host "== create session =="
$session = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions" -Body $createBody
$session | ConvertTo-Json -Depth 6
$sessionId = $session.sessionId

Write-Host "== mint host token =="
$tokenBody = @{
  identity = "host-smoke"
  name     = "Smoke Host"
  role     = "host"
  ttlSeconds = 600
} | ConvertTo-Json
$token = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/tokens" -Body $tokenBody
Write-Host "token length: $($token.token.Length) realtimeUrl=$($token.realtimeUrl)"

Write-Host "== mint viewer token =="
$viewerBody = @{
  identity = "viewer-smoke"
  role     = "realtime_viewer"
} | ConvertTo-Json
$viewer = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/tokens" -Body $viewerBody
Write-Host "viewer token length: $($viewer.token.Length)"

Write-Host "== start room_composite_file egress =="
$egressBody = @{
  type = "room_composite_file"
  options = @{
    keyTemplate = "recordings/{externalId}/{sessionId}-{time}.mp4"
  }
} | ConvertTo-Json -Depth 5
try {
  $egress = Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/egress" -Body $egressBody
  $egress | ConvertTo-Json -Depth 6
  Write-Host "Note: composite may stay empty until a publisher joins the room."
} catch {
  Write-Host "egress start error (expected if no publisher / egress down): $_" -ForegroundColor Yellow
}

Write-Host "== list egress =="
try {
  Invoke-Json -Method GET -Url "$BaseUrl/v1/sessions/$sessionId/egress" | ConvertTo-Json -Depth 6
} catch {
  Write-Host "list egress: $_" -ForegroundColor Yellow
}

Write-Host "== end session =="
Invoke-Json -Method POST -Url "$BaseUrl/v1/sessions/$sessionId/end" -Body "{}" | ConvertTo-Json -Depth 5

Write-Host "Phase 1 smoke finished." -ForegroundColor Green
