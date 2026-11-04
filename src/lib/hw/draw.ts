import { CAP_PX, type RawGlyph } from "./types";

export interface StrokePoint {
  x: number;
  y: number;
  p: number;
}
export type Stroke = StrokePoint[];

/** Coördinatenstelsel van het tekenvlak (onafhankelijk van de schermgrootte). */
export const PAD = { w: 300, h: 300, capY: 66, xY: 124, baseY: 192, descY: 258 };
export const PAD_CAP = PAD.baseY - PAD.capY;

/** Tekent vloeiende pennenstreken (kwadratische curves door de middens). */
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, width: number, color = "#111") {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    if (stroke.length === 1) {
      const p = stroke[0];
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, (width * (0.55 + 0.9 * p.p) * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      const prevMid = i > 1 ? { x: (stroke[i - 2].x + a.x) / 2, y: (stroke[i - 2].y + a.y) / 2 } : a;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.lineWidth = width * (0.55 + 0.9 * ((a.p + b.p) / 2)) * scale;
      ctx.beginPath();
      ctx.moveTo(prevMid.x * scale, prevMid.y * scale);
      ctx.quadraticCurveTo(a.x * scale, a.y * scale, mid.x * scale, mid.y * scale);
      if (i === stroke.length - 1) ctx.lineTo(b.x * scale, b.y * scale);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Zet getekende streken om naar een genormaliseerde glyph. */
export function strokesToGlyph(strokes: Stroke[], ch: string, penWidth: number): RawGlyph | null {
  if (!strokes.some((s) => s.length)) return null;
  const scale = CAP_PX / PAD_CAP;
  const w = Math.ceil(PAD.w * scale);
  const h = Math.ceil(PAD.h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  paintStrokes(ctx, strokes, scale, penWidth, "#000");
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  const x0 = Math.max(0, minX - 2);
  const y0 = Math.max(0, minY - 2);
  const x1 = Math.min(w - 1, maxX + 2);
  const y1 = Math.min(h - 1, maxY + 2);
  const gw = x1 - x0 + 1;
  const gh = y1 - y0 + 1;
  const alpha = new Uint8ClampedArray(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) alpha[y * gw + x] = data[((y + y0) * w + x + x0) * 4 + 3];
  return { ch, width: gw, height: gh, baseline: PAD.baseY * scale - y0, alpha, source: "draw" };
}
