import { CAP_PX, type RawGlyph } from "./types";
import { hysteresisMask, labelComponents, localBackground, removeRuling, smooth, type Gray } from "./imageproc";
import { median } from "./geometry";

/** Teken zoals de AI het teruggeeft: box = [ymin, xmin, ymax, xmax] genormaliseerd op 0–1000. */
export interface AiChar {
  char: string;
  line: number;
  box: number[];
}

/** Zet AI-vakken om naar een beeld dat `quarterTurns` kwartslagen met de klok mee is gedraaid. */
export function rotateAiChars(chars: AiChar[], quarterTurns: number): AiChar[] {
  const q = ((quarterTurns % 4) + 4) % 4;
  if (!q) return chars;
  return chars.map((c) => {
    const [y0, x0, y1, x1] = c.box;
    const box =
      q === 1 ? [x0, 1000 - y1, x1, 1000 - y0] : q === 2 ? [1000 - y1, 1000 - x1, 1000 - y0, 1000 - x0] : [1000 - x1, y0, 1000 - x0, y1];
    return { ...c, box };
  });
}

const BASELINE_CHARS = new Set([..."abcdehiklmnorstuvwxzABCDEFGHIKLMNOPRSTUVWXZ0123456789!?"]);
const XHEIGHT_CHARS = new Set([..."acemnorsuvwxz"]);
const CAP_CHARS = new Set([..."ABCDEFGHIKLMNOPRSTUVWXZ0123456789"]);

