import { CAP_PX, type RawGlyph } from "./types";
import { extractInk, percentile, type Gray } from "./imageproc";
import { median, robustLine, type Pt } from "./geometry";

/** Teken zoals de AI het teruggeeft: box = [ymin, xmin, ymax, xmax] genormaliseerd op 0–1000. */
export interface AiChar {
  char: string;
  line: number;
  box: number[];
}

const BASELINE_CHARS = new Set([..."abcdehiklmnorstuvwxzABCDEFGHIKLMNOPRSTUVWXZ0123456789!?"]);
const XHEIGHT_CHARS = new Set([..."acemnorsuvwxz"]);
const CAP_CHARS = new Set([..."ABCDEFGHIKLMNOPRSTUVWXZ0123456789"]);

interface Found {
  char: string;
  line: number;
  /** Inkt in het uitsnijgebied. */
  alpha: Uint8ClampedArray;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  /** Strakke inktgrenzen (volle-resolutiecoördinaten). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Knipt de door de AI gevonden tekens uit een foto en normaliseert ze (rechtzetten, schalen, basislijn). */
export function extractPhotoGlyphs(full: Gray, chars: AiChar[]): { glyphs: RawGlyph[]; failed: string[]; small: boolean } {
  const boxes = chars.map((c) => ({
    ...c,
    x0: (c.box[1] / 1000) * full.w,
    y0: (c.box[0] / 1000) * full.h,
    x1: (c.box[3] / 1000) * full.w,
    y1: (c.box[2] / 1000) * full.h,
  }));
  const found: Found[] = [];
  const failed: string[] = [];

  const typical = median(boxes.map((b) => b.y1 - b.y0)) || 20;
  boxes.forEach((b, idx) => {
    const bw = Math.max(2, b.x1 - b.x0);
    const bh = Math.max(2, b.y1 - b.y0);
    // Punten van i/j, accenten en de punt onder ! en ? vallen soms buiten het AI-vak.
    const dotBelow = "!?".includes(b.char);
    const ex0 = b.x0 - Math.max(bw * 0.1, typical * 0.08) - 2;
    const ex1 = b.x1 + Math.max(bw * 0.1, typical * 0.08) + 2;
    const ey0 = b.y0 - Math.max(bh * 0.32, typical * 0.3) - 2;
    const ey1 = b.y1 + Math.max(bh * 0.1, typical * (dotBelow ? 0.35 : 0.12)) + 2;
    const rx = Math.max(0, Math.floor(ex0 - bw * 0.25));
    const ry = Math.max(0, Math.floor(ey0 - bh * 0.15));
    const rx1 = Math.min(full.w, Math.ceil(ex1 + bw * 0.25));
    const ry1 = Math.min(full.h, Math.ceil(ey1 + bh * 0.15));
    const rw = rx1 - rx;
    const rh = ry1 - ry;
    if (rw < 3 || rh < 3) {
      failed.push(b.char);
      return;
    }
    const L = new Float32Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) L[y * rw + x] = full.data[(ry + y) * full.w + rx + x];
    // Achtergrond uit een ruimer gebied schatten zodat kleine uitsnedes niet "vol inkt" lijken.
    const others = boxes.filter((_, j) => j !== idx);
    const ink = extractInk(L, rw, rh, {
      bg: Math.max(percentile(L, 0.85), 60),
      minArea: 5,
      select: (c) => {
        const cx = rx + c.sumX / c.area + 0.5;
        const cy = ry + c.sumY / c.area + 0.5;
        if (cx < ex0 || cx > ex1 || cy < ey0 || cy > ey1) return false;
        // Hoort bij een ander teken als het zwaartepunt duidelijk in diens vak ligt.
        for (const o of others) {
          if (cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1) {
            const inOwn = cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1;
            if (!inOwn) return false;
            const dOwn = Math.hypot(cx - (b.x0 + b.x1) / 2, cy - (b.y0 + b.y1) / 2);
            const dOther = Math.hypot(cx - (o.x0 + o.x1) / 2, cy - (o.y0 + o.y1) / 2);
            if (dOther < dOwn * 0.7) return false;
          }
        }
        return true;
      },
    });
    if (!ink || ink.area < 6) {
      failed.push(b.char);
      return;
    }
    found.push({
      char: b.char,
      line: b.line,
      alpha: ink.alpha,
      rx,
      ry,
      rw,
      rh,
      x0: rx + ink.minX,
      y0: ry + ink.minY,
      x1: rx + ink.maxX + 1,
      y1: ry + ink.maxY + 1,
    });
  });

