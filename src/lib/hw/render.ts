import { CAP_PX, type GlyphData, type HandwritingSettings } from "./types";
import { PAGE_SIZES, paperById, type PageSizeId, type PaperId } from "./paper";
import { gauss, mulberry32 } from "./random";
import { median } from "./geometry";

export interface LoadedGlyph {
  id: string;
  ch: string;
  img: CanvasImageSource;
  w: number;
  h: number;
  baseline: number;
  /** Linker- en rechtergrens van het "lijf" van de letter (zonder uitlopers), voor de spatiëring. */
  left?: number;
  right?: number;
  /** Alfakanaal (optioneel) om de lijfgrenzen te bepalen. */
  alpha?: Uint8ClampedArray;
}

export interface GlyphBank {
  map: Map<string, LoadedGlyph[]>;
  /** Hoogte van de kleine letters (x-hoogte) in glyph-pixels. */
  xHeight: number;
  /** Geschatte lijndikte van de pen in glyph-pixels. */
  stroke: number;
  count: number;
}

function decodeImage(png: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kon teken niet laden"));
    img.src = png.startsWith("data:") ? png : `data:image/png;base64,${png}`;
  });
}

export async function loadBank(glyphs: GlyphData[]): Promise<GlyphBank> {
  const map = new Map<string, LoadedGlyph[]>();
  const loaded = await Promise.all(
    glyphs.map(async (g, i) => {
      try {
        const img = await decodeImage(g.png);
        const c = document.createElement("canvas");
        c.width = g.width;
        c.height = g.height;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, g.width, g.height).data;
        const alpha = new Uint8ClampedArray(g.width * g.height);
        for (let p = 0; p < alpha.length; p++) alpha[p] = rgba[p * 4 + 3];
        return { id: g.id ?? `g${i}`, ch: g.ch, img: c, w: g.width, h: g.height, baseline: g.baseline, alpha } as LoadedGlyph;
      } catch {
        return null;
      }
    }),
  );
  for (const g of loaded) {
    if (!g) continue;
    const list = map.get(g.ch) ?? [];
    list.push(g);
    map.set(g.ch, list);
  }
  return makeBank(map);
}

export function makeBank(map: Map<string, LoadedGlyph[]>): GlyphBank {
  const xs: number[] = [];
  for (const ch of "acemnorsuvwxz") for (const g of map.get(ch) ?? []) xs.push(g.baseline - 2);
  const strokes: number[] = [];
  for (const ch of "lI1|i") {
    for (const g of map.get(ch) ?? []) if (g.w - 4 < CAP_PX * 0.22) strokes.push(Math.max(2, g.w - 4));
  }
  let count = 0;
  map.forEach((l) => (count += l.length));
  const xHeight = Math.max(CAP_PX * 0.3, Math.min(CAP_PX * 0.9, xs.length ? median(xs) : CAP_PX * 0.58));
  map.forEach((list) => list.forEach((g) => setBody(g, xHeight)));
  return {
    map,
    xHeight,
    stroke: strokes.length ? Math.max(2, Math.min(18, median(strokes))) : 5,
    count,
  };
}

/** Bepaalt het lijf van een letter: de inkt tussen basislijn en x-hoogte (uitlopers als een j-staart tellen niet mee). */
function setBody(g: LoadedGlyph, xHeight: number) {
  g.left = 2;
  g.right = Math.max(3, g.w - 2);
  if (!g.alpha) return;
  const y0 = Math.max(0, Math.floor(g.baseline - xHeight * 1.05));
  const y1 = Math.min(g.h - 1, Math.ceil(g.baseline + 1));
  let minX = g.w;
  let maxX = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.alpha[y * g.w + x] > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  // Alleen gebruiken als het lijf een redelijk deel van de breedte beslaat.
  if (maxX >= minX && maxX - minX + 1 >= g.w * 0.35) {
    g.left = minX;
    g.right = maxX + 1;
  }
}

