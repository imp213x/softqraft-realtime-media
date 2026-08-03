# Lab-only: make MinIO bucket anonymously readable so browser hls.js can play HLS.
# Production must use CDN signed URLs or public origin deliberately configured.
param(
  [string]$Bucket = "sqrm-recordings",
  [string]$Network = "softqraft-realtime-media_default",
  [string]$MinioHost = "minio",
  [string]$AccessKey = "softqraft",
  [string]$SecretKey = "softqraftsecret"
)

$ErrorActionPreference = "Stop"

Write-Host "Setting MinIO anonymous download on bucket '$Bucket' (lab HLS players)..."

$cmd = "mc alias set local http://${MinioHost}:9000 ${AccessKey} ${SecretKey} && mc mb -p local/${Bucket} || true && mc anonymous set download local/${Bucket} && mc anonymous get local/${Bucket}"

docker run --rm --entrypoint /bin/sh --network $Network minio/mc:latest -c $cmd
if ($LASTEXITCODE -ne 0) {
  Write-Host "WARN: could not set MinIO public read. Is compose network '$Network' up?" -ForegroundColor Yellow
  exit 1
}

# Verify host can GET a probe (bucket root may 403 listing; HEAD ok is enough via mc)
Write-Host "MinIO public download OK for local/$Bucket" -ForegroundColor Green
Write-Host "Test playlist (after HLS starts):"
Write-Host "  http://localhost:9000/$Bucket/hls/local-dev/<sessionId>/live.m3u8"
