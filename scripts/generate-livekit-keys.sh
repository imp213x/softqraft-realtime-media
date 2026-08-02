#!/usr/bin/env bash
# Generate LiveKit API key/secret pair for self-hosted deployments.
set -euo pipefail
docker run --rm livekit/livekit-server generate-keys
