import "server-only";
import { HttpError } from "./http";
import { query } from "./db";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function modelList(): string[] {
  const custom = (process.env.GEMINI_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return custom.length ? custom : DEFAULT_MODELS;
}

/**
 * Roept Gemini aan en verwacht JSON terug volgens `schema`.
 * De API-sleutel blijft op de server: hij wordt nooit naar de browser gestuurd.
 */
export async function generateJson<T>(opts: {
  parts: Part[];
  schema: object;
  temperature?: number;
  deadlineMs?: number;
  /** Maximale duur van één aanroep (standaard 50 s). */
  callTimeoutMs?: number;
}): Promise<{ data: T; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, "De AI-analyse is nog niet ingesteld op de server.");
  const deadline = Date.now() + (opts.deadlineMs ?? 55_000);
  let lastError = "";

  for (const model of modelList()) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      responseSchema: opts.schema,
      temperature: opts.temperature ?? 0.2,
    };
    if (/gemini-(3|4|5|6|7|8|9)|latest/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: "low" };

    const call = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(deadline - Date.now(), opts.callTimeoutMs ?? 50_000));
      try {
        return await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: opts.parts }], generationConfig }),
          signal: ctrl.signal,
          cache: "no-store",
        });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let res = await call();
      if (res.status === 400 && generationConfig.thinkingConfig) {
        delete generationConfig.thinkingConfig;
        res = await call();
      }
      // Overbelast: na een korte pauze hetzelfde (betere) model nog eens proberen voordat we overstappen.
      for (let attempt = 0; (res.status === 503 || res.status === 429) && attempt < 2 && deadline - Date.now() > 30_000; attempt++) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        res = await call();
      }
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
        if (res.status === 401 || res.status === 403) break;
        continue;
      }
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      };
      const text = (body.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (!text) {
        lastError = `${model}: leeg antwoord (${body.candidates?.[0]?.finishReason ?? "?"})`;
        continue;
      }
      return { data: JSON.parse(text) as T, model };
    } catch (err) {
      lastError = `${model}: ${(err as Error).message}`;
    }
  }
  console.error("Gemini mislukt:", lastError);
  throw new HttpError(502, "De AI-dienst is even niet bereikbaar of te druk. Probeer het over een minuut opnieuw.");
}

/** Beperkt het aantal AI-aanvragen per gebruiker per dag (beschermt de sleutel tegen misbruik). */
export async function consumeAiQuota(userId: string): Promise<void> {
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT ?? 40) || 40);
  const rows = await query<{ count: number }>(
    `INSERT INTO ai_usage (user_id, day, count) VALUES ($1, (now() AT TIME ZONE 'Europe/Amsterdam')::date, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1
     RETURNING count`,
    [userId],
  );
  if ((rows[0]?.count ?? 0) > limit) {
    throw new HttpError(429, `Je hebt het dagelijkse maximum van ${limit} AI-analyses bereikt. Morgen kan het weer.`);
  }
}

export function stripDataUrl(input: unknown, maxBytes: number): { data: string; mimeType: string } {
  if (typeof input !== "string" || !input) throw new HttpError(400, "Er is geen afbeelding meegestuurd.");
  let mimeType = "image/jpeg";
  let data = input;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(input);
  if (m) {
    mimeType = m[1];
    data = input.slice(m[0].length);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new HttpError(400, "Ongeldige afbeelding.");
  if (data.length * 0.75 > maxBytes) throw new HttpError(413, "De afbeelding is te groot.");
  return { data, mimeType };
}
