#!/usr/bin/env bash
set -euo pipefail

# Guild Hall user service installer
# Run with: ./deploy/install.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_FILE="$SCRIPT_DIR/guild-hall.service"
USER_SERVICES="$HOME/.config/systemd/user"

# Build production bundle
echo "Building production bundle..."
cd "$PROJECT_DIR" && bun run build

# Install service
echo "Installing service file..."
mkdir -p "$USER_SERVICES"
cp "$SERVICE_FILE" "$USER_SERVICES/guild-hall.service"
systemctl --user daemon-reload

# Enable and (re)start
echo "Enabling and starting service..."
systemctl --user enable guild-hall
systemctl --user restart guild-hall

echo ""
echo "Guild Hall deployed. Listening on port 5050."
echo "  Status:  systemctl --user status guild-hall"
echo "  Logs:    journalctl --user -u guild-hall -f"