interface Found {
  char: string;
  line: number;
  /** Volgorde in de lijst (AI-volgorde; onbenoemde tekens achteraan). */
  order: number;
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
export function extractPhotoGlyphs(
  full: Gray,
  chars: AiChar[],
): { glyphs: RawGlyph[]; failed: string[]; small: boolean; inkScore: number } {
  const boxes = chars.map((c) => ({
    ...c,
    x0: (c.box[1] / 1000) * full.w,
    y0: (c.box[0] / 1000) * full.h,
    x1: (c.box[3] / 1000) * full.w,
    y1: (c.box[2] / 1000) * full.h,
  }));
  const found: Found[] = [];
  const failed: string[] = [];

  // Lettergrootte uit de vakken; ongewoon smalle, lange vakken (AI-fout) tellen niet volledig mee.
  const typical = median(boxes.map((b) => Math.min(b.y1 - b.y0, Math.max(4, b.x1 - b.x0) * 1.8))) || 20;
  if (!boxes.length) return { glyphs: [], failed, small: false, inkScore: 0 };
  // Maat voor de grootte van een heel teken: hoogte van hoofdletters/cijfers (kleine letters zijn lager).
  const capBoxes = boxes.filter((b) => CAP_CHARS.has(b.char)).map((b) => Math.min(b.y1 - b.y0, Math.max(4, b.x1 - b.x0) * 2.2));
  const unit = Math.max(typical, capBoxes.length >= 4 ? median(capBoxes) : typical * 1.4);

  // 1. Werkgebied: alle vakken met wat marge.
  const pad = typical * 0.8;
  const gx0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x0)) - pad));
  const gy0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y0)) - pad));
  const gx1 = Math.min(full.w, Math.ceil(Math.max(...boxes.map((b) => b.x1)) + pad));
  const gy1 = Math.min(full.h, Math.ceil(Math.max(...boxes.map((b) => b.y1)) + pad));
  const W = gx1 - gx0;
  const H = gy1 - gy0;
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) L[y * W + x] = full.data[(gy0 + y) * full.w + gx0 + x];

  // 2. Inktdonkerte t.o.v. het lokale papier (schaduw/zon), ruitjes en lijntjes per tegel eraf.
  const bg = localBackground(L, W, H, Math.max(6, Math.min(40, typical * 0.38)));
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) {
    const v = Math.max(40, bg[i]);
    d[i] = Math.max(0, Math.min(1, (v - L[i]) / v));
  }
  const tile = Math.max(24, Math.round(typical * 2.2));
  for (let ty = 0; ty < H; ty += tile) {
    for (let tx = 0; tx < W; tx += tile) {
      const tw = Math.min(tile, W - tx);
      const th = Math.min(tile, H - ty);
      const t = new Float32Array(tw * th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) t[y * tw + x] = d[(ty + y) * W + tx + x];
      removeRuling(t, tw, th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) d[(ty + y) * W + tx + x] = t[y * tw + x];
    }
  }
  const mask = hysteresisMask(d, W, H, 0.4, 0.17);
  const { labels, comps } = labelComponents(mask, W, H);

  // 3. Inktdelen zelf tot tekens groeperen: delen die boven elkaar liggen (punt op de i, dwarsstreep,
  //    onderbroken lijn) horen bij elkaar. De AI-vakken zijn bij volle vellen vaak verschoven; we gebruiken
  //    ze daarna alleen om elk teken te benoemen.
  const minArea = Math.max(5, Math.round(typical * typical * 0.004));
  type Cluster = { ids: number[]; minX: number; minY: number; maxX: number; maxY: number; area: number; sx: number; sy: number };
  let clusters: Cluster[] = [];
  for (const c of comps) {
    if (c.area < minArea) continue;
    const cw = c.maxX - c.minX + 1;
    const chh = c.maxY - c.minY + 1;
    if (cw > unit * 2.6 || chh > unit * 2.6) continue; // vouw, papierrand, doorgestreepte regel
    clusters.push({ ids: [c.id], minX: c.minX, minY: c.minY, maxX: c.maxX, maxY: c.maxY, area: c.area, sx: c.sumX, sy: c.sumY });
  }
  const shouldMerge = (p: Cluster, q: Cluster) => {
    const ov = Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX) + 1;
    const narrow = Math.min(p.maxX - p.minX + 1, q.maxX - q.minX + 1);
    const vgap = Math.max(0, Math.max(p.minY, q.minY) - Math.min(p.maxY, q.maxY));
    const hgap = Math.max(0, Math.max(p.minX, q.minX) - Math.min(p.maxX, q.maxX));
    const w = Math.max(p.maxX, q.maxX) - Math.min(p.minX, q.minX) + 1;
    const h = Math.max(p.maxY, q.maxY) - Math.min(p.minY, q.minY) + 1;
    if (w > unit * 1.3 || h > unit * 1.9) return false;
    const smallArea = Math.min(p.area, q.area);
    const small = smallArea < typical * typical * 0.035;
    // Boven elkaar: alleen een klein deel (punt, accent, dwarsstreep) of delen die elkaar bijna raken.
    if (ov >= narrow * 0.4 && (vgap < typical * 0.08 || (small && vgap < typical * 0.4))) return true;
    // Onderbroken teken (boog + voetje van een 2, 5 of 3): samen niet hoger dan ongeveer één hoofdletter.
    const lowest = Math.min(p.maxY - p.minY + 1, q.maxY - q.minY + 1);
    if (ov >= narrow * 0.4 && vgap < typical * 0.3 && h <= unit * 1.2 && lowest <= unit * 0.3) return true;
    // Overlappende of rakende delen van één teken (onderbroken lijn bij een kleine of vage foto).
    const ix = Math.max(0, Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX) + 1);
    const iy = Math.max(0, Math.min(p.maxY, q.maxY) - Math.max(p.minY, q.minY) + 1);
    const smallBox = Math.min((p.maxX - p.minX + 1) * (p.maxY - p.minY + 1), (q.maxX - q.minX + 1) * (q.maxY - q.minY + 1));
    if (ix * iy >= smallBox * 0.5 && w <= unit * 1.05 && h <= unit * 1.05) return true;
    if (hgap <= 1 && vgap <= 1 && w <= unit * 0.9 && h <= unit * 1.05) return true;
    // Klein snippertje vlak naast een teken (bv. losgeraakt staartje).
    return smallArea < typical * typical * 0.02 && hgap < typical * 0.1 && vgap < typical * 0.15;
  };
  for (let changed = true; changed; ) {
    changed = false;
    clusters.sort((p, q) => p.minX - q.minX);
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const p = clusters[i];
        const q = clusters[j];
        if (q.minX > p.maxX + typical * 0.2) break;
        if (!shouldMerge(p, q)) continue;
        clusters[i] = {
          ids: [...p.ids, ...q.ids],
          minX: Math.min(p.minX, q.minX),
          minY: Math.min(p.minY, q.minY),
          maxX: Math.max(p.maxX, q.maxX),
          maxY: Math.max(p.maxY, q.maxY),
          area: p.area + q.area,
          sx: p.sx + q.sx,
          sy: p.sy + q.sy,
        };
        clusters.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  // Losse puntjes en stofjes die nergens bij horen weglaten.
  clusters = clusters.filter((c) => c.maxY - c.minY + 1 >= typical * 0.12 || c.area >= typical * typical * 0.015);

  // 4. Eén-op-één koppelen: telkens het dichtstbijzijnde paar (midden van het teken ↔ midden van het AI-vak).
  //    Twee rondes: eerst meten hoe ver de AI-vakken plaatselijk verschoven liggen, dan met correctie opnieuw.
  const centers = clusters.map((c) => ({ x: gx0 + (c.minX + c.maxX + 1) / 2, y: gy0 + (c.minY + c.maxY + 1) / 2, h: c.maxY - c.minY + 1 }));
  const bc = boxes.map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, h: b.y1 - b.y0 }));
  const tinyOk = new Set([...".,'’‘`´-:;!¡¨^~°"]);
  const match = (offsets: { x: number; y: number }[], limit: number) => {
    const pairs: { cost: number; b: number; c: number }[] = [];
    centers.forEach((c, ci) => {
      const fragment = c.h < typical * 0.3;
      bc.forEach((b, bi) => {
        if (fragment && !tinyOk.has(boxes[bi].char)) return;
        const bx = b.x + offsets[bi].x;
        const by = b.y + offsets[bi].y;
        const dist = Math.hypot(c.x - bx, (c.y - by) * 0.8) / typical;
        if (dist > limit) return;
        const size = Math.abs(Math.log(Math.max(4, c.h) / Math.max(4, b.h)));
        pairs.push({ cost: dist + size * 0.3, b: bi, c: ci });
      });
    });
    pairs.sort((p, q) => p.cost - q.cost);
    const boxOf = new Int32Array(clusters.length).fill(-1);
    const clusterOf = new Int32Array(boxes.length).fill(-1);
    for (const pr of pairs) {
      if (boxOf[pr.c] >= 0 || clusterOf[pr.b] >= 0) continue;
      boxOf[pr.c] = pr.b;
      clusterOf[pr.b] = pr.c;
    }
    return { boxOf, clusterOf };
  };
  const zero = boxes.map(() => ({ x: 0, y: 0 }));
  const first = match(zero, 0.9);
  const shifts: { x: number; y: number; dx: number; dy: number }[] = [];
  first.clusterOf.forEach((ci, bi) => {
    if (ci >= 0) shifts.push({ x: bc[bi].x, y: bc[bi].y, dx: centers[ci].x - bc[bi].x, dy: centers[ci].y - bc[bi].y });
  });
  const offsets = bc.map((b) => {
    if (shifts.length < 6) return { x: 0, y: 0 };
    const near = shifts
      .map((s) => ({ s, dd: Math.hypot(s.x - b.x, s.y - b.y) }))
      .sort((p, q) => p.dd - q.dd)
      .slice(0, 9)
      .map((n) => n.s);
    return { x: median(near.map((n) => n.dx)), y: median(near.map((n) => n.dy)) };
  });
  const { boxOf, clusterOf } = match(offsets, 0.75);

  // Grenzen van het beschreven deel (voor onbenoemde tekens): geen ruis van tafel of papierrand.
  const bx0 = Math.min(...boxes.map((b) => b.x0)) - typical * 0.5;
  const bx1 = Math.max(...boxes.map((b) => b.x1)) + typical * 0.5;
  const by0 = Math.min(...boxes.map((b) => b.y0)) - typical * 0.5;
  const by1 = Math.max(...boxes.map((b) => b.y1)) + typical * 0.5;

  const lineOfY = (y: number) => {
    // Regel van een onbenoemd teken: die van het dichtstbijzijnde AI-vak.
    let best = 0;
    let bd = Infinity;
    for (const b of boxes) {
      const dd = Math.abs((b.y0 + b.y1) / 2 - y);
      if (dd < bd) {
        bd = dd;
        best = b.line;
      }
    }
    return best;
  };

  const owner = new Int32Array(comps.length + 1).fill(-1);
  clusters.forEach((c, ci) => c.ids.forEach((id) => (owner[id] = ci)));
  const unnamed: Found[] = [];
  boxes.forEach((b, bi) => {
    if (clusterOf[bi] < 0) failed.push(b.char);
  });
  clusters.forEach((c, ci) => {
    const named = boxOf[ci] >= 0;
    if (!named) {
      const cw = c.maxX - c.minX + 1;
      const chh = c.maxY - c.minY + 1;
      const cx = gx0 + (c.minX + c.maxX) / 2;
      const cy = gy0 + (c.minY + c.maxY) / 2;
      if (chh < typical * 0.4 || c.area < typical * typical * 0.03) return;
      if (cx < bx0 || cx > bx1 || cy < by0 || cy > by1) return;
      if (c.area / (cw * chh) > 0.45 || chh > unit * 1.9 || cw > unit * 1.4) return; // vlek, schaduw of rand
    }
    const rx = Math.max(0, c.minX - 2);
    const ry = Math.max(0, c.minY - 2);
    const rw = Math.min(W - 1, c.maxX + 2) - rx + 1;
    const rh = Math.min(H - 1, c.maxY + 2) - ry + 1;
    const alpha = new Uint8ClampedArray(rw * rh);
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++) {
        const i = (ry + y) * W + rx + x;
        const lab = labels[i];
        if (lab && owner[lab] === ci) alpha[y * rw + x] = smooth(d[i]);
        else if (!lab && d[i] > 0.12) {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++)
            for (let dx = -1; dx <= 1 && !near; dx++) {
              const yy = ry + y + dy;
              const xx = rx + x + dx;
              if (yy >= 0 && yy < H && xx >= 0 && xx < W) {
                const l2 = labels[yy * W + xx];
                if (l2 && owner[l2] === ci) near = true;
              }
            }
          if (near) alpha[y * rw + x] = smooth(d[i]) * 0.85;
        }
      }
    const f: Found = {
      char: named ? boxes[boxOf[ci]].char : "",
      line: named ? boxes[boxOf[ci]].line : lineOfY(gy0 + (c.minY + c.maxY) / 2),
      order: named ? boxOf[ci] : boxes.length + ci,
      alpha,
      rx: gx0 + rx,
      ry: gy0 + ry,
      rw,
      rh,
      x0: gx0 + c.minX,
      y0: gy0 + c.minY,
      x1: gx0 + c.maxX + 1,
      y1: gy0 + c.maxY + 1,
    };
    (named ? found : unnamed).push(f);
  });
  found.sort((p, q) => p.order - q.order);
  found.push(...unnamed);

  // Hoofdletterhoogte (voor de schaal).
  const capSamples = found.filter((f) => CAP_CHARS.has(f.char)).map((f) => f.y1 - f.y0);
  const xSamples = found.filter((f) => XHEIGHT_CHARS.has(f.char)).map((f) => f.y1 - f.y0);
  let capPx = capSamples.length >= 2 ? median(capSamples) : NaN;
  if (!Number.isFinite(capPx) && xSamples.length) capPx = median(xSamples) / 0.6;
  if (!Number.isFinite(capPx)) capPx = median(found.map((f) => f.y1 - f.y0)) || 40;
  const scale = CAP_PX / capPx;

  // Schrijflijn per teken, uit de onderkant van letters zonder staart vlak ernaast in dezelfde regel.
  // (De regelnummers van de AI zijn bij volle vellen niet altijd betrouwbaar.)
  const anchors = found
    .filter((f) => BASELINE_CHARS.has(f.char))
    .map((f) => ({ x: (f.x0 + f.x1) / 2, cy: (f.y0 + f.y1) / 2, bottom: f.y1 }));
  const fitFor = (f: Found): { a: number; b: number } => {
    const cx = (f.x0 + f.x1) / 2;
    const cy = (f.y0 + f.y1) / 2;
    const near = anchors
      .filter((a) => Math.abs(a.cy - cy) < capPx * 0.5 && Math.abs(a.x - cx) < capPx * 6)
      .map((a) => ({ a, score: Math.abs(a.x - cx) + Math.abs(a.cy - cy) * 4 }))
      .sort((p, q) => p.score - q.score)
      .slice(0, 5)
      .map((n) => n.a);
    if (near.length) return { a: median(near.map((n) => n.bottom)), b: 0 };
    const desc = "gjpqyQ,;".includes(f.char) ? capPx * 0.35 : 0;
    return { a: f.y1 - desc, b: 0 };
  };

  const glyphs: RawGlyph[] = [];
  for (const f of found) {
    const g = resampleGlyph(f, fitFor(f), scale);
    if (!f.char) g.warning = "Niet herkend door de AI: vul zelf in welk teken dit is (of verwijder het).";
    glyphs.push(g);
  }
  // Hoeveel inkt is aan een benoemd teken gekoppeld? (om twee uitleggen van de AI-vakken te vergelijken)
  const inkScore = clusters.reduce((sum, c, ci) => sum + (boxOf[ci] >= 0 ? c.area : 0), 0);
  return { glyphs, failed, small: capPx < 28, inkScore };
}

/** Afstand van een punt tot een vak (0 als het erin ligt). */
function boxDist(o: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number): number {
  const dx = Math.max(o.x0 - x, 0, x - o.x1);
  const dy = Math.max(o.y0 - y, 0, y - o.y1);
  return Math.hypot(dx, dy);
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
