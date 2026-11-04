import { query } from "@/lib/db";
import { consumeAiQuota, generateJson, stripDataUrl } from "@/lib/gemini";
import { assertSameOrigin, assertUuid, errorResponse, json, readJson, requireUser } from "@/lib/http";

export const maxDuration = 60;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    summary: { type: "STRING" },
    traits: {
      type: "OBJECT",
      properties: {
        style: { type: "STRING" },
        slant: { type: "STRING" },
        size: { type: "STRING" },
        spacing: { type: "STRING" },
        pressure: { type: "STRING" },
        legibility: { type: "INTEGER" },
        consistency: { type: "INTEGER" },
      },
      required: ["style", "slant", "size", "spacing", "pressure", "legibility", "consistency"],
    },
    observations: { type: "ARRAY", items: { type: "STRING" } },
    settings: {
      type: "OBJECT",
      properties: {
        letterSpacing: { type: "NUMBER" },
        wordSpacing: { type: "NUMBER" },
        rotationJitter: { type: "NUMBER" },
        scaleJitter: { type: "NUMBER" },
        baselineJitter: { type: "NUMBER" },
        slant: { type: "NUMBER" },
      },
      required: ["letterSpacing", "wordSpacing", "rotationJitter", "scaleJitter", "baselineJitter", "slant"],
    },
    issues: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { index: { type: "INTEGER" }, char: { type: "STRING" }, problem: { type: "STRING" } },
        required: ["index", "char", "problem"],
      },
    },
  },
  required: ["headline", "summary", "traits", "observations", "settings", "issues"],
};

interface Analysis {
  headline: string;
  summary: string;
  traits: Record<string, string | number>;
  observations: string[];
  settings: Record<string, number>;
  issues: { index: number; char: string; problem: string }[];
}

const clamp = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Analyseert de stijl van het handschrift en stelt instellingen voor de weergave voor. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await readJson(req, 4_200_000);
    const sheet = stripDataUrl(body.sheet, 2_500_000);
    const sample = body.sample ? stripDataUrl(body.sample, 1_200_000) : null;
    const labels = Array.isArray(body.labels) ? body.labels.slice(0, 400).map((l) => String(l).slice(0, 2)) : [];
    const handwritingId = typeof body.handwritingId === "string" && body.handwritingId ? assertUuid(body.handwritingId) : null;
    await consumeAiQuota(user.id);

    const prompt = `You are an expert in handwriting and typography, working for a Dutch website that turns a person's handwriting into a font.
Image 1 is a contact sheet of the person's handwritten characters ("glyphs"), cut out of their scan. Every cell shows one glyph with a small grey caption "index: expected character" underneath.
${sample ? "Image 2 shows sample text rendered with these glyphs." : ""}
Expected characters by index: ${labels.map((l, i) => `${i}:${l}`).join(" ")}

Tasks:
1. Describe the handwriting neutrally in DUTCH (no personality or character claims): style (blokschrift, lopend schrift or gemengd), slant, size/proportions (x-height vs capitals), spacing, stroke pressure/thickness, legibility and consistency (scores 1-10).
2. Write a short, witty Dutch newspaper-style 'headline' (max 9 words) about this handwriting, and a 'summary' of 2-4 Dutch sentences.
3. Give 3-6 short Dutch 'observations' with concrete, useful remarks (e.g. which letters stand out, tips to improve the scan).
4. Suggest rendering 'settings' that make text typeset with these glyphs look natural, all relative to capital height = 1.0:
   - letterSpacing: gap between letters inside a word (0.02 very tight … 0.10 normal … 0.30 airy)
   - wordSpacing: width of a space (0.3 … 1.2, normal ≈ 0.55)
   - rotationJitter: random rotation per letter in degrees (0 … 6)
   - scaleJitter: random size variation as a fraction (0 … 0.15)
   - baselineJitter: random up/down movement as a fraction of capital height (0 … 0.1)
   - slant: extra slant in degrees to apply (-10 … 10), usually 0 because the glyphs already carry their own slant.
5. List 'issues': glyphs that do not match their expected character, are empty, cut off, contain smudges or extra strokes, or are clearly too big/small compared to the others. Use the index and expected character, and explain the problem in Dutch. Return an empty list when all glyphs are fine.

Write every text field (headline, summary, traits, observations, problems) in natural Dutch (Nederlands) — no English words.`;

    const parts = [
      { inlineData: sheet },
      ...(sample ? [{ inlineData: sample }] : []),
      { text: prompt },
    ];
    const { data, model } = await generateJson<Analysis>({ parts, schema: SCHEMA, temperature: 0.4 });

    const analysis = {
      headline: text(data.headline, 140),
      summary: text(data.summary, 1200),
      traits: {
        style: text(data.traits?.style, 80),
        slant: text(data.traits?.slant, 120),
        size: text(data.traits?.size, 160),
        spacing: text(data.traits?.spacing, 160),
        pressure: text(data.traits?.pressure, 160),
        legibility: Math.round(clamp(data.traits?.legibility, 1, 10, 7)),
        consistency: Math.round(clamp(data.traits?.consistency, 1, 10, 7)),
      },
      observations: (Array.isArray(data.observations) ? data.observations : []).slice(0, 8).map((o) => text(o, 300)).filter(Boolean),
      settings: {
        letterSpacing: clamp(data.settings?.letterSpacing, 0, 0.5, 0.1),
        wordSpacing: clamp(data.settings?.wordSpacing, 0.2, 1.5, 0.55),
        rotationJitter: clamp(data.settings?.rotationJitter, 0, 8, 2),
        scaleJitter: clamp(data.settings?.scaleJitter, 0, 0.2, 0.05),
        baselineJitter: clamp(data.settings?.baselineJitter, 0, 0.15, 0.03),
        slant: clamp(data.settings?.slant, -15, 15, 0),
      },
      issues: (Array.isArray(data.issues) ? data.issues : [])
        .slice(0, 60)
        .map((i) => ({ index: Math.round(clamp(i.index, 0, 1000, 0)), char: text(i.char, 2), problem: text(i.problem, 300) }))
        .filter((i) => i.problem),
      model,
      analysedAt: new Date().toISOString(),
    };

    if (handwritingId) {
      await query("UPDATE handwritings SET analysis = $3::jsonb, updated_at = now() WHERE id = $1 AND user_id = $2", [
        handwritingId,
        user.id,
        JSON.stringify(analysis),
      ]);
    }
    return json({ analysis });
  } catch (err) {
    return errorResponse(err);
  }
}
