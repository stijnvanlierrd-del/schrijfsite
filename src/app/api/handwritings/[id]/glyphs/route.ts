import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, assertUuid, errorResponse, json, readJson, requireUser } from "@/lib/http";
import { validateGlyphs } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };
const MAX_GLYPHS = 1500;

async function ownHandwriting(id: string, userId: string) {
  const hw = await queryOne("SELECT id FROM handwritings WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!hw) throw new HttpError(404, "Dit handschrift bestaat niet (meer).");
}

/** Voegt een batch tekens toe. Met `replaceChars` worden bestaande varianten van die tekens eerst verwijderd. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    await ownHandwriting(id, user.id);
    const body = await readJson(req, 4_000_000);
    const glyphs = validateGlyphs(body.glyphs);
    const replace = Array.isArray(body.replaceChars)
      ? body.replaceChars.filter((c): c is string => typeof c === "string" && [...c].length === 1).slice(0, 300)
      : [];
    if (replace.length) await query("DELETE FROM glyphs WHERE handwriting_id = $1 AND ch = ANY($2::text[])", [id, replace]);

    const existing = await query<{ n: number }>("SELECT count(*)::int AS n FROM glyphs WHERE handwriting_id = $1", [id]);
    if ((existing[0]?.n ?? 0) + glyphs.length > MAX_GLYPHS) {
      throw new HttpError(400, `Een handschrift kan maximaal ${MAX_GLYPHS} tekens bevatten.`);
    }
    const rows = await query<{ id: string; ch: string }>(
      `INSERT INTO glyphs (handwriting_id, ch, png, width, height, baseline, source)
       SELECT $1, t.ch, t.png, t.width, t.height, t.baseline, t.source
         FROM unnest($2::text[], $3::text[], $4::int[], $5::int[], $6::real[], $7::text[])
              AS t(ch, png, width, height, baseline, source)
       RETURNING id, ch`,
      [
        id,
        glyphs.map((g) => g.ch),
        glyphs.map((g) => g.png),
        glyphs.map((g) => g.width),
        glyphs.map((g) => g.height),
        glyphs.map((g) => g.baseline),
        glyphs.map((g) => g.source),
      ],
    );
    await query("UPDATE handwritings SET updated_at = now() WHERE id = $1", [id]);
    return json({ inserted: rows }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Verwijdert losse varianten: body `{ ids: [...] }`, of alle varianten van tekens: `{ chars: [...] }`. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const id = assertUuid((await ctx.params).id);
    await ownHandwriting(id, user.id);
    const body = await readJson(req, 100_000);
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").map(assertUuid) : [];
    const chars = Array.isArray(body.chars) ? body.chars.filter((c): c is string => typeof c === "string") : [];
    let deleted = 0;
    if (ids.length) {
      deleted += (await query("DELETE FROM glyphs WHERE handwriting_id = $1 AND id = ANY($2::uuid[]) RETURNING id", [id, ids]))
        .length;
    }
    if (chars.length) {
      deleted += (await query("DELETE FROM glyphs WHERE handwriting_id = $1 AND ch = ANY($2::text[]) RETURNING id", [id, chars]))
        .length;
    }
    await query("UPDATE handwritings SET updated_at = now() WHERE id = $1", [id]);
    return json({ deleted });
  } catch (err) {
    return errorResponse(err);
  }
}
