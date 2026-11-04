import { CAP_PX, type RawGlyph, type GlyphSource } from "./types";
import { applyH, convexHull, homography, minAreaRect, polygonArea, type Mat3, type Pt } from "./geometry";
import {
  BIT_SIZE,
  CAP_MM,
  CELL,
  GRID,
  ID_BITS,
  MARKERS,
  MARKER_SIZE,
  ORIENT,
  PAGE,
  cellRect,
  sheetById,
  type SheetDef,
} from "./charset";

export interface Gray {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function rgbaToGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    // Ongeveer ITU-R BT.601 luminantie; transparante pixels tellen als wit papier.
    const a = rgba[j + 3];
    const l = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    out[i] = a === 255 ? l : 255 - (((255 - l) * a) >> 8);
  }
  return { w, h, data: out };
}

/** Verkleinen met een box-filter (gemiddelde van de bedekte pixels). */
export function resizeGray(g: Gray, nw: number, nh: number): Gray {
  const out = new Uint8ClampedArray(nw * nh);
  const fx = g.w / nw;
  const fy = g.h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.min(g.h, Math.floor((y + 1) * fy)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.min(g.w, Math.floor((x + 1) * fx)));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * g.w;
        for (let xx = x0; xx < x1; xx++) sum += g.data[row + xx];
      }
      out[y * nw + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { w: nw, h: nh, data: out };
}

export function sampleBilinear(g: Gray, x: number, y: number): number {
  // Pixelcentra liggen op .5
  const fx = x - 0.5;
  const fy = y - 0.5;
  if (fx < -1 || fy < -1 || fx > g.w || fy > g.h) return 255;
  const x0 = Math.max(0, Math.min(g.w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(g.h - 1, Math.floor(fy)));
  const x1 = Math.min(g.w - 1, x0 + 1);
  const y1 = Math.min(g.h - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const d = g.data;
  const a = d[y0 * g.w + x0] * (1 - tx) + d[y0 * g.w + x1] * tx;
  const b = d[y1 * g.w + x0] * (1 - tx) + d[y1 * g.w + x1] * tx;
  return a * (1 - ty) + b * ty;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < values.length; i++) hist[Math.max(0, Math.min(255, Math.round(values[i])))]++;
  const target = p * values.length;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

export interface Component {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

/** Labelt samenhangende gebieden (8-buren) in een binair masker. */
export function labelComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; comps: Component[] } {
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const c: Component = { id: next, area: 0, minX: w, minY: h, maxX: 0, maxY: 0, sumX: 0, sumY: 0 };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      c.sumX += x;
      c.sumY += y;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
          const q = ny * w + nx;
          if (mask[q] && !labels[q]) {
            labels[q] = next;
            stack[sp++] = q;
          }
        }
      }
    }
    comps.push(c);
    next++;
  }
  return { labels, comps };
}

/** Adaptieve drempel: pixel is donker als hij duidelijk donkerder is dan zijn omgeving. */
export function adaptiveThreshold(g: Gray, win: number, k: number): Uint8Array {
  const { w, h, data } = g;
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const r = win >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const mean = sum / ((y1 - y0) * (x1 - x0));
      out[y * w + x] = data[y * w + x] < mean * k ? 1 : 0;
    }
  }
  return out;
}

interface SquareCandidate {
  cx: number;
  cy: number;
  area: number;
  side: number;
}

function squareCandidates(mask: Uint8Array, w: number, h: number, minArea: number): SquareCandidate[] {
  const { labels, comps } = labelComponents(mask, w, h);
  const out: SquareCandidate[] = [];
  for (const c of comps) {
    if (c.area < minArea) continue;
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const aspect = bw / bh;
    if (aspect < 0.4 || aspect > 2.5) continue;
    if (c.area / (bw * bh) < 0.42) continue;
    // Omtrekpunten per rij → convex omhulsel → kleinste rechthoek.
    const pts: Pt[] = [];
    for (let y = c.minY; y <= c.maxY; y++) {
      let left = -1;
      let right = -1;
      for (let x = c.minX; x <= c.maxX; x++) {
        if (labels[y * w + x] === c.id) {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left >= 0) {
        pts.push([left, y], [left, y + 1], [right + 1, y], [right + 1, y + 1]);
      }
    }
    const hull = convexHull(pts);
    const hullArea = polygonArea(hull);
    if (hullArea <= 0) continue;
    const solidity = c.area / hullArea;
    const rect = minAreaRect(hull);
    if (solidity < 0.86) continue;
    if (rect.short / rect.long < 0.55) continue;
    if (c.area / rect.area < 0.78) continue;
    out.push({ cx: c.sumX / c.area + 0.5, cy: c.sumY / c.area + 0.5, area: c.area, side: Math.sqrt(c.area) });
  }
  return out;
}

export interface TemplateDetection {
  /** Homografie van sjabloon-millimeters naar pixels van de foto. */
  H: Mat3;
  sheet: SheetDef;
  sheetDetected: boolean;
  paperWhite: number;
}

function darknessAt(g: Gray, H: Mat3, cx: number, cy: number, half: number, white: number): number {
  let sum = 0;
  let n = 0;
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const [u, v] = applyH(H, cx + (i / 2) * half, cy + (j / 2) * half);
      sum += sampleBilinear(g, u, v);
      n++;
    }
  }
  return Math.max(0, Math.min(1, (white - sum / n) / Math.max(1, white)));
}

