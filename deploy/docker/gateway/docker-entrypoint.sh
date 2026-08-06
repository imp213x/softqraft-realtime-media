#!/bin/sh
# Keep this file LF-only (no Windows CRLF) or Docker exits 126.
set -e
if [ -d /data ]; then
  chown -R softqraft:softqraft /data 2>/dev/null || true
  chmod u+rwX /data 2>/dev/null || true
fi
cd /app
# Run as root in prebuilt image (Docker DNS blocks apk; no su-exec).
# Process is only reachable on the Docker network / localhost:8080.
exec node dist/index.js
