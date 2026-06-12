#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/raindragon14/omnigate.git"
APP_DIR="${HOME}/omnigate"

echo "==> Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo "Error: Docker is not installed."
  echo "Install it first: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "Error: Docker Compose is not available."
  exit 1
fi

echo "==> Cloning OmniGate..."
if [ -d "$APP_DIR" ]; then
  echo "Repository already exists at $APP_DIR — pulling latest..."
  cd "$APP_DIR"
  git pull --rebase
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "==> Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Edit  $APP_DIR/.env"
  echo "║  with your API keys, then run:                      ║"
  echo "║                                                     ║"
  echo "║    docker compose up -d                             ║"
  echo "║                                                     ║"
  echo "║  Or let this script continue with empty keys         ║"
  echo "║  (only providers with configured keys will activate) ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  read -r -p "Press Enter to continue with default .env, or Ctrl+C to edit first..."
fi

echo "==> Building and starting OmniGate..."
docker compose up -d --build

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  OmniGate is running!                                ║"
echo "║                                                     ║"
echo "║  URL:      http://localhost:8787                     ║"
echo "║  Health:   curl http://localhost:8787/health         ║"
echo "║  Models:   curl http://localhost:8787/v1/models      ║"
echo "║                                                     ║"
echo "║  Logs:     docker compose logs -f                    ║"
echo "║  Stop:     docker compose down                       ║"
echo "║  Update:   git pull && docker compose up -d --build  ║"
echo "╚══════════════════════════════════════════════════════╝"
