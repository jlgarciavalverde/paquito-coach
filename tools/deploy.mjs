// Despliega la app en joseluis-vps: tests → imagen amd64 → subida por SSH → migraciones al arrancar → /health.
// Si la versión nueva no responde, vuelve sola a la anterior (sigue cargada en el VPS).
//
//   node tools/deploy.mjs <X.Y.Z> [--skip-tests]
//
// Requisitos: Colima/Docker en marcha, `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` hecho en una terminal normal.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const HOST = "joseluis@192.168.18.7";
const DIR = "~/servicios/coach";
const IMAGE = "paquito-coach";
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Uso: node tools/deploy.mjs <X.Y.Z>");

const root = resolve(import.meta.dirname, "..");
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();

if (!process.argv.includes("--skip-tests")) {
  console.log("→ Typecheck y tests…");
  sh("pnpm", ["typecheck"]);
  sh("pnpm", ["test"]);
}

console.log(`→ Imagen ${IMAGE}:${version} (linux/amd64)…`);
sh("docker", ["buildx", "build", "--platform", "linux/amd64", "--build-arg", `APP_VERSION=${version}`, "-t", `${IMAGE}:${version}`, "--load", "."]);

console.log("→ Subiendo la imagen al VPS…");
execFileSync("sh", ["-c", `docker save ${IMAGE}:${version} | gzip | ssh ${HOST} 'docker load'`], { stdio: "inherit" });

const previous = out("ssh", [HOST, `grep -o 'image: ${IMAGE}:[^ ]*' ${DIR}/docker-compose.yml 2>/dev/null | cut -d: -f3 || true`]);
sh("ssh", [HOST, `mkdir -p ${DIR}/backups`]);
sh("scp", ["deploy/docker-compose.yml", `${HOST}:${DIR}/docker-compose.yml`]);
sh("scp", ["deploy/.env.example", `${HOST}:${DIR}/.env.example`]);
const hasEnv = out("ssh", [HOST, `test -f ${DIR}/.env && echo si || echo no`]) === "si";
if (!hasEnv) {
  throw new Error(`Falta ${DIR}/.env en el VPS. Créalo a partir de .env.example (ver docs/OPERACIONES.md → «Primera instalación») y vuelve a lanzar.`);
}

if (previous) {
  console.log(`→ Copia de la base de datos antes de actualizar (versión actual: ${previous})…`);
  try {
    sh("ssh", [HOST, `cd ${DIR} && docker exec coach-db pg_dump -U coach -d coach --no-owner | gzip > backups/pre-${version}-$(date +%s).sql.gz`]);
  } catch {
    console.warn("  ⚠ No se pudo hacer la copia previa (¿la base de datos no estaba en marcha?).");
  }
}

console.log(`→ Arrancando ${version}…`);
const up = (v) => `cd ${DIR} && sed -i "s|image: ${IMAGE}:.*|image: ${IMAGE}:${v}|" docker-compose.yml && sed -i "s|^APP_VERSION=.*|APP_VERSION=${v}|" .env && docker compose up -d`;
sh("ssh", [HOST, up(version)]);

console.log("→ Verificando /health…");
let healthy = false;
for (let i = 0; i < 20 && !healthy; i++) {
  try {
    const body = out("ssh", [HOST, `sleep 3; docker exec coach node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"`]);
    const h = JSON.parse(body);
    healthy = h.version === version && h.db === "ok";
  } catch {
    // arrancando
  }
}
if (!healthy) {
  sh("ssh", [HOST, "docker logs coach --tail 40"]);
  if (previous && previous !== version) {
    console.error(`✗ ${version} no responde: volviendo a ${previous}…`);
    sh("ssh", [HOST, up(previous)]);
  }
  throw new Error(`Despliegue de ${version} fallido.`);
}
sh("ssh", [HOST, "docker ps --filter name=coach --format 'table {{.Names}}\\t{{.Status}}'"]);
console.log(`\n✓ ${IMAGE}:${version} desplegada.`);
