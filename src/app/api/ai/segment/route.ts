import { consumeAiQuota, generateJson, stripDataUrl } from "@/lib/gemini";
import { assertSameOrigin, errorResponse, json, readJson, requireUser } from "@/lib/http";

// Volle oefenvellen (300+ tekens) hebben even nodig.
export const maxDuration = 120;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    page_rotation: { type: "INTEGER" },
    paper: { type: "STRING", enum: ["blank", "lined", "grid"] },
    // Compact: "regel,ymin,xmin,ymax,xmax,teken" — scheelt veel tokens (en dus tijd) bij volle vellen.
    chars: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["page_rotation", "paper", "chars"],
};

const MAX_CHARS = 600;

/** Laat de AI elk handgeschreven teken op een foto lokaliseren en benoemen. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await readJson(req, 4_200_000);
    const image = stripDataUrl(body.image, 3_000_000);
    const hint = typeof body.hint === "string" ? body.hint.replace(/\s+/g, " ").trim().slice(0, 600) : "";
    await consumeAiQuota(user.id);

    const prompt = [
      "This image is a photo of handwriting on paper. The paper may be blank, lined, or squared/grid paper (\"ruitjespapier\"), and it may be folded, curled or partly in shadow.",
      "The photo may be rotated (sideways or upside down). First decide the upright reading direction of the HANDWRITING and report it as 'page_rotation': how many degrees CLOCKWISE the image must be rotated so the handwriting is upright and reads left-to-right (0, 90, 180 or 270).",
      "Then detect EVERY individual handwritten character: letters, digits and punctuation. This is often a practice sheet where each character is repeated many times in rows, often one character per grid square: return EVERY occurrence separately. Do not merge neighbouring characters and do not skip any.",
      "Ignore the printed grid or ruling lines, margins, punch holes, page numbers, the table or background around the paper, shadows and crossed-out characters.",
      "Return each character as one string in 'chars' in this exact format:",
      "line,ymin,xmin,ymax,xmax,char",
      "- line: 0-based index of the handwritten text line/row in UPRIGHT reading order (top to bottom after rotation).",
      "- ymin,xmin,ymax,xmax: integers 0-1000, normalized to the image EXACTLY AS GIVEN (not rotated), tightly enclosing ALL ink of that one character, including dots of i/j and accents.",
      "- char: the character as written, read in its upright orientation (case-sensitive, exactly one character).",
      "Example: \"3,412,118,455,140,a\".",
      "Order by line, then in upright reading order. Also report 'paper' as blank, lined or grid.",
      `Return at most ${MAX_CHARS} characters.`,
      hint
        ? `The writer says the sheet contains these characters (use it to label ambiguous shapes such as l/I/1, O/0 and rotated-looking glyphs, but only return characters that are actually visible): "${hint}"`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data, model } = await generateJson<{ chars?: unknown[]; page_rotation?: number; paper?: string }>({
      parts: [{ inlineData: image }, { text: prompt }],
      schema: SCHEMA,
      temperature: 0.1,
      deadlineMs: 112_000,
      callTimeoutMs: 95_000,
    });

    const characters = (data.chars ?? [])
      .slice(0, MAX_CHARS)
      .map((row) => {
        if (typeof row !== "string") return null;
        const parts = row.split(",");
        if (parts.length < 6) return null;
        const nums = parts.slice(0, 5).map((n) => Number(n.trim()));
        const ch = [...parts.slice(5).join(",").normalize("NFC").trim()][0];
        if (!ch || nums.some((n) => !Number.isFinite(n))) return null;
        const box = nums.slice(1).map((n) => Math.max(0, Math.min(1000, Math.round(n))));
        if (box[2] <= box[0] || box[3] <= box[1]) return null;
        return { char: ch, line: Math.max(0, Math.min(400, Math.round(nums[0]))), box };
      })
      .filter(Boolean);

    const r = Math.round(Number(data.page_rotation) / 90) * 90;
    const norm = ((r % 360) + 360) % 360;
    const rotation = [0, 90, 180, 270].includes(norm) ? norm : 0;
    const paper = ["blank", "lined", "grid"].includes(String(data.paper)) ? String(data.paper) : "blank";
    return json({ characters, rotation, paper, model });
  } catch (err) {
    return errorResponse(err);
  }
}