  // Basislijn per regel en een globale hoofdletterhoogte.
  const byLine = new Map<number, Found[]>();
  for (const f of found) byLine.set(f.line, [...(byLine.get(f.line) ?? []), f]);
  const fits = new Map<number, { a: number; b: number }>();
  const capSamples: number[] = [];
  const xSamples: number[] = [];
  byLine.forEach((list, line) => {
    const pts: Pt[] = list.filter((f) => BASELINE_CHARS.has(f.char)).map((f) => [(f.x0 + f.x1) / 2, f.y1]);
    const fallback: Pt[] = list.map((f) => [(f.x0 + f.x1) / 2, f.y1]);
    fits.set(line, robustLine(pts.length >= 2 ? pts : fallback));
    for (const f of list) {
      if (CAP_CHARS.has(f.char)) capSamples.push(f.y1 - f.y0);
      if (XHEIGHT_CHARS.has(f.char)) xSamples.push(f.y1 - f.y0);
    }
  });
  let capPx = capSamples.length >= 2 ? median(capSamples) : NaN;
  if (!Number.isFinite(capPx) && xSamples.length) capPx = median(xSamples) / 0.6;
  if (!Number.isFinite(capPx)) capPx = median(found.map((f) => f.y1 - f.y0)) || 40;
  const scale = CAP_PX / capPx;

  const glyphs: RawGlyph[] = [];
  for (const f of found) {
    const fit = fits.get(f.line) ?? { a: f.y1, b: 0 };
    glyphs.push(resampleGlyph(f, fit, scale));
  }
  return { glyphs, failed, small: capPx < 28 };
}

function resampleGlyph(f: Found, fit: { a: number; b: number }, s: number): RawGlyph {
  const theta = Math.atan(fit.b);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const bw = f.x1 - f.x0;
  const bh = f.y1 - f.y0;
  const cx = (f.x0 + f.x1) / 2;
  const cy = (f.y0 + f.y1) / 2;
  const ow = Math.ceil(s * (bw * Math.abs(cos) + bh * Math.abs(sin))) + 6;
  const oh = Math.ceil(s * (bw * Math.abs(sin) + bh * Math.abs(cos))) + 6;
  const out = new Uint8ClampedArray(ow * oh);
  const sample = (x: number, y: number) => {
    // bilineair in het uitsnijgebied (buiten = 0)
    const lx = x - f.rx - 0.5;
    const ly = y - f.ry - 0.5;
    const x0 = Math.floor(lx);
    const y0 = Math.floor(ly);
    const tx = lx - x0;
    const ty = ly - y0;
    const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= f.rw || yy >= f.rh ? 0 : f.alpha[yy * f.rw + xx]);
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      const dx = (ox + 0.5 - ow / 2) / s;
      const dy = (oy + 0.5 - oh / 2) / s;
      const px = cx + cos * dx - sin * dy;
      const py = cy + sin * dx + cos * dy;
      out[oy * ow + ox] = sample(px, py);
    }
  }
  // Basislijn in de uitvoer.
  const yb = fit.a + fit.b * cx;
  let baseline = oh / 2 + s * cos * (yb - cy);
  // Bijsnijden.
  let minX = ow, minY = oh, maxX = -1, maxY = -1;
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++)
      if (out[y * ow + x] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return { ch: f.char, width: 1, height: 1, baseline: 0, alpha: new Uint8ClampedArray(1), source: "photo" };
  const x0 = Math.max(0, minX - 2);
  const y0 = Math.max(0, minY - 2);
  const x1 = Math.min(ow - 1, maxX + 2);
  const y1 = Math.min(oh - 1, maxY + 2);
  const gw = x1 - x0 + 1;
  const gh = y1 - y0 + 1;
  const alpha = new Uint8ClampedArray(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) alpha[y * gw + x] = out[(y + y0) * ow + x + x0];
  baseline -= y0;
  return { ch: f.char, width: gw, height: gh, baseline, alpha, source: "photo" };
}
