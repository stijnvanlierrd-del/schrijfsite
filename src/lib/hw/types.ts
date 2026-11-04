/** Genormaliseerde schaal: elk opgeslagen teken gebruikt 100 px voor de hoogte van een hoofdletter. */
export const CAP_PX = 100;

export type GlyphSource = "scan" | "draw" | "photo";

/** Een teken zoals het in de database staat (PNG met zwarte inkt + alfakanaal). */
export interface GlyphData {
  id?: string;
  ch: string;
  png: string;
  width: number;
  height: number;
  /** Afstand in px van de bovenkant van de afbeelding tot de schrijflijn (basislijn). */
  baseline: number;
  source: GlyphSource;
}

/** Ruwe uitkomst van de beeldverwerking (nog zonder PNG-codering). */
export interface RawGlyph {
  ch: string;
  width: number;
  height: number;
  baseline: number;
  /** Inktdekking per pixel, 0–255. */
  alpha: Uint8ClampedArray;
  source: GlyphSource;
  warning?: string;
}

export interface HandwritingSettings {
  letterSpacing: number;
  wordSpacing: number;
  rotationJitter: number;
  scaleJitter: number;
  baselineJitter: number;
  slant: number;
}

export const DEFAULT_SETTINGS: HandwritingSettings = {
  letterSpacing: 0.1,
  wordSpacing: 0.55,
  rotationJitter: 2,
  scaleJitter: 0.05,
  baselineJitter: 0.03,
  slant: 0,
};

export function normalizeSettings(input: unknown): HandwritingSettings {
  const v = (input ?? {}) as Partial<Record<keyof HandwritingSettings, unknown>>;
  const num = (x: unknown, min: number, max: number, d: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
  };
  return {
    letterSpacing: num(v.letterSpacing, 0, 0.5, DEFAULT_SETTINGS.letterSpacing),
    wordSpacing: num(v.wordSpacing, 0.2, 1.5, DEFAULT_SETTINGS.wordSpacing),
    rotationJitter: num(v.rotationJitter, 0, 8, DEFAULT_SETTINGS.rotationJitter),
    scaleJitter: num(v.scaleJitter, 0, 0.2, DEFAULT_SETTINGS.scaleJitter),
    baselineJitter: num(v.baselineJitter, 0, 0.15, DEFAULT_SETTINGS.baselineJitter),
    slant: num(v.slant, -20, 20, DEFAULT_SETTINGS.slant),
  };
}
