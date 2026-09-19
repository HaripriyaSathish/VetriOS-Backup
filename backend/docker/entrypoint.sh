#!/bin/sh
# Container entrypoint: joins the Tailscale network (userspace mode, since
# Render doesn't grant /dev/net/tun access), starts the local TCP->SOCKS5
# relay that lets Django reach the tailnet-only Postgres host, then hands
# off to gunicorn. See docker/tailscale_pg_proxy.py for why the relay
# exists at all.
set -e

STATE_DIR="${TAILSCALE_STATE_DIR:-/tmp/tailscaled}"
mkdir -p "$STATE_DIR"

if [ -z "$TAILSCALE_AUTHKEY" ]; then
  echo "[entrypoint] ERROR: TAILSCALE_AUTHKEY is not set." >&2
  exit 1
fi
if [ -z "$TAILSCALE_DB_HOST" ]; then
  echo "[entrypoint] ERROR: TAILSCALE_DB_HOST is not set." >&2
  exit 1
fi

echo "[entrypoint] starting tailscaled (userspace networking)..."
tailscaled \
  --tun=userspace-networking \
  --socks5-server=127.0.0.1:1055 \
  --state="$STATE_DIR/tailscaled.state" \
  --statedir="$STATE_DIR" \
  > /tmp/tailscaled.log 2>&1 &

# give tailscaled a moment to create its control socket before `up`
sleep 2

echo "[entrypoint] joining tailnet as ${TAILSCALE_HOSTNAME:-vetrios-render}..."
tailscale up \
  --authkey="$TAILSCALE_AUTHKEY" \
  --hostname="${TAILSCALE_HOSTNAME:-vetrios-render}" \
  --accept-dns=false \
  --timeout=60s

echo "[entrypoint] tailscale status:"
tailscale status || true

echo "[entrypoint] starting Postgres relay (-> $TAILSCALE_DB_HOST:${TAILSCALE_DB_PORT:-5432})..."
python docker/tailscale_pg_proxy.py &

echo "[entrypoint] waiting for relay to accept connections..."
i=0
until python -c "
import socket, sys
s = socket.socket()
s.settimeout(1)
try:
    s.connect(('127.0.0.1', ${PG_PROXY_LISTEN_PORT:-5433}))
except OSError:
    sys.exit(1)
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 20 ]; then
    echo "[entrypoint] ERROR: relay never came up." >&2
    exit 1
  fi
  sleep 0.5
done
echo "[entrypoint] relay is up."

echo "[entrypoint] collecting static files..."
python manage.py collectstatic --noinput

echo "[entrypoint] starting gunicorn..."
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-3}" \
  --access-logfile - \
  --error-logfile -