export interface RenderOptions {
  text: string;
  paper: PaperId;
  pageSize: PageSizeId;
  inkColor: string;
  inkKind: "pen" | "potlood" | "krijt" | "stift";
  /** Hoogte van een hoofdletter in millimeter. */
  capMm: number;
  lineSpacingMm: number;
  marginMm: number;
  lineSkip: number;
  settings: HandwritingSettings;
  seed: number;
  dpi: number;
  /** Lettertype voor tekens die (nog) niet in het handschrift zitten. */
  fallbackFont: string;
  /** Maximaal aantal pagina's (bescherming tegen eindeloze teksten). */
  maxPages?: number;
  /** Alleen deze pagina's tekenen (0-gebaseerd); standaard alle. */
  only?: number[];
}

export interface RenderResult {
  pages: HTMLCanvasElement[];
  pageCount: number;
  missing: string[];
  truncated: boolean;
  capMm: number;
}

const ACCENT_OF: Record<string, string> = {
  "́": "´",
  "̀": "`",
  "̈": "¨",
  "̂": "^",
  "̃": "~",
  "̧": "¸",
  "̊": "˚",
};

const REPLACE: [RegExp, string][] = [
  [/\r\n?/g, "\n"],
  [/\t/g, "    "],
  [/[  -​  　]/g, " "],
  [/[‘’‛′]/g, "'"],
  [/‚/g, ","],
  [/[“”„‟″«»]/g, '"'],
  [/…/g, "..."],
  [/[•·]/g, "."],
  [/×/g, "x"],
  [/[ĳ]/g, "ij"],
  [/[Ĳ]/g, "IJ"],
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/Æ/g, "AE"],
  [/œ/g, "oe"],
  [/Œ/g, "OE"],
];

const DASHES: Record<string, number> = { "–": 1.6, "—": 2.3, "−": 1.3, "‒": 1.6, "―": 2.3 };
const TIGHT_BEFORE = new Set([".", ",", ":", ";", "!", "?", ")", "]", "}", "'", '"', "%"]);
const TIGHT_AFTER = new Set(["(", "[", "{", "'", '"', "@", "#", "€", "$"]);

interface Atom {
  kind: "glyph" | "fallback" | "space";
  ch: string;
  g?: LoadedGlyph;
  accent?: { mark: string; glyph?: LoadedGlyph };
  dotless?: boolean;
  stretch: number;
  width: number;
  scale: number;
  rot: number;
  dy: number;
  gap: number;
  alpha: number;
}

/** Lettertekens opzoeken, met slimme vervangingen voor accenten en hoofd-/kleine letters. */
function resolve(bank: GlyphBank, ch: string): { base?: string; accent?: string; stretch?: number } | null {
  if (bank.map.has(ch)) return { base: ch };
  if (DASHES[ch] && bank.map.has("-")) return { base: "-", stretch: DASHES[ch] };
  const nfd = ch.normalize("NFD");
  if (nfd.length > 1) {
    const base = nfd[0];
    const mark = ACCENT_OF[nfd[1]];
    const b = bank.map.has(base) ? base : bank.map.has(base.toLowerCase()) ? base.toLowerCase() : bank.map.has(base.toUpperCase()) ? base.toUpperCase() : null;
    if (b && mark) return { base: b, accent: mark };
    if (b) return { base: b };
  }
  const swapped = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  if (swapped !== ch && [...swapped].length === 1 && bank.map.has(swapped)) return { base: swapped };
  if (ch === "`" && bank.map.has("'")) return { base: "'" };
  return null;
}

export function prepareText(text: string): string {
  let t = text.normalize("NFC");
  for (const [re, rep] of REPLACE) t = t.replace(re, rep);
  return t;
}

/** Vertaalt een hex-kleur naar rgb-componenten. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [27, 27, 27];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let grainTile: HTMLCanvasElement | null = null;
function getGrain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(96, 96);
  const rng = mulberry32(42);
  for (let i = 0; i < 96 * 96; i++) {
    const v = rng();
    img.data[i * 4 + 3] = v < 0.42 ? Math.round(rng() * 230) : 0;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

const tintCache = new WeakMap<LoadedGlyph, Map<string, HTMLCanvasElement>>();
/** Kleurt een zwart-op-transparant teken in met de inktkleur (en eventueel korrel voor potlood/krijt). */
function tinted(g: LoadedGlyph, color: string, kind: RenderOptions["inkKind"]): HTMLCanvasElement {
  const key = `${color}|${kind}`;
  let perGlyph = tintCache.get(g);
  if (!perGlyph) {
    perGlyph = new Map();
    tintCache.set(g, perGlyph);
  }
  const hit = perGlyph.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(g.img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, g.w, g.h);
  if (kind === "potlood" || kind === "krijt") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = kind === "krijt" ? 0.75 : 0.55;
    const pattern = ctx.createPattern(getGrain(), "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, g.w, g.h);
    }
  }
  perGlyph.set(key, c);
  return c;
}

