import { consumeAiQuota, generateJson, stripDataUrl } from "@/lib/gemini";
import { HttpError, assertSameOrigin, errorResponse, json, readJson, requireUser } from "@/lib/http";

export const maxDuration = 90;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    // "blad,vakje,teken" — teken leeg als het vakje geen (leesbaar) teken bevat.
    labels: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["labels"],
};

/**
 * Tweede ronde bij foto's: de site knipt de tekens zelf uit en zet ze genummerd op contactbladen;
 * de AI benoemt alleen nog wat er in elk vakje staat (veel betrouwbaarder dan zoeken op de hele foto).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await readJson(req, 6_000_000);
    const sheets = Array.isArray(body.sheets) ? body.sheets.slice(0, 5) : [];
    const counts = Array.isArray(body.counts) ? body.counts.map((n) => Math.max(0, Math.min(200, Math.round(Number(n) || 0)))) : [];
    if (!sheets.length || counts.length !== sheets.length) throw new HttpError(400, "Er zijn geen tekens meegestuurd.");
    const images = sheets.map((s) => stripDataUrl(s, 1_600_000));
    const hint = typeof body.hint === "string" ? body.hint.replace(/\s+/g, " ").trim().slice(0, 600) : "";
    await consumeAiQuota(user.id);

    const prompt = [
      `You get ${images.length} contact sheet image(s) (sheet 0${images.length > 1 ? ` to ${images.length - 1}` : ""}). Each sheet is a grid of numbered cells; each cell shows ONE handwritten character cut out of a photo of one person's practice sheet.`,
      "In every cell the solid blue line is the writing baseline and the dashed grey line is the capital height. Use them: they tell apart letters like p/d/b/q, o/O, c/C, s/S, v/V, w/W, x/X, z/Z, k/K, and comma vs apostrophe vs period.",
      `Cell counts per sheet: ${counts.map((c, i) => `sheet ${i}: ${c} cells (numbered 0-${c - 1})`).join("; ")}.`,
      "Only Latin letters (including accented ones), digits 0-9 and common punctuation/symbols are possible.",
      "For EVERY cell return one string \"sheet,cell,char\" where char is the single character it shows (case-sensitive; digits and punctuation allowed).",
      "If a cell contains no character, only a fragment, two characters, a smudge or a stray line, return an empty char: \"sheet,cell,\".",
      hint ? `The writer says the photo contains: "${hint}".` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data, model } = await generateJson<{ labels?: unknown[] }>({
      parts: [...images.map((inlineData) => ({ inlineData })), { text: prompt }],
      schema: SCHEMA,
      temperature: 0.1,
      deadlineMs: 80_000,
      callTimeoutMs: 70_000,
    });
    const labels: { sheet: number; cell: number; char: string }[] = [];
    for (const row of data.labels ?? []) {
      if (typeof row !== "string") continue;
      const parts = row.split(",");
      if (parts.length < 3) continue;
      const sheet = Number(parts[0]);
      const cell = Number(parts[1]);
      if (!Number.isInteger(sheet) || !Number.isInteger(cell) || sheet < 0 || sheet >= images.length || cell < 0 || cell >= (counts[sheet] ?? 0)) continue;
      const ch = [...parts.slice(2).join(",").normalize("NFC").trim()][0] ?? "";
      // Alleen Latijnse letters (met accenten), cijfers en gangbare leestekens/symbolen.
      const ok = /^[\p{Script=Latin}\p{Nd}\p{P}\p{Sm}\p{Sc}^`´¨~°]$/u.test(ch);
      labels.push({ sheet, cell, char: ok ? ch : "" });
    }
    return json({ labels, model });
  } catch (err) {
    return errorResponse(err);
  }
}
