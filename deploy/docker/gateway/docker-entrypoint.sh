#!/bin/sh
# No external packages required (Docker DNS often cannot reach apk repos).
# Ensure /data is writable, then start Node as softqraft when possible.
set -e

if [ -d /data ]; then
  chown -R softqraft:softqraft /data 2>/dev/null || true
  chmod u+rwX /data 2>/dev/null || true
fi

cd /app || true

# Drop privileges via busybox su (built into alpine; no apk install)
if [ "$(id -u)" = "0" ] && id softqraft >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  exec su softqraft -s /bin/sh -c 'exec "$@"' -- "$@"
fi

exec "$@"
