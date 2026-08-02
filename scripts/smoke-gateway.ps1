# Smoke test for Gateway skeleton (no LiveKit required for create/get session).
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$ApiKey = "dev-local-key"
)

$ErrorActionPreference = "Stop"
$headers = @{
  Authorization = "Bearer $ApiKey"
  "Content-Type" = "application/json"
}

Write-Host "GET $BaseUrl/health"
Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET | ConvertTo-Json

Write-Host "POST $BaseUrl/v1/sessions"
$createBody = @{
  idempotencyKey = "smoke-$(Get-Date -Format 'yyyyMMddHHmmss')"
  metadata = @{ clattersLiveId = "smoke" }
  audience = @{ mode = "hls"; visibility = "public" }
} | ConvertTo-Json

$session = Invoke-RestMethod -Uri "$BaseUrl/v1/sessions" -Method POST -Headers $headers -Body $createBody
$session | ConvertTo-Json -Depth 5

$id = $session.sessionId
Write-Host "GET $BaseUrl/v1/sessions/$id"
Invoke-RestMethod -Uri "$BaseUrl/v1/sessions/$id" -Method GET -Headers $headers | ConvertTo-Json -Depth 5

Write-Host "POST $BaseUrl/v1/sessions/$id/end"
Invoke-RestMethod -Uri "$BaseUrl/v1/sessions/$id/end" -Method POST -Headers $headers | ConvertTo-Json -Depth 5

Write-Host "Smoke gateway: OK"