/** Zet de tekst in het handschrift op één of meer pagina's. */
export function renderDocument(bank: GlyphBank, opts: RenderOptions): RenderResult {
  const paper = paperById(opts.paper);
  const page = PAGE_SIZES[opts.pageSize] ?? PAGE_SIZES.A4;
  const ppm = opts.dpi / 25.4;
  const s = opts.settings;
  const text = prepareText(opts.text);
  const rng = mulberry32(opts.seed);
  const missing = new Set<string>();

  // Lay-out van het papier; op schrijflijnen bepaalt de x-band de grootte.
  let capMm = opts.capMm;
  const probe = paper.layout(page, { lineSpacingMm: opts.lineSpacingMm, marginMm: opts.marginMm, capMm, lineSkip: opts.lineSkip });
  if (probe.xBandMm) capMm = (probe.xBandMm * CAP_PX) / bank.xHeight;
  const layout = paper.layout(page, { lineSpacingMm: opts.lineSpacingMm, marginMm: opts.marginMm, capMm, lineSkip: opts.lineSkip });
  const k = (capMm * ppm) / CAP_PX; // pagina-pixels per glyph-pixel
  const lineWidthG = ((layout.right - layout.left) * ppm) / k;

  // Fallback-lettertype kalibreren op hoofdletterhoogte.
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `100px ${opts.fallbackFont}`;
  const capAscent = measure.measureText("H").actualBoundingBoxAscent || 70;
  const fallbackPx = (CAP_PX / capAscent) * 100; // in glyph-pixels
  measure.font = `${fallbackPx}px ${opts.fallbackFont}`;

  // 1) Tekst → atomen met vaste willekeur (reproduceerbaar via seed).
  const lastVariant = new Map<string, number>();
  const makeAtom = (ch: string): Atom => {
    const jitterScale = 1 + gauss(rng) * s.scaleJitter * 0.6;
    const rot = gauss(rng) * s.rotationJitter * 0.55 * (Math.PI / 180);
    const dy = gauss(rng) * s.baselineJitter * 0.6 * CAP_PX;
    const gap = s.letterSpacing * CAP_PX * (1 + gauss(rng) * 0.18);
    const alpha = 0.9 + rng() * 0.1;
    const pick = rng();
    const r = resolve(bank, ch);
    if (!r?.base) {
      missing.add(ch);
      const width = measure.measureText(ch).width;
      return { kind: "fallback", ch, stretch: 1, width, scale: jitterScale, rot, dy, gap, alpha };
    }
    const list = bank.map.get(r.base)!;
    let vi = Math.floor(pick * list.length);
    if (list.length > 1 && lastVariant.get(r.base) === vi) vi = (vi + 1) % list.length;
    lastVariant.set(r.base, vi);
    const g = list[vi];
    let accent: Atom["accent"];
    if (r.accent) {
      const al = bank.map.get(r.accent);
      accent = { mark: r.accent, glyph: al ? al[Math.floor(rng() * al.length)] : undefined };
    }
    const dotless = Boolean(r.accent && (r.base === "i" || r.base === "j") && r.accent !== "¸");
    const stretch = r.stretch ?? 1;
    const body = ((g.right ?? g.w - 2) - (g.left ?? 2)) * stretch;
    return { kind: "glyph", ch, g, accent, dotless, stretch, width: Math.max(4, body), scale: jitterScale, rot, dy, gap, alpha };
  };

  type Word = { atoms: Atom[]; width: number };
  const paragraphs: Word[][] = text.split("\n").map((para) => {
    const words: Word[] = [];
    for (const raw of para.split(" ")) {
      const atoms = [...raw].map(makeAtom);
      let width = 0;
      atoms.forEach((a, i) => {
        if (i > 0) {
          let gap = a.gap;
          if (TIGHT_BEFORE.has(a.ch)) gap *= 0.45;
          if (TIGHT_AFTER.has(atoms[i - 1].ch)) gap *= 0.45;
          a.gap = gap;
        } else a.gap = 0;
        width += a.gap + a.width * a.scale;
      });
      words.push({ atoms, width });
    }
    return words;
  });

  // 2) Regels vullen (woorden die te lang zijn worden afgebroken).
  type Line = { items: { atom: Atom; x: number }[] };
  const lines: Line[] = [];
  for (const words of paragraphs) {
    let line: Line = { items: [] };
    let x = 0;
    const spaceBase = s.wordSpacing * CAP_PX;
    const pushLine = () => {
      lines.push(line);
      line = { items: [] };
      x = 0;
    };
    for (const word of words) {
      const space = line.items.length ? spaceBase * (1 + gauss(rng) * 0.15) : 0;
      if (word.atoms.length === 0) {
        x += line.items.length ? spaceBase : 0;
        continue;
      }
      if (line.items.length && x + space + word.width > lineWidthG) pushLine();
      let cx = x + (line.items.length ? space : 0);
      for (let i = 0; i < word.atoms.length; i++) {
        const a = word.atoms[i];
        const w = a.width * a.scale;
        const gap = i > 0 ? a.gap : 0;
        if (cx + gap + w > lineWidthG && line.items.length) {
          pushLine();
          cx = 0;
        } else cx += gap;
        line.items.push({ atom: a, x: cx });
        cx += w;
      }
      x = cx;
    }
    pushLine();
  }
  // Lege regels aan het eind niet meenemen.
  while (lines.length > 1 && lines[lines.length - 1].items.length === 0) lines.pop();

  // 3) Tekenen, pagina voor pagina.
  const maxPages = opts.maxPages ?? 30;
  const perPage = Math.max(1, layout.baselines.length);
  const pageCount = Math.min(maxPages, Math.max(1, Math.ceil(lines.length / perPage)));
  const truncated = lines.length > perPage * maxPages;
  const pages: HTMLCanvasElement[] = [];
  const W = Math.round(page.w * ppm);
  const H = Math.round(page.h * ppm);
  const [ir, ig, ib] = hexToRgb(opts.inkColor);
  const slantTan = Math.tan((s.slant * Math.PI) / 180);
  const kindAlpha = opts.inkKind === "potlood" ? 0.82 : opts.inkKind === "krijt" ? 0.92 : 1;

  const wanted = (opts.only ?? Array.from({ length: pageCount }, (_, i) => i)).filter((p) => p >= 0 && p < pageCount);
  for (const p of wanted) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    paper.draw(ctx, page, ppm, (opts.seed ^ (p * 7919)) >>> 0);
    ctx.globalCompositeOperation = paper.blend;
    const lineRng = mulberry32(opts.seed + 101 + p);

    for (let li = 0; li < perPage; li++) {
      const line = lines[p * perPage + li];
      if (!line) break;
      const baseY = layout.baselines[li] * ppm;
      const slope = (lineRng() - 0.5) * 2 * (paper.ruled ? 0.12 : 0.4) * (Math.PI / 180);
      const indent = (lineRng() - 0.5) * 0.08 * CAP_PX * k;
      const phase = lineRng() * Math.PI * 2;
      const freq = (Math.PI * 2) / ((500 + lineRng() * 500) * k);
      const drift = 0.012 * CAP_PX * k;
      let wordAlpha = 0.9 + lineRng() * 0.1;

      for (const { atom, x } of line.items) {
        if (atom.ch === " ") continue;
        const px = layout.left * ppm + indent + x * k;
        const w = atom.width * atom.scale * k;
        const cx = px + w / 2;
        const y = baseY + Math.tan(slope) * (px - layout.left * ppm) + Math.sin(phase + px * freq) * drift + atom.dy * k;
        if (lineRng() < 0.18) wordAlpha = 0.86 + lineRng() * 0.14;
        ctx.save();
        ctx.globalAlpha = Math.min(1, atom.alpha * wordAlpha * kindAlpha);
        ctx.translate(cx, y);
        ctx.rotate(atom.rot);
        if (slantTan) ctx.transform(1, 0, -slantTan, 1, 0, 0);
        ctx.scale(k * atom.scale, k * atom.scale);
        if (atom.kind === "fallback") {
          ctx.fillStyle = opts.inkColor;
          ctx.font = `${fallbackPx}px ${opts.fallbackFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(atom.ch, 0, 0);
        } else if (atom.g) {
          const g = atom.g;
          const img = tinted(g, opts.inkColor, opts.inkKind);
          ctx.scale(atom.stretch, 1);
          const ox = -((g.left ?? 2) + (g.right ?? g.w - 2)) / 2;
          if (atom.dotless) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(-g.w * 2, -bank.xHeight * 1.1, g.w * 4, g.h * 2);
            ctx.clip();
            ctx.drawImage(img, ox, -g.baseline);
            ctx.restore();
          } else {
            ctx.drawImage(img, ox, -g.baseline);
          }
          ctx.scale(1 / atom.stretch, 1);
          if (atom.accent) drawAccent(ctx, bank, g, atom, opts, [ir, ig, ib]);
        }
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    pages.push(canvas);
  }
  return { pages, pageCount, missing: [...missing], truncated, capMm };
}

/** Plaatst een accent boven (of onder) de basisletter; zonder getekend accent wordt er een gesimuleerd. */
function drawAccent(
  ctx: CanvasRenderingContext2D,
  bank: GlyphBank,
  base: LoadedGlyph,
  atom: Atom,
  opts: RenderOptions,
  rgb: [number, number, number],
) {
  const accent = atom.accent!;
  const gapPx = CAP_PX * 0.08;
  const top = atom.dotless ? -bank.xHeight : -(base.baseline - 2);
  const C = CAP_PX;
  if (accent.mark === "¸") {
    if (accent.glyph) {
      const a = tinted(accent.glyph, opts.inkColor, opts.inkKind);
      ctx.drawImage(a, -accent.glyph.w / 2, C * 0.02);
      return;
    }
  } else if (accent.glyph) {
    const a = accent.glyph;
    const img = tinted(a, opts.inkColor, opts.inkKind);
    // Accent zo schalen dat het niet absurd groot wordt.
    const sc = Math.min(1, (C * 0.32) / Math.max(1, a.h - 4));
    ctx.save();
    ctx.translate(0, top - gapPx);
    ctx.scale(sc, sc);
    ctx.drawImage(img, -a.w / 2, -(a.h - 2));
    ctx.restore();
    return;
  }
  // Gesimuleerd accent met pennenstreken.
  ctx.save();
  ctx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = bank.stroke * 0.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const t = top - gapPx;
  ctx.beginPath();
  switch (accent.mark) {
    case "´":
      ctx.moveTo(-C * 0.04, t - C * 0.02);
      ctx.lineTo(C * 0.07, t - C * 0.17);
      ctx.stroke();
      break;
    case "`":
      ctx.moveTo(C * 0.04, t - C * 0.02);
      ctx.lineTo(-C * 0.07, t - C * 0.17);
      ctx.stroke();
      break;
    case "^":
      ctx.moveTo(-C * 0.09, t - C * 0.02);
      ctx.lineTo(0, t - C * 0.15);
      ctx.lineTo(C * 0.09, t - C * 0.02);
      ctx.stroke();
      break;
    case "~":
      ctx.moveTo(-C * 0.1, t - C * 0.05);
      ctx.bezierCurveTo(-C * 0.05, t - C * 0.15, 0, t, C * 0.1, t - C * 0.1);
      ctx.stroke();
      break;
    case "˚":
      ctx.arc(0, t - C * 0.08, C * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "¸":
      ctx.moveTo(0, C * 0.01);
      ctx.quadraticCurveTo(C * 0.08, C * 0.1, -C * 0.05, C * 0.17);
      ctx.stroke();
      break;
    default: {
      // ¨ (trema / umlaut)
      const r = Math.max(1.5, bank.stroke * 0.62);
      ctx.arc(-C * 0.09, t - C * 0.06, r, 0, Math.PI * 2);
      ctx.moveTo(C * 0.09 + r, t - C * 0.06);
      ctx.arc(C * 0.09, t - C * 0.06, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Combineert pagina's naast elkaar niet; levert één canvas met witte achtergrond voor JPEG/PDF. */
export function flattenForPrint(canvas: HTMLCanvasElement, background: string | null): HTMLCanvasElement {
  if (background) return canvas;
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return c;
}
