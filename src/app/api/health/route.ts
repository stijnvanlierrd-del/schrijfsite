import { query } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Statuscontrole: database bereikbaar en AI geconfigureerd (zonder geheimen te tonen). */
export async function GET() {
  let database = false;
  try {
    const rows = await query<{ ok: number }>("SELECT 1 AS ok");
    database = rows[0]?.ok === 1;
  } catch (err) {
    console.error("health:", err);
  }
  return json({ ok: database, database, ai: Boolean(process.env.GEMINI_API_KEY) }, database ? 200 : 503);
}
