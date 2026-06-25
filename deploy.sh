#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/raindragon14/omnigate.git"
APP_DIR="${HOME}/omnigate"

generate_api_key() {
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32
    return
  fi

  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
}

set_env_value() {
  key="$1"
  value="$2"
  file="$3"
  tmp_file="${file}.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "$file" >"$tmp_file"
  mv "$tmp_file" "$file"
}

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
  generated_api_key="$(generate_api_key)"
  set_env_value "OMNIGATE_API_KEY" "$generated_api_key" .env
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Created  $APP_DIR/.env"
  echo "║  with a generated OMNIGATE_API_KEY.                 ║"
  echo "║                                                     ║"
  echo "║  Add provider API keys                              ║"
  echo "║  to enable upstream providers, then run:            ║"
  echo "║                                                     ║"
  echo "║    docker compose up -d                             ║"
  echo "║                                                     ║"
  echo "║  The app can start without provider keys, but chat   ║"
  echo "║  requests will fail until one provider key is set.   ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  if [ -t 0 ]; then
    read -r -p "Press Enter to continue, or Ctrl+C to edit .env first..."
  fi
fi

echo "==> Building and starting OmniGate..."
docker compose up -d --build

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  OmniGate is running!                                ║"
echo "║                                                     ║"
echo "║  URL:      http://localhost:8787                     ║"
echo "║  Health:   curl http://localhost:8787/health         ║"
echo "║  Models:   curl -H 'Authorization: Bearer <key>'     ║"
echo "║            http://localhost:8787/v1/models           ║"
echo "║                                                     ║"
echo "║  Logs:     docker compose logs -f                    ║"
echo "║  Stop:     docker compose down                       ║"
echo "║  Update:   git pull && docker compose up -d --build  ║"
echo "╚══════════════════════════════════════════════════════╝"
