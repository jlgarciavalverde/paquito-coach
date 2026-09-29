#!/bin/sh
# Instala (o reinstala) en este Mac las tareas programadas: copias del VPS + simulacro (13:00 y al iniciar sesión)
# y vigilante de caída (cada 10 min). Desinstalar: tools/install-launchd.sh --quitar
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$HOME/Backups/paquito-coach"
for name in coach-backups coach-monitor; do
  label="com.redgarverde.$name"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  if [ "${1:-}" = "--quitar" ]; then rm -f "$AGENTS/$label.plist"; echo "quitado $label"; continue; fi
  sed "s|__REPO__|$REPO|g; s|__HOME__|$HOME|g" "$REPO/deploy/launchd/$label.plist" > "$AGENTS/$label.plist"
  plutil -lint "$AGENTS/$label.plist" >/dev/null
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$label.plist"
  echo "instalado $label"
done
