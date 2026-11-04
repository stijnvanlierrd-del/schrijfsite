import { query } from "@/lib/db";
import { assertSameOrigin, errorResponse, json, readJson, requireUser, str } from "@/lib/http";
import { validateJsonObject } from "@/lib/validate";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await query(
      `SELECT h.id, h.name, h.created_at, h.updated_at,
              (SELECT count(*)::int FROM glyphs g WHERE g.handwriting_id = h.id) AS glyph_count,
              (SELECT count(DISTINCT g.ch)::int FROM glyphs g WHERE g.handwriting_id = h.id) AS char_count,
              (h.analysis IS NOT NULL) AS analysed
         FROM handwritings h WHERE h.user_id = $1 ORDER BY h.updated_at DESC`,
      [user.id],
    );
    return json({ handwritings: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await readJson(req, 50_000);
    const name = str(body.name ?? "Mijn handschrift", "naam", { min: 1, max: 80 });
    const settings = validateJsonObject(body.settings, "instellingen");
    const count = await query<{ n: number }>("SELECT count(*)::int AS n FROM handwritings WHERE user_id = $1", [user.id]);
    if ((count[0]?.n ?? 0) >= 50) return json({ error: "Je kunt maximaal 50 handschriften bewaren." }, 400);
    const rows = await query<{ id: string }>(
      "INSERT INTO handwritings (user_id, name, settings) VALUES ($1, $2, $3::jsonb) RETURNING id",
      [user.id, name, JSON.stringify(settings)],
    );
    return json({ id: rows[0].id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
