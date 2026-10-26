#!/usr/bin/env node
/**
 * Las consultas que más tiempo se llevan (Q1, pg_stat_statements). Uso:
 *   node tools/slow-queries.mjs                 → BD de desarrollo
 *   node tools/slow-queries.mjs --vps           → producción (por SSH, dentro de coach-db; nada sale del servidor)
 *   node tools/slow-queries.mjs --reset         → pone los contadores a cero (para medir un cambio)
 * Postgres tiene que arrancar con `shared_preload_libraries=pg_stat_statements` (así están los compose).
 */
import { execFileSync } from "node:child_process";

const vps = process.argv.includes("--vps");
const reset = process.argv.includes("--reset");
const HOST = process.env.VPS_HOST ?? "joseluis@192.168.18.7";
const sql = reset
  ? "create extension if not exists pg_stat_statements; select pg_stat_statements_reset();"
  : `create extension if not exists pg_stat_statements;
select round(total_exec_time::numeric, 1) as total_ms, calls, round(mean_exec_time::numeric, 2) as media_ms, round(max_exec_time::numeric, 1) as max_ms, rows,
       regexp_replace(left(query, 160), '\\s+', ' ', 'g') as consulta
from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc limit 20;`;
const args = ["exec", "-i", vps ? "coach-db" : "coach-db-dev", "psql", "-U", "coach", "-d", "coach", "-P", "pager=off", "-c", sql];
const out = vps ? execFileSync("ssh", ["-o", "BatchMode=yes", HOST, `docker ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`], { encoding: "utf8" }) : execFileSync("docker", args, { encoding: "utf8" });
process.stdout.write(out);
