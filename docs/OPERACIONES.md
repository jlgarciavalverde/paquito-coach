# Operaciones

## Primera instalación en el VPS (una vez)
En una terminal normal del Mac: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`. Después, en el VPS:
```sh
mkdir -p ~/servicios/coach && cd ~/servicios/coach
# el .env.example lo copia tools/deploy.mjs; si aún no está, créalo desde deploy/.env.example
cp .env.example .env && chmod 600 .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^SETUP_CODE=.*|SETUP_CODE=$(openssl rand -hex 12)|" .env
grep SETUP_CODE .env      # este código se usa UNA vez en /instalar
```
En Cloudflare Zero Trust → Networks → Tunnels → (túnel existente) → Public hostname:
`paquito.redgarverde.com` → `HTTP` → `coach:3000`. **No tocar** los registros existentes del dominio.

## Desplegar una versión
```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
colima status || colima start
node tools/deploy.mjs 0.1.0
```
Hace: typecheck + tests → imagen `paquito-coach:X.Y.Z` (amd64) → `docker load` por SSH → copia `pg_dump` previa
(`backups/pre-X.Y.Z-*.sql.gz`) → `docker compose up -d` → espera `/health` con la versión nueva y `db: ok`.
Si no responde, **vuelve sola a la versión anterior**. Las migraciones se aplican al arrancar la API.

## Copias de seguridad
- Automática: servicio `coach-backup`, un `pg_dump` al día en `~/servicios/coach/backups/` (14 días).
- Antes de cada despliegue: `backups/pre-<versión>-<epoch>.sql.gz`.
- Al Mac: `tools/pull-backups.sh` (pendiente programarlo con launchd).
- **Restaurar**: `gunzip -c backups/coach-AAAA-MM-DD.sql.gz | docker exec -i coach-db psql -U coach -d coach` (sobre una BD vacía: `docker compose down; docker volume rm coach_coach-db; docker compose up -d db`).

## Volver atrás a mano
`cd ~/servicios/coach && sed -i "s|image: paquito-coach:.*|image: paquito-coach:<anterior>|" docker-compose.yml && docker compose up -d`
(las imágenes anteriores siguen cargadas; si la versión nueva migró la BD, restaurar la copia `pre-`).

## Contraseña del entrenador olvidada (hasta F6)
Genera un hash con la propia app y actualízalo por SQL:
```sh
docker exec coach node -e "const c=require('node:crypto');const s=c.randomBytes(16);c.scrypt(process.argv[1].normalize('NFKC'),s,64,{N:32768,r:8,p:1,maxmem:67108864},(e,k)=>console.log('scrypt\$32768\$8\$1\$'+s.toString('base64')+'\$'+k.toString('base64')))" 'contraseña-nueva-larga'
docker exec -it coach-db psql -U coach -d coach -c "update users set password_hash='<hash>' where role='coach' and lower(email)='<correo>'"
```

## Salud y logs
`docker ps --filter name=coach` · `docker logs coach --tail 100` · `curl -s https://paquito.redgarverde.com/health`
