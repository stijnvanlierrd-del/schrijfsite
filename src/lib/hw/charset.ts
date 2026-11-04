/** Definitie van de afdrukbare sjablonen (maten in millimeter, A4 staand). */

export const LOWER = "abcdefghijklmnopqrstuvwxyz";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";
export const PUNCT = ".,;:!?'\"()-/&@#€%+=*";
/** Losse accenten; worden bij het schrijven boven de letter gezet (é, ë, ï, ô …). */
export const ACCENTS = "´`¨^";

export interface SheetDef {
  id: number;
  name: string;
  description: string;
  chars: string[];
}

export const SHEETS: SheetDef[] = [
  {
    id: 1,
    name: "Blad 1 — Basis",
    description: "Kleine letters, hoofdletters, cijfers, leestekens en accenten",
    chars: [...LOWER, ...UPPER, ...DIGITS, ...PUNCT, ...ACCENTS, "e", "n"],
  },
  {
    id: 2,
    name: "Blad 2 — Varianten",
    description: "Extra varianten voor een natuurlijker resultaat",
    chars: [...LOWER, ...LOWER, ...UPPER, ...DIGITS],
  },
];

export const PAGE = { w: 210, h: 297 };
export const MARKER_SIZE = 9;
/** Middelpunten van de hoekmarkeringen: linksboven, rechtsboven, rechtsonder, linksonder. */
export const MARKERS: [number, number][] = [
  [16, 16],
  [194, 16],
  [194, 281],
  [16, 281],
];
/** Klein oriëntatievierkant naast de markering linksboven. */
export const ORIENT = { x: 26.5, y: 16, size: 4 };
/** Bits die het bladnummer coderen (gevuld vierkant = 1). */
export const ID_BITS = [
  { x: 33.5, y: 16 },
  { x: 39.5, y: 16 },
  { x: 45.5, y: 16 },
];
export const BIT_SIZE = 4;

export const GRID = { x: 17, y: 31, cols: 8, rows: 11, cellW: 22, cellH: 21.8 };
/** Hulplijnen binnen een vak, gemeten vanaf de bovenkant van het vak. */
export const CELL = { capY: 5.2, xY: 9.9, baseY: 14.6, inset: 0.9, label: { x: 1.1, y: 3.6, size: 2.6, box: 4.2 } };
export const CAP_MM = CELL.baseY - CELL.capY;

export function sheetBits(id: number): number[] {
  return ID_BITS.map((_, i) => (id >> i) & 1);
}

export function sheetById(id: number): SheetDef | undefined {
  return SHEETS.find((s) => s.id === id);
}

export function cellRect(index: number) {
  const col = index % GRID.cols;
  const row = Math.floor(index / GRID.cols);
  return { x: GRID.x + col * GRID.cellW, y: GRID.y + row * GRID.cellH, w: GRID.cellW, h: GRID.cellH };
}

export const CATEGORY_ORDER: { name: string; chars: string }[] = [
  { name: "Kleine letters", chars: LOWER },
  { name: "Hoofdletters", chars: UPPER },
  { name: "Cijfers", chars: DIGITS },
  { name: "Leestekens & accenten", chars: PUNCT + ACCENTS },
];

/** Alle tekens die de app "kent" (voor overzichten). */
export const ALL_CHARS = LOWER + UPPER + DIGITS + PUNCT + ACCENTS;
