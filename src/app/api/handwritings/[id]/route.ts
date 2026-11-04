import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, readJson, requireUser, str } from "@/lib/http";
import { validateJsonObject } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    const hw = await queryOne(
      "SELECT id, name, settings, analysis, created_at, updated_at FROM handwritings WHERE id = $1 AND user_id = $2",
      [id, user.id],
    );
    if (!hw) throw new HttpError(404, "Dit handschrift bestaat niet (meer).");
    const glyphs = await query(
      "SELECT id, ch, png, width, height, baseline, source FROM glyphs WHERE handwriting_id = $1 ORDER BY ch, created_at",
      [id],
    );
    return json({ handwriting: hw, glyphs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    const body = await readJson(req, 100_000);
    const name = body.name === undefined ? null : str(body.name, "naam", { min: 1, max: 80 });
    const settings = body.settings === undefined ? null : JSON.stringify(validateJsonObject(body.settings, "instellingen"));
    const analysis =
      body.analysis === undefined ? null : JSON.stringify(validateJsonObject(body.analysis, "analyse", 60_000));
    const rows = await query(
      `UPDATE handwritings SET
          name = COALESCE($3, name),
          settings = COALESCE($4::jsonb, settings),
          analysis = COALESCE($5::jsonb, analysis),
          updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id, name, settings, analysis],
    );
    if (!rows[0]) throw new HttpError(404, "Dit handschrift bestaat niet (meer).");
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
    const rows = await query("DELETE FROM handwritings WHERE id = $1 AND user_id = $2 RETURNING id", [id, user.id]);
    if (!rows[0]) throw new HttpError(404, "Dit handschrift bestaat niet (meer).");
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
