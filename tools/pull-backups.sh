#!/bin/sh
# Trae las copias de la base de datos del VPS al Mac (~/Backups/paquito-coach). Pensado para launchd/cron.
set -eu
DEST="$HOME/Backups/paquito-coach"
mkdir -p "$DEST"
rsync -a --ignore-existing joseluis@192.168.18.7:servicios/coach/backups/ "$DEST/"
# Comprueba que el último .gz no está corrupto.
last=$(ls -t "$DEST"/coach-*.sql.gz 2>/dev/null | head -1 || true)
[ -n "$last" ] && gzip -t "$last" && echo "ok: $last"
