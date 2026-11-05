import { queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, readJson, requireUser } from "@/lib/http";
import { validateGlyphs } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string; glyphId: string }> };

/** Vervangt de afbeelding (en eventueel het teken) van één bestaande variant, bijv. na draaien of gummen. */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const p = await ctx.params;
    const id = assertUuid(p.id);
    const glyphId = assertUuid(p.glyphId);
    const body = await readJson(req, 600_000);
    const [g] = validateGlyphs([body.glyph], 1);
    const row = await queryOne<{ id: string }>(
      `UPDATE glyphs SET ch = $3, png = $4, width = $5, height = $6, baseline = $7
         WHERE id = $2 AND handwriting_id = $1
           AND handwriting_id IN (SELECT id FROM handwritings WHERE user_id = $8)
       RETURNING id`,
      [id, glyphId, g.ch, g.png, g.width, g.height, g.baseline, user.id],
    );
    if (!row) throw new HttpError(404, "Deze variant bestaat niet (meer).");
    await queryOne("UPDATE handwritings SET updated_at = now() WHERE id = $1 RETURNING id", [id]);
    return json({ id: row.id });
  } catch (err) {
    return errorResponse(err);
  }
}
