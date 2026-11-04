import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, readJson, requireUser, str } from "@/lib/http";
import { validateJsonObject } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    const doc = await queryOne(
      "SELECT id, title, content, options, handwriting_id, created_at, updated_at FROM documents WHERE id = $1 AND user_id = $2",
      [id, user.id],
    );
    if (!doc) throw new HttpError(404, "Deze tekst bestaat niet (meer).");
    return json({ document: doc });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    const body = await readJson(req, 400_000);
    const title = body.title === undefined ? null : str(body.title, "titel", { min: 1, max: 120 });
    const content = typeof body.content === "string" ? body.content.slice(0, 200_000) : null;
    const options = body.options === undefined ? null : JSON.stringify(validateJsonObject(body.options, "opties"));
    let handwritingId: string | null = null;
    if (typeof body.handwritingId === "string" && body.handwritingId) {
      handwritingId = assertUuid(body.handwritingId);
      const own = await queryOne("SELECT id FROM handwritings WHERE id = $1 AND user_id = $2", [handwritingId, user.id]);
      if (!own) throw new HttpError(404, "Dat handschrift bestaat niet.");
    }
    const rows = await query(
      `UPDATE documents SET
          title = COALESCE($3, title),
          content = COALESCE($4, content),
          options = COALESCE($5::jsonb, options),
          handwriting_id = COALESCE($6::uuid, handwriting_id),
          updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id, title, content, options, handwritingId],
    );
    if (!rows[0]) throw new HttpError(404, "Deze tekst bestaat niet (meer).");
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    const rows = await query("DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id", [id, user.id]);
    if (!rows[0]) throw new HttpError(404, "Deze tekst bestaat niet (meer).");
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
