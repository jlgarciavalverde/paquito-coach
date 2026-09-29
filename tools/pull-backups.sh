#!/bin/sh
# Trae las copias de la base de datos y de las fotos del VPS al Mac (~/Backups/paquito-coach) y, si hay una
# copia nueva, lanza el simulacro de restauración. Lo ejecuta el LaunchAgent (deploy/launchd/) una vez al día.
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DEST="$HOME/Backups/paquito-coach"
mkdir -p "$DEST"
before=$(ls "$DEST" 2>/dev/null | wc -l | tr -d ' ')
rsync -a --ignore-existing -e "ssh -o BatchMode=yes -o ConnectTimeout=15" joseluis@192.168.18.7:servicios/coach/backups/ "$DEST/"
after=$(ls "$DEST" | wc -l | tr -d ' ')
# Conserva 60 días en el Mac (el VPS guarda 14).
find "$DEST" \( -name 'coach-*.sql.gz' -o -name 'media-*.tar.gz' -o -name 'pre-*.sql.gz' \) -mtime +60 -delete
last=$(ls -t "$DEST"/coach-*.sql.gz 2>/dev/null | head -1 || true)
[ -n "$last" ] && gzip -t "$last" && echo "$(date '+%F %T') ok: $last ($((after - before)) archivos nuevos)"
if [ "$after" -gt "$before" ]; then "$(dirname "$0")/restore-drill.sh"; fi