function estimatePaperWhite(g: Gray, H: Mat3): number {
  const vals: number[] = [];
  for (let y = GRID.y; y <= GRID.y + GRID.rows * GRID.cellH; y += 4) {
    for (let x = GRID.x; x <= GRID.x + GRID.cols * GRID.cellW; x += 4) {
      const [u, v] = applyH(H, x + 1.3, y + 1.7);
      vals.push(sampleBilinear(g, u, v));
    }
  }
  return Math.max(60, percentile(vals, 0.9));
}

/** Verfijnt het middelpunt van een hoekmarkering op volle resolutie. */
function refineMarker(g: Gray, cx: number, cy: number, side: number): Pt {
  const r = Math.round(side * 1.1);
  const x0 = Math.max(0, Math.round(cx - r));
  const y0 = Math.max(0, Math.round(cy - r));
  const x1 = Math.min(g.w, Math.round(cx + r));
  const y1 = Math.min(g.h, Math.round(cy + r));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 4 || h < 4) return [cx, cy];
  const vals = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) vals[y * w + x] = g.data[(y0 + y) * g.w + x0 + x];
  const thr = (percentile(vals, 0.05) + percentile(vals, 0.95)) / 2;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = vals[i] < thr ? 1 : 0;
  const { comps } = labelComponents(mask, w, h);
  let best: Component | null = null;
  let bestScore = -Infinity;
  for (const c of comps) {
    const mx = c.sumX / c.area;
    const my = c.sumY / c.area;
    const dist = Math.hypot(mx + x0 - cx, my + y0 - cy);
    const score = c.area - dist * dist * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || best.area < side * side * 0.3) return [cx, cy];
  return [best.sumX / best.area + 0.5 + x0, best.sumY / best.area + 0.5 + y0];
}

const NOT_FOUND =
  "De vier zwarte hoekvierkanten van het sjabloon zijn niet gevonden. Zorg dat het hele blad in beeld is, goed belicht, zonder schaduw over de hoeken.";

