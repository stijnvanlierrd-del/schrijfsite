/** Leest de echte font-family van een next/font CSS-variabele (voor tekenen op canvas). */
export function cssFontFamily(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

export async function ensureFonts(...specs: string[]): Promise<void> {
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
  } catch {
    /* lettertype niet kritisch */
  }
}
