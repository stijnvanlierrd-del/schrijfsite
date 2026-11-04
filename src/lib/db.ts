import "server-only";
import { neon } from "@neondatabase/serverless";

export type Row = Record<string, unknown>;
type Runner = (text: string, params: unknown[]) => Promise<Row[]>;

let runner: Runner | null = null;
let schemaReady: Promise<void> | null = null;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is niet ingesteld.");
  return url;
}

async function getRunner(): Promise<Runner> {
  if (runner) return runner;
  const url = databaseUrl();
  if (/\.neon\.tech/i.test(url) && process.env.DB_DRIVER !== "pg") {
    // Neon: stateless HTTP-driver, ideaal voor serverless functies op Vercel.
    const sql = neon(url);
    runner = (text, params) => sql.query(text, params as unknown[]) as Promise<Row[]>;
  } else {
    // Lokale/generieke PostgreSQL (ontwikkeling en tests).
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: url, max: 5 });
    pool.on("error", () => {});
    runner = async (text, params) => (await pool.query(text, params as unknown[])).rows as Row[];
  }
  return runner;
}

/** Zorgt eenmalig per instantie dat de tabellen bestaan (vangnet naast `npm run db:migrate`). */
async function ensureSchema(run: Runner): Promise<void> {
  const rows = await run("SELECT to_regclass('public.login_attempts') AS t, to_regclass('public.glyphs') AS g", []);
  if (rows[0]?.t && rows[0]?.g) return;
  const { SCHEMA_STATEMENTS } = await import("./schema");
  for (const statement of SCHEMA_STATEMENTS) {
    try {
      await run(statement, []);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Gelijktijdige cold starts: "bestaat al" mag genegeerd worden.
      if (code !== "42P07" && code !== "23505" && code !== "42710") throw err;
    }
  }
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const run = await getRunner();
  if (!schemaReady) {
    schemaReady = ensureSchema(run).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  return (await run(text, params)) as T[];
}

export async function queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