/** Zoekt het sjabloon op de foto en bepaalt de perspectief-correctie en het bladnummer. */
export function detectTemplate(full: Gray, forcedSheet?: number): TemplateDetection {
  const maxDim = 1000;
  const scale = Math.min(1, maxDim / Math.max(full.w, full.h));
  const small = scale < 1 ? resizeGray(full, Math.round(full.w * scale), Math.round(full.h * scale)) : full;
  const win = Math.max(15, Math.round(Math.max(small.w, small.h) / 8)) | 1;
  const mask = adaptiveThreshold(small, win, 0.62);
  const minArea = Math.max(16, (small.w * small.h) / 40000);
  let cands = squareCandidates(mask, small.w, small.h, minArea);
  cands.sort((a, b) => b.area - a.area);
  cands = cands.slice(0, 14);
  if (cands.length < 4) throw new Error(NOT_FOUND);

  let best: { pts: SquareCandidate[]; score: number } | null = null;
  const n = cands.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const four = [cands[a], cands[b], cands[c], cands[d]];
          const areas = four.map((q) => q.area);
          if (Math.max(...areas) / Math.min(...areas) > 3.2) continue;
          const mx = four.reduce((s, q) => s + q.cx, 0) / 4;
          const my = four.reduce((s, q) => s + q.cy, 0) / 4;
          const ordered = [...four].sort((p, q) => Math.atan2(p.cy - my, p.cx - mx) - Math.atan2(q.cy - my, q.cx - mx));
          const poly: Pt[] = ordered.map((q) => [q.cx, q.cy]);
          // Convex?
          let sign = 0;
          let convex = true;
          for (let i = 0; i < 4; i++) {
            const [x1, y1] = poly[i];
            const [x2, y2] = poly[(i + 1) % 4];
            const [x3, y3] = poly[(i + 2) % 4];
            const cr = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
            const s = Math.sign(cr);
            if (s === 0 || (sign && s !== sign)) convex = false;
            sign = s;
          }
          if (!convex) continue;
          const area = polygonArea(poly);
          const meanSide = four.reduce((s, q) => s + q.side, 0) / 4;
          const rel = meanSide / Math.sqrt(area);
          // Sjabloon: 9 mm markering t.o.v. √(178·265) ≈ 217 mm → ≈ 0.041
          if (rel < 0.018 || rel > 0.1) continue;
          // Verhouding van de zijden: ongeveer 178 : 265 (of gedraaid)
          const s01 = Math.hypot(poly[1][0] - poly[0][0], poly[1][1] - poly[0][1]);
          const s12 = Math.hypot(poly[2][0] - poly[1][0], poly[2][1] - poly[1][1]);
          const s23 = Math.hypot(poly[3][0] - poly[2][0], poly[3][1] - poly[2][1]);
          const s30 = Math.hypot(poly[0][0] - poly[3][0], poly[0][1] - poly[3][1]);
          const ratio = (s01 + s23) / (s12 + s30);
          const r = ratio > 1 ? 1 / ratio : ratio;
          if (r < 0.42 || r > 0.95) continue;
          const score = area * (1 - Math.abs(r - 0.672));
          if (!best || score > best.score) best = { pts: ordered, score };
        }
  if (!best) throw new Error(NOT_FOUND);

  // Terug naar volle resolutie en verfijnen.
  const pts: Pt[] = best.pts.map((q) => refineMarker(full, q.cx / scale, q.cy / scale, q.side / scale));

  // Oriëntatie bepalen met het kleine vierkant naast de markering linksboven.
  let chosen: { H: Mat3; score: number } | null = null;
  for (let rot = 0; rot < 4; rot++) {
    const dst: Pt[] = [0, 1, 2, 3].map((i) => pts[(i + rot) % 4]);
    let H: Mat3;
    try {
      H = homography(MARKERS, dst);
    } catch {
      continue;
    }
    const white = estimatePaperWhite(full, H);
    const dark = darknessAt(full, H, ORIENT.x, ORIENT.y, ORIENT.size * 0.3, white);
    const ref = darknessAt(full, H, ORIENT.x, ORIENT.y + 7, ORIENT.size * 0.3, white);
    const mirror = darknessAt(full, H, PAGE.w - ORIENT.x, ORIENT.y, ORIENT.size * 0.3, white);
    const score = dark - Math.max(ref, mirror);
    if (!chosen || score > chosen.score) chosen = { H, score };
  }
  if (!chosen) throw new Error(NOT_FOUND);
  let H = chosen.H;
  if (chosen.score < 0.2) {
    // Geen duidelijk oriëntatievierkant: neem aan dat de foto rechtop staat.
    const order = [...pts].sort((p, q) => p[1] - q[1]);
    const top = order.slice(0, 2).sort((p, q) => p[0] - q[0]);
    const bottom = order.slice(2).sort((p, q) => p[0] - q[0]);
    H = homography(MARKERS, [top[0], top[1], bottom[1], bottom[0]]);
  }

  const paperWhite = estimatePaperWhite(full, H);
  let id = 0;
  ID_BITS.forEach((b, i) => {
    if (darknessAt(full, H, b.x, b.y, BIT_SIZE * 0.3, paperWhite) > 0.4) id |= 1 << i;
  });
  const detected = sheetById(id);
  const sheet = sheetById(forcedSheet ?? -1) ?? detected ?? sheetById(1)!;
  return { H, sheet, sheetDetected: Boolean(detected), paperWhite };
}

export interface InkOptions {
  strong?: number;
  weak?: number;
  minArea?: number;
  borderMinArea?: number;
  bg?: number;
  /** Gebieden waar alleen inkt boven `below` meetelt (bv. het grijze label of een hulplijn in een vak). */
  suppress?: { x: number; y: number; w: number; h: number; below: number }[];
  /** Eigen selectie van inktvlekken (vervangt de standaard randregels). */
  select?: (c: Component) => boolean;
}

