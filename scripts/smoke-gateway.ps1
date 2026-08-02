# Smoke test for Gateway (sessions + optional multi-tenant isolation).
# LiveKit required for create session (createRoom). Health-only works without it.
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$ApiKey = "dev-local-key",
  # Optional second tenant key to verify isolation (GATEWAY_TENANTS must include it)
  [string]$OtherApiKey = ""
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
  profile = "hybrid_live"
} | ConvertTo-Json

$session = Invoke-RestMethod -Uri "$BaseUrl/v1/sessions" -Method POST -Headers $headers -Body $createBody
$session | ConvertTo-Json -Depth 5

$id = $session.sessionId
Write-Host "GET $BaseUrl/v1/sessions/$id"
Invoke-RestMethod -Uri "$BaseUrl/v1/sessions/$id" -Method GET -Headers $headers | ConvertTo-Json -Depth 5

if ($OtherApiKey) {
  Write-Host "Isolation check: other tenant should get 404"
  $otherHeaders = @{ Authorization = "Bearer $OtherApiKey" }
  try {
    Invoke-RestMethod -Uri "$BaseUrl/v1/sessions/$id" -Method GET -Headers $otherHeaders | Out-Null
    throw "Expected 404 for cross-tenant access"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -ne 404) { throw "Expected HTTP 404, got $code : $_" }
    Write-Host "Isolation OK (404)"
  }
}

Write-Host "POST $BaseUrl/v1/sessions/$id/end"
Invoke-RestMethod -Uri "$BaseUrl/v1/sessions/$id/end" -Method POST -Headers $headers | ConvertTo-Json -Depth 5

Write-Host "Smoke gateway: OK"
