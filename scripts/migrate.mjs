// Voert db/schema.sql uit op DATABASE_URL.  Gebruik:  DATABASE_URL=... npm run db:migrate
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}
const dir = path.dirname(fileURLToPath(import.meta.url));
const statements = readFileSync(path.join(dir, "..", "db", "schema.sql"), "utf8")
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

let run;
if (/\.neon\.tech/.test(url)) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  run = (q) => sql.query(q);
} else {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: url });
  await client.connect();
  run = (q) => client.query(q);
  process.on("exit", () => client.end());
}
for (const s of statements) {
  await run(s);
  console.log("✓", s.split("\n")[0].slice(0, 70));
}
console.log("Schema is up-to-date.");
process.exit(0);
