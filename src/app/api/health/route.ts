import { query } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Statuscontrole: database bereikbaar (incl. parameters) en AI geconfigureerd — zonder geheimen te tonen. */
export async function GET() {
  let database = false;
  let params = false;
  let tables = false;
  try {
    const rows = await query<{ ok: number }>("SELECT 1 AS ok");
    database = rows[0]?.ok === 1;
    const probe = new Date("2026-01-02T03:04:05.000Z");
    const r = await query<{ t: string | Date; n: number; j: { a: number } }>(
      "SELECT $1::timestamptz AS t, cardinality($2::text[]) AS n, $3::jsonb AS j",
      [probe, ["een", "twee"], JSON.stringify({ a: 1 })],
    );
    params = new Date(r[0].t).getTime() === probe.getTime() && Number(r[0].n) === 2 && r[0].j?.a === 1;
    const t = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users','sessions','handwritings','glyphs','documents','ai_usage','login_attempts')",
    );
    tables = t[0]?.n === 7;
  } catch (err) {
    console.error("health:", err);
  }
  const ok = database && params && tables;
  return json({ ok, database, params, tables, ai: Boolean(process.env.GEMINI_API_KEY) }, ok ? 200 : 503);
}
