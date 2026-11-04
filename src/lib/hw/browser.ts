import { CAP_PX, type GlyphData, type RawGlyph } from "./types";
import { rgbaToGray, type Gray } from "./imageproc";

/** RawGlyph → canvas (zwarte inkt met alfa). */
export function rawToCanvas(g: RawGlyph): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = g.width;
  c.height = g.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0; i < g.alpha.length; i++) img.data[i * 4 + 3] = g.alpha[i];
  ctx.putImageData(img, 0, 0);
  return c;
}

export function rawToGlyphData(g: RawGlyph): GlyphData {
  const png = rawToCanvas(g).toDataURL("image/png").split(",")[1];
  return { ch: g.ch, png, width: g.width, height: g.height, baseline: Math.round(g.baseline * 10) / 10, source: g.source };
}

/** Leest een foto in (met EXIF-oriëntatie), verkleint tot `maxDim` en levert grijswaarden plus een JPEG voor de AI. */
export async function loadPhoto(file: File, maxDim = 3000): Promise<{ gray: Gray; aiJpeg: string; preview: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Deze afbeelding kan niet gelezen worden. Gebruik een JPG- of PNG-foto.");
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const gray = rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h);
  const aiScale = Math.min(1, 2048 / Math.max(w, h));
  const ai = document.createElement("canvas");
  ai.width = Math.round(w * aiScale);
  ai.height = Math.round(h * aiScale);
  ai.getContext("2d")!.drawImage(canvas, 0, 0, ai.width, ai.height);
  const aiJpeg = ai.toDataURL("image/jpeg", 0.86);
  const pv = document.createElement("canvas");
  const pScale = Math.min(1, 900 / Math.max(w, h));
  pv.width = Math.round(w * pScale);
  pv.height = Math.round(h * pScale);
  pv.getContext("2d")!.drawImage(canvas, 0, 0, pv.width, pv.height);
  return { gray, aiJpeg, preview: pv.toDataURL("image/jpeg", 0.8) };
}

/** Contactblad met alle tekens + bijschrift "index: teken" (voor de AI-analyse). */
export function contactSheet(glyphs: { ch: string; canvas: CanvasImageSource; w: number; h: number; baseline: number }[]): string {
  const cols = 10;
  const cw = 120;
  const chh = 150;
  const rows = Math.ceil(glyphs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * cw;
  c.height = Math.max(1, rows) * chh;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  glyphs.forEach((g, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * chh;
    const s = Math.min(1, 96 / CAP_PX, (cw - 10) / g.w, (chh - 30) / g.h) * 0.95;
    const baseY = y + 96;
    ctx.drawImage(g.canvas, x + cw / 2 - (g.w * s) / 2, baseY - g.baseline * s, g.w * s, g.h * s);
    ctx.strokeStyle = "#e3e3e3";
    ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${i}: ${g.ch}`, x + cw / 2, y + chh - 10);
  });
  return c.toDataURL("image/jpeg", 0.85);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Afbeelding maken mislukt"))), type, quality),
  );
}
