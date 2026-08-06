#!/bin/sh
# Ensure credential store directory is writable by the gateway user.
set -e
if [ -d /data ]; then
  chown -R softqraft:softqraft /data 2>/dev/null || true
  chmod u+rwX /data 2>/dev/null || true
fi
exec su-exec softqraft "$@"
