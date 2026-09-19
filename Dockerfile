# Single-service deploy: builds the React frontend, then serves it (plus
# the Django API) from one gunicorn process — one Render service, one URL.
# See backend/docker/entrypoint.sh for how the container starts up
# (Tailscale + the Postgres relay + gunicorn), and DEPLOY.md for the
# Render setup steps and required environment variables.

# ---- Stage 1: build the frontend ----
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend runtime, serving the built frontend too ----
FROM python:3.12-slim AS backend

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Tailscale, via its official Debian apt repo (avoids hardcoding a
# tarball version that may go stale) — used in userspace-networking mode
# since Render containers don't grant /dev/net/tun access.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl gnupg ca-certificates \
      build-essential libpq-dev libjpeg-dev zlib1g-dev libxml2-dev libxslt1-dev \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
         -o /usr/share/keyrings/tailscale-archive-keyring.gpg \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
         -o /etc/apt/sources.list.d/tailscale.list \
    && apt-get update && apt-get install -y --no-install-recommends tailscale \
    && apt-get purge -y curl gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

RUN chmod +x docker/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["docker/entrypoint.sh"]
