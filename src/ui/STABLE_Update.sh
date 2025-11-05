#!/bin/bash
# Pi Show WebUI updater — v2 (self-repairing)
# ------------------------------------------------------------
# Dit script haalt de laatste code van GitHub, installeert dependencies,
# en start de pi-show-webui service opnieuw.
# Het herstelt automatisch uitvoerrechten en line endings.

set -euo pipefail
APP_DIR="/home/mando/pi_show_webui"
VENV_DIR="$APP_DIR/.venv"

# --- Zelfherstel uitvoerrechten & line endings ---
chmod +x "$0" 2>/dev/null || true
command -v dos2unix >/dev/null 2>&1 && dos2unix "$0" 2>/dev/null || true

# --- Functies ---
log() { echo "[update] $*"; }

cd "$APP_DIR"

log "stopping service (if any)..."
sudo systemctl stop pi-show-webui 2>/dev/null || true

log "pulling latest code..."
git fetch --all
git reset --hard origin/main

log "ensuring venv exists..."
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

log "installing deps..."
source "$VENV_DIR/bin/activate"
pip install -r requirements.txt

log "starting service..."
sudo systemctl start pi-show-webui || true

log "done."