export interface InkResult {
  alpha: Uint8ClampedArray;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

const smooth = (d: number) => {
  const t = Math.max(0, Math.min(1, (d - 0.1) / 0.45));
  return t * t * (3 - 2 * t) * 255;
};

/** Zet een luminantiebeeld om in inkt (alfa) met hysterese-drempels; ruis en randresten worden verwijderd. */
export function extractInk(L: Float32Array, w: number, h: number, opts: InkOptions = {}): InkResult | null {
  const strong = opts.strong ?? 0.4;
  const weak = opts.weak ?? 0.22;
  const bg = opts.bg ?? percentile(L, 0.9);
  if (bg < 40) return null;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(1, (bg - L[i]) / bg));
  for (const box of opts.suppress ?? []) {
    for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(h, Math.ceil(box.y + box.h)); y++) {
      for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(w, Math.ceil(box.x + box.w)); x++) {
        const i = y * w + x;
        if (d[i] < box.below) d[i] = 0;
      }
    }
  }
  const mask = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let start = 0; start < d.length; start++) {
    if (d[start] < strong || mask[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    mask[start] = 1;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (!mask[q] && d[q] >= weak) {
            mask[q] = 1;
            stack[sp++] = q;
          }
        }
      }
    }
  }
  const { labels, comps } = labelComponents(mask, w, h);
  const minArea = opts.minArea ?? 8;
  const borderMinArea = opts.borderMinArea ?? 60;
  const keep = new Uint8Array(comps.length + 1);
  let any = false;
  let area = 0;
  for (const c of comps) {
    const touches = c.minX === 0 || c.minY === 0 || c.maxX === w - 1 || c.maxY === h - 1;
    if (c.area < minArea) continue;
    if (opts.select) {
      if (!opts.select(c)) continue;
      keep[c.id] = 1;
      any = true;
      area += c.area;
      continue;
    }
    if (touches && c.area < borderMinArea) continue;
    // Dunne lijnresten langs de rand (vakranden) negeren.
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (touches && (bw > w * 0.7 || bh > h * 0.7) && c.area < Math.max(bw, bh) * 4) continue;
    keep[c.id] = 1;
    any = true;
    area += c.area;
  }
  if (!any) return null;
  const alpha = new Uint8ClampedArray(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < labels.length; i++) {
    if (!keep[labels[i]]) continue;
    const x = i % w;
    const y = (i - x) / w;
    alpha[i] = Math.max(alpha[i], smooth(d[i]));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    // Zachte rand van 1 pixel behouden.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!keep[labels[q]] && d[q] > 0.12) alpha[q] = Math.max(alpha[q], smooth(d[q]) * 0.85);
      }
    }
  }
  return { alpha, minX, minY, maxX, maxY, area };
}

/** Snijdt de inkt bij tot een glyph met 2 px marge. */
export function cropGlyph(ink: InkResult, w: number, h: number, baselineY: number, ch: string, source: GlyphSource): RawGlyph {
  const pad = 2;
  const x0 = Math.max(0, ink.minX - pad);
  const y0 = Math.max(0, ink.minY - pad);
  const x1 = Math.min(w - 1, ink.maxX + pad);
  const y1 = Math.min(h - 1, ink.maxY + pad);
  const gw = x1 - x0 + 1;
  const gh = y1 - y0 + 1;
  const alpha = new Uint8ClampedArray(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) alpha[y * gw + x] = ink.alpha[(y + y0) * w + x + x0];
  }
  return { ch, width: gw, height: gh, baseline: baselineY - y0, alpha, source };
}

/** Knipt alle vakken van een gedetecteerd sjabloon uit. */
export function extractSheet(full: Gray, det: TemplateDetection): { glyphs: RawGlyph[]; empty: string[] } {
  const ppm = CAP_PX / CAP_MM;
  const glyphs: RawGlyph[] = [];
  const empty: string[] = [];
  det.sheet.chars.forEach((ch, index) => {
    const rect = cellRect(index);
    const inset = CELL.inset;
    const x0 = rect.x + inset;
    const y0 = rect.y + inset;
    const W = Math.round((rect.w - 2 * inset) * ppm);
    const H = Math.round((rect.h - 2 * inset) * ppm);
    const L = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const [u, v] = applyH(det.H, x0 + (i + 0.5) / ppm, y0 + (j + 0.5) / ppm);
        L[j * W + i] = sampleBilinear(full, u, v);
      }
    }
    const labelBox = (CELL.label.box - inset) * ppm;
    // Hulplijnen (lichtblauw) en het grijze label mogen nooit als inkt meetellen.
    const band = 0.55 * ppm;
    const guides = [CELL.capY, CELL.xY, CELL.baseY].map((gy) => ({
      x: 0,
      y: (gy - inset) * ppm - band,
      w: W,
      h: band * 2,
      below: 0.34,
    }));
    const ink = extractInk(L, W, H, {
      bg: Math.max(percentile(L, 0.9), det.paperWhite * 0.75),
      minArea: 10,
      borderMinArea: 70,
      suppress: [{ x: 0, y: 0, w: labelBox, h: labelBox, below: 0.5 }, ...guides],
    });
    if (!ink || ink.area < 25) {
      empty.push(ch);
      return;
    }
    const g = cropGlyph(ink, W, H, (CELL.baseY - inset) * ppm, ch, "scan");
    const touches = ink.minX <= 0 || ink.minY <= 0 || ink.maxX >= W - 1 || ink.maxY >= H - 1;
    if (touches) g.warning = "Raakt de rand van het vak — mogelijk afgesneden.";
    glyphs.push(g);
  });
  return { glyphs, empty };
}

export { MARKER_SIZE };
