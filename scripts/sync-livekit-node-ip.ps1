# Set LiveKit rtc.node_ip to a host IP reachable by browser + Docker Egress.
param(
  [string]$NodeIp = "",
  [switch]$Recreate = $true
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Config = Join-Path $Root "deploy\docker\livekit\livekit.yaml"

function Get-PreferredLanIp {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.PrefixOrigin -ne "WellKnown"
    }

  # Prefer real Wi‑Fi/Ethernet RFC1918; avoid Hyper-V/WSL virtual switches when possible
  $preferred = $candidates | Where-Object {
    $_.InterfaceAlias -notmatch "vEthernet|WSL|Loopback|Bluetooth|Virtual" -and
    ($_.IPAddress -match "^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.")
  } | Select-Object -First 1

  if ($preferred) { return $preferred.IPAddress }

  $fallback = $candidates | Where-Object {
    $_.IPAddress -match "^192\.168\.|^10\."
  } | Select-Object -First 1

  if ($fallback) { return $fallback.IPAddress }

  throw "No suitable LAN IPv4 found. Pass -NodeIp explicitly."
}

if (-not $NodeIp) {
  $NodeIp = Get-PreferredLanIp
}

Write-Host "Using LiveKit node_ip = $NodeIp" -ForegroundColor Cyan

$yaml = Get-Content $Config -Raw
if ($yaml -notmatch "(?m)^\s*node_ip:") {
  throw "livekit.yaml missing node_ip field"
}
$yaml = [regex]::Replace($yaml, "(?m)^(\s*node_ip:\s*).*$", "`${1}$NodeIp")
Set-Content -Path $Config -Value $yaml -NoNewline
# Ensure trailing newline
Add-Content -Path $Config -Value ""

Write-Host "Updated $Config"

if ($Recreate) {
  Set-Location $Root
  docker compose -f deploy/compose/docker-compose.yml up -d --force-recreate livekit
  Start-Sleep -Seconds 3
  docker compose -f deploy/compose/docker-compose.yml logs livekit --tail 5
}

Write-Host ""
Write-Host "Browser signaling can stay ws://localhost:7880" -ForegroundColor Green
Write-Host "Media ICE will use $NodeIp:7882 (and TCP 7881)" -ForegroundColor Green
Write-Host "If PC connection fails, allow UDP 7882 / TCP 7881 in Windows Firewall for private networks." -ForegroundColor Yellow
