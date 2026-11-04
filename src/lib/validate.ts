import "server-only";
import { HttpError } from "./http";

export interface GlyphInput {
  ch: string;
  png: string;
  width: number;
  height: number;
  baseline: number;
  source: string;
}

const SOURCES = new Set(["scan", "draw", "photo"]);
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function validateGlyphs(value: unknown, max = 200): GlyphInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, "Er zijn geen tekens meegestuurd.");
  if (value.length > max) throw new HttpError(400, `Maximaal ${max} tekens per keer.`);
  return value.map((g, i) => {
    const v = g as Record<string, unknown>;
    const ch = typeof v.ch === "string" ? v.ch.normalize("NFC") : "";
    if (!ch || [...ch].length !== 1 || /\s/.test(ch)) throw new HttpError(400, `Teken ${i + 1} is ongeldig.`);
    let png = typeof v.png === "string" ? v.png : "";
    if (png.startsWith("data:image/png;base64,")) png = png.slice("data:image/png;base64,".length);
    if (!png || png.length > 400_000 || !B64.test(png)) throw new HttpError(400, `Afbeelding van '${ch}' is ongeldig of te groot.`);
    const width = Number(v.width);
    const height = Number(v.height);
    const baseline = Number(v.baseline);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2000 || height > 2000) {
      throw new HttpError(400, `Afmetingen van '${ch}' zijn ongeldig.`);
    }
    if (!Number.isFinite(baseline) || Math.abs(baseline) > 5000) throw new HttpError(400, `Basislijn van '${ch}' is ongeldig.`);
    const source = typeof v.source === "string" && SOURCES.has(v.source) ? v.source : "scan";
    return { ch, png, width, height, baseline, source };
  });
}

/** Instellingen/opties zijn vrije JSON, maar wel begrensd in grootte en type. */
export function validateJsonObject(value: unknown, field: string, maxBytes = 20_000): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, `Veld '${field}' is ongeldig.`);
  const text = JSON.stringify(value);
  if (text.length > maxBytes) throw new HttpError(413, `Veld '${field}' is te groot.`);
  return value as Record<string, unknown>;
}
