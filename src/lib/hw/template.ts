import { BIT_SIZE, CELL, ID_BITS, MARKERS, MARKER_SIZE, ORIENT, PAGE, cellRect, sheetBits, type SheetDef } from "./charset";

const TERMES = '"TeX Gyre Termes", "Times New Roman", Times, serif';

/** Tekent een afdrukbaar sjabloon op een canvas-context (ppm = pixels per millimeter). */
export function drawTemplate(ctx: CanvasRenderingContext2D, sheet: SheetDef, ppm: number, font = TERMES): void {
  const mm = (v: number) => v * ppm;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, mm(PAGE.w), mm(PAGE.h));

  // Hoekmarkeringen, oriëntatievierkant en bladcode.
  ctx.fillStyle = "#000000";
  for (const [cx, cy] of MARKERS) {
    ctx.fillRect(mm(cx - MARKER_SIZE / 2), mm(cy - MARKER_SIZE / 2), mm(MARKER_SIZE), mm(MARKER_SIZE));
  }
  ctx.fillRect(mm(ORIENT.x - ORIENT.size / 2), mm(ORIENT.y - ORIENT.size / 2), mm(ORIENT.size), mm(ORIENT.size));
  sheetBits(sheet.id).forEach((bit, i) => {
    const b = ID_BITS[i];
    if (bit) ctx.fillRect(mm(b.x - BIT_SIZE / 2), mm(b.y - BIT_SIZE / 2), mm(BIT_SIZE), mm(BIT_SIZE));
  });

  // Kop en instructies.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = "#1b1b1b";
  ctx.font = `bold ${mm(4.2)}px ${font}`;
  ctx.fillText("SCHRIJFSITE · HANDSCHRIFTSJABLOON", mm(118), mm(15.6));
  ctx.font = `${mm(3)}px ${font}`;
  ctx.fillText(`${sheet.name} — ${sheet.description}`, mm(118), mm(20.6));
  ctx.fillStyle = "#4a4a4a";
  ctx.font = `italic ${mm(2.5)}px ${font}`;
  ctx.fillText(
    "Schrijf in elk vak één teken, rustend op de blauwe stippellijn; hoofdletters reiken tot de bovenste hulplijn. Gebruik een zwarte of donkerblauwe pen.",
    mm(105),
    mm(25.9),
  );
  ctx.fillText(
    "Fotografeer het blad recht van boven met alle vier de zwarte hoekvierkanten in beeld (of scan het) en upload het op Schrijfsite.",
    mm(105),
    mm(29),
  );

  // Vakken met hulplijnen.
  sheet.chars.forEach((ch, i) => {
    const r = cellRect(i);
    ctx.strokeStyle = "#cbcbcb";
    ctx.lineWidth = mm(0.2);
    ctx.setLineDash([]);
    ctx.strokeRect(mm(r.x), mm(r.y), mm(r.w), mm(r.h));

    const guide = (y: number, color: string, width: number, dash: number[]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = mm(width);
      ctx.setLineDash(dash.map(mm));
      ctx.beginPath();
      ctx.moveTo(mm(r.x + 1.4), mm(r.y + y));
      ctx.lineTo(mm(r.x + r.w - 1.4), mm(r.y + y));
      ctx.stroke();
    };
    guide(CELL.capY, "#d6ecfb", 0.25, [0.6, 0.9]);
    guide(CELL.xY, "#dbeefb", 0.2, [0.3, 0.9]);
    guide(CELL.baseY, "#c3e2f8", 0.4, [1.2, 0.8]);
    ctx.setLineDash([]);

    ctx.fillStyle = "#c4c4c4";
    ctx.textAlign = "left";
    ctx.font = `${mm(CELL.label.size)}px ${font}`;
    ctx.fillText(ch, mm(r.x + CELL.label.x), mm(r.y + CELL.label.y));
  });

  ctx.fillStyle = "#6a6a6a";
  ctx.textAlign = "center";
  ctx.font = `${mm(2.4)}px ${font}`;
  ctx.fillText(
    `Afdrukken op A4, ware grootte (100%) · ${sheet.name} · schrijfsite`,
    mm(105),
    mm(282),
  );
  ctx.restore();
}

export function renderTemplateCanvas(sheet: SheetDef, dpi = 200): HTMLCanvasElement {
  const ppm = dpi / 25.4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE.w * ppm);
  canvas.height = Math.round(PAGE.h * ppm);
  const ctx = canvas.getContext("2d")!;
  drawTemplate(ctx, sheet, ppm);
  return canvas;
}
