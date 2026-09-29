#!/bin/sh
# Vigila la app cada 10 minutos (LaunchAgent). Avisa con una notificación de macOS si falla dos veces seguidas
# y otra vez cuando se recupera. Comprueba por SSH (dentro del VPS) y por el dominio público si ya existe.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
STATE="$HOME/Backups/paquito-coach/.monitor"
mkdir -p "$(dirname "$STATE")"
PUBLIC="${COACH_PUBLIC_URL:-https://paquito.redgarverde.com}"
notify() { osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null || true; }

problem=""
inside=$(ssh -o BatchMode=yes -o ConnectTimeout=10 joseluis@192.168.18.7 \
  "docker exec ${COACH_CONTAINER:-coach} node -e \"fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(j=>console.log(j.status+' '+j.db))\"" 2>/dev/null || echo "sin-respuesta")
case "$inside" in "ok ok") ;; *) problem="la app no responde dentro del VPS ($inside)" ;; esac
# El dominio público solo se comprueba si resuelve (la ruta de Cloudflare puede no existir todavía).
if [ -z "$problem" ] && host "$(echo "$PUBLIC" | sed 's|https://||')" >/dev/null 2>&1; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$PUBLIC/health" || echo 000)
  [ "$code" = "200" ] || problem="$PUBLIC/health devuelve $code"
fi

prev=$(cat "$STATE" 2>/dev/null || echo 0)
if [ -n "$problem" ]; then
  n=$((prev + 1)); echo "$n" > "$STATE"
  echo "$(date '+%F %T') fallo $n: $problem"
  [ "$n" -eq 2 ] && notify "Paquito Coach está caído" "$problem"
else
  [ "$prev" -ge 2 ] && notify "Paquito Coach vuelve a funcionar" "Todo en orden de nuevo."
  echo 0 > "$STATE"
  echo "$(date '+%F %T') ok"
fi
