---
name: deploy
description: Desplegar una versión de la app de Paquito en joseluis-vps (imagen Docker amd64, Postgres, vuelta atrás automática). Úsala cuando pidan desplegar, publicar o subir una versión.
---
# Desplegar

1. Comprueba que `docs/ESTADO.md` y `CHANGELOG.md` recogen lo que se va a desplegar. Elige versión SemVer (sección nueva en CHANGELOG).
2. `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`; `colima status || colima start`; `pnpm db:up`.
3. Verificación completa: `pnpm typecheck && pnpm test && pnpm build && pnpm e2e`. Si algo falla, **no despliegues**.
4. Comprueba SSH sin interacción: `ssh -o BatchMode=yes joseluis@192.168.18.7 true`. Si falla, pide al humano `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` en una terminal normal (no con `!`).
5. `node tools/deploy.mjs X.Y.Z --skip-tests` (ya se pasaron en el paso 3).
6. Verifica desde fuera: `curl -s https://<subdominio>/health` → versión nueva y `"db":"ok"`; `curl -sI https://<subdominio>/` → CSP, HSTS, `cache-control: no-store`.
7. Actualiza `docs/ESTADO.md` («Ahora mismo» + historial).

Nunca: compilar en el VPS, publicar puertos, tocar otros servicios (`compra`, `cheluisfit`, `nextcloud`, `cloudflared`) ni registros DNS existentes. Primera vez: ver `docs/OPERACIONES.md`.
