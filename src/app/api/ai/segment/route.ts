import { consumeAiQuota, generateJson, stripDataUrl } from "@/lib/gemini";
import { assertSameOrigin, errorResponse, json, readJson, requireUser } from "@/lib/http";

export const maxDuration = 60;

interface RawChar {
  char?: string;
  line?: number;
  box_2d?: number[];
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    characters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          char: { type: "STRING" },
          line: { type: "INTEGER" },
          box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
        },
        required: ["char", "line", "box_2d"],
      },
    },
  },
  required: ["characters"],
};

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
      "This image is a photo or scan of handwriting on paper.",
      "Detect EVERY individual handwritten character: letters, digits and punctuation marks. Do not merge characters and do not skip any.",
      "For each character return:",
      "- 'char': the exact character as written (case-sensitive, a single character).",
      "- 'box_2d': [ymin, xmin, ymax, xmax] normalized to 0-1000, tightly enclosing ALL ink of that character, including the dot of i/j and accents.",
      "- 'line': the 0-based index of the handwritten text line it belongs to.",
      "Order the result by line, then from left to right.",
      "Ignore printed text, ruled lines, margins, stains, fingers and drawings. Return at most 300 characters.",
      hint
        ? `The writer says the handwriting contains this text (use it to label the characters, but only return characters that are actually visible): "${hint}"`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data, model } = await generateJson<{ characters?: RawChar[] }>({
      parts: [{ inlineData: image }, { text: prompt }],
      schema: SCHEMA,
      temperature: 0.1,
    });

    const characters = (data.characters ?? [])
      .slice(0, 400)
      .map((c) => {
        const ch = typeof c.char === "string" ? [...c.char.normalize("NFC").trim()][0] : undefined;
        const box = Array.isArray(c.box_2d) && c.box_2d.length === 4 ? c.box_2d.map((n) => Math.max(0, Math.min(1000, Number(n) || 0))) : null;
        if (!ch || !box || box[2] <= box[0] || box[3] <= box[1]) return null;
        return { char: ch, line: Math.max(0, Math.min(200, Math.round(Number(c.line) || 0))), box };
      })
      .filter(Boolean);

    return json({ characters, model });
  } catch (err) {
    return errorResponse(err);
  }
}
