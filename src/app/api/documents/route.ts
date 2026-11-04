import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, readJson, requireUser, str } from "@/lib/http";
import { validateJsonObject } from "@/lib/validate";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await query(
      `SELECT d.id, d.title, d.handwriting_id, h.name AS handwriting_name, d.updated_at,
              left(d.content, 160) AS preview, length(d.content) AS length
         FROM documents d LEFT JOIN handwritings h ON h.id = d.handwriting_id
        WHERE d.user_id = $1 ORDER BY d.updated_at DESC LIMIT 200`,
      [user.id],
    );
    return json({ documents: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await readJson(req, 400_000);
    const title = str(body.title ?? "Naamloze tekst", "titel", { min: 1, max: 120 });
    const content = typeof body.content === "string" ? body.content.slice(0, 200_000) : "";
    const options = validateJsonObject(body.options, "opties");
    let handwritingId: string | null = null;
    if (typeof body.handwritingId === "string" && body.handwritingId) {
      handwritingId = assertUuid(body.handwritingId);
      const own = await queryOne("SELECT id FROM handwritings WHERE id = $1 AND user_id = $2", [handwritingId, user.id]);
      if (!own) throw new HttpError(404, "Dat handschrift bestaat niet.");
    }
    const n = await query<{ n: number }>("SELECT count(*)::int AS n FROM documents WHERE user_id = $1", [user.id]);
    if ((n[0]?.n ?? 0) >= 500) throw new HttpError(400, "Je kunt maximaal 500 teksten bewaren.");
    const rows = await query<{ id: string }>(
      `INSERT INTO documents (user_id, handwriting_id, title, content, options)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [user.id, handwritingId, title, content, JSON.stringify(options)],
    );
    return json({ id: rows[0].id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
