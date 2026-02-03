#!/usr/bin/env bash
set -euo pipefail

PORT="${CDP_PORT:-9222}"
PROFILE_DIR="${CDP_PROFILE_DIR:-/tmp/ag-chrome-profile}"
LOG_FILE="${CDP_LOG_FILE:-/tmp/chromium-cdp.log}"

echo "[browser] killing old chromium on :$PORT (if any)"
pkill -f "remote-debugging-port=${PORT}" >/dev/null 2>&1 || true

rm -rf "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"

echo "[browser] starting chromium headless on 127.0.0.1:${PORT}"
chromium \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="$PROFILE_DIR" \
  about:blank \
  >"$LOG_FILE" 2>&1 &

CHROMIUM_PID=$!
echo "[browser] CHROMIUM_PID=${CHROMIUM_PID}"

# wait until CDP endpoint responds
for i in {1..20}; do
  if wget -qO- --timeout=2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "[browser] ready"
    exit 0
  fi
  sleep 0.5
done

echo "[browser] NOT_READY after 10s"
tail -n 80 "$LOG_FILE" || true
exit 1
