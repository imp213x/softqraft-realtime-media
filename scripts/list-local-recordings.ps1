# List Echo MP4s in local MinIO (sqrm-recordings)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "MinIO console: http://localhost:9001  (softqraft / softqraftsecret)" -ForegroundColor Cyan
Write-Host "Bucket: sqrm-recordings" -ForegroundColor Cyan
Write-Host ""

docker compose -f deploy/compose/docker-compose.yml run --rm --entrypoint /bin/sh minio-init -c @"
mc alias set local http://minio:9000 softqraft softqraftsecret >/dev/null
mc mb -p local/sqrm-recordings 2>/dev/null || true
echo '--- objects ---'
mc ls --recursive local/sqrm-recordings/ || echo '(empty)'
"@
