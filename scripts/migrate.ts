import { readdir, readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
const sql = db();
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(8142701)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    for (const name of (await readdir(new URL("../db/migrations/", import.meta.url))).filter(n => n.endsWith(".sql")).sort()) {
      const applied = await tx`SELECT name FROM schema_migrations WHERE name=${name}`;
      if (!applied.length) {
        await tx.unsafe(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8"));
        await tx`INSERT INTO schema_migrations(name) VALUES (${name})`;
        console.log(`Applied ${name}`);
      }
    }
  });
} finally { await sql.end(); }