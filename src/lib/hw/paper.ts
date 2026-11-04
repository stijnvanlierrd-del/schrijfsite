import { mulberry32 } from "./random";

export type PaperId =
  | "gelinieerd"
  | "blanco"
  | "ruitjes5"
  | "ruitjes10"
  | "stippen"
  | "collegeblok"
  | "geel"
  | "schrijflijnen"
  | "oud"
  | "kraft"
  | "schoolbord"
  | "transparant";

export type PageSizeId = "A4" | "A5" | "Letter";
export const PAGE_SIZES: Record<PageSizeId, { name: string; w: number; h: number }> = {
  A4: { name: "A4", w: 210, h: 297 },
  A5: { name: "A5", w: 148, h: 210 },
  Letter: { name: "US Letter", w: 215.9, h: 279.4 },
};

export interface PaperLayoutInput {
  lineSpacingMm: number;
  marginMm: number;
  capMm: number;
  lineSkip: number;
}

export interface PaperLayout {
  left: number;
  right: number;
  baselines: number[];
  /** Hoogte van de x-band (schrijflijnen): de grootte volgt dan het papier. */
  xBandMm?: number;
}

export interface PaperDef {
  id: PaperId;
  name: string;
  note: string;
  defaultInk: string;
  /** Hoe inkt op het papier valt: 'multiply' laat textuur doorschemeren. */
  blend: GlobalCompositeOperation;
  ruled: boolean;
  /** Achtergrondkleur voor PDF/JPEG (transparant wordt wit). */
  base: string | null;
  layout(page: { w: number; h: number }, o: PaperLayoutInput): PaperLayout;
  draw(ctx: CanvasRenderingContext2D, page: { w: number; h: number }, ppm: number, seed: number): void;
}

function freeLayout(page: { w: number; h: number }, o: PaperLayoutInput, top = 0): PaperLayout {
  const baselines: number[] = [];
  const spacing = Math.max(o.capMm * 1.15, o.lineSpacingMm);
  for (let y = Math.max(o.marginMm, top) + o.capMm * 1.25; y <= page.h - o.marginMm * 0.8; y += spacing) baselines.push(y);
  return { left: o.marginMm, right: page.w - o.marginMm, baselines };
}

function ruledLines(first: number, pitch: number, bottom: number): number[] {
  const lines: number[] = [];
  for (let y = first; y <= bottom + 1e-6; y += pitch) lines.push(y);
  return lines;
}

function hline(ctx: CanvasRenderingContext2D, ppm: number, y: number, x0: number, x1: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * ppm);
  ctx.beginPath();
  ctx.moveTo(x0 * ppm, y * ppm);
  ctx.lineTo(x1 * ppm, y * ppm);
  ctx.stroke();
}

function vline(ctx: CanvasRenderingContext2D, ppm: number, x: number, y0: number, y1: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * ppm);
  ctx.beginPath();
  ctx.moveTo(x * ppm, y0 * ppm);
  ctx.lineTo(x * ppm, y1 * ppm);
  ctx.stroke();
}

function fill(ctx: CanvasRenderingContext2D, page: { w: number; h: number }, ppm: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, Math.ceil(page.w * ppm), Math.ceil(page.h * ppm));
}

/** Fijne korrel over het hele vel (deterministisch). */
function grain(ctx: CanvasRenderingContext2D, page: { w: number; h: number }, ppm: number, seed: number, dark: string, light: string, density: number) {
  const rng = mulberry32(seed);
  const n = Math.round(page.w * page.h * density);
  const size = Math.max(1, ppm * 0.18);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rng() < 0.5 ? dark : light;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    ctx.fillRect(rng() * page.w * ppm, rng() * page.h * ppm, size, size);
  }
  ctx.globalAlpha = 1;
}

function blotches(ctx: CanvasRenderingContext2D, page: { w: number; h: number }, ppm: number, seed: number, rgb: string, count: number, maxAlpha: number) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * page.w * ppm;
    const y = rng() * page.h * ppm;
    const r = (10 + rng() * 60) * ppm;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${(rng() * maxAlpha).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function vignette(ctx: CanvasRenderingContext2D, page: { w: number; h: number }, ppm: number, rgb: string, alpha: number) {
  const W = page.w * ppm;
  const H = page.h * ppm;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const LINED_PITCH = 8;

export const PAPERS: PaperDef[] = [
  {
    id: "gelinieerd",
    name: "Gelinieerd",
    note: "Wit met blauwe lijnen (8 mm) en rode kantlijn",
    defaultInk: "#1f3a93",
    blend: "multiply",
    ruled: true,
    base: "#fdfdfb",
    layout(page, o) {
      const lines = ruledLines(24, LINED_PITCH, page.h - 10);
      return { left: 27.5, right: page.w - 10, baselines: lines.filter((_, i) => i % o.lineSkip === 0) };
    },
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#fdfdfb");
      for (const y of ruledLines(24, LINED_PITCH, page.h - 10)) hline(ctx, ppm, y, 0, page.w, "#a9c6e4", 0.22);
      vline(ctx, ppm, 25, 0, page.h, "#e58f8f", 0.3);
    },
  },
  {
    id: "blanco",
    name: "Blanco wit",
    note: "Volledig wit, zonder lijnen",
    defaultInk: "#1f3a93",
    blend: "multiply",
    ruled: false,
    base: "#ffffff",
    layout: (page, o) => freeLayout(page, o),
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#ffffff");
    },
  },
  {
    id: "ruitjes5",
    name: "Ruitjes 5 mm",
    note: "Klassiek ruitjespapier",
    defaultInk: "#1f3a93",
    blend: "multiply",
    ruled: true,
    base: "#fefefe",
    layout(page, o) {
      const cell = 5;
      const step = Math.max(cell, Math.round(o.lineSpacingMm / cell) * cell) * o.lineSkip;
      const first = Math.ceil((o.marginMm + o.capMm * 1.1) / cell) * cell;
      return { left: Math.ceil(o.marginMm / cell) * cell + 1, right: page.w - o.marginMm, baselines: ruledLines(first, step, page.h - o.marginMm) };
    },
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#fefefe");
      for (let y = 5; y < page.h; y += 5) hline(ctx, ppm, y, 0, page.w, "#c9d8ea", 0.14);
      for (let x = 5; x < page.w; x += 5) vline(ctx, ppm, x, 0, page.h, "#c9d8ea", 0.14);
    },
  },
  {
    id: "ruitjes10",
    name: "Ruitjes 1 cm",
    note: "Grote ruiten, zoals een rekenschrift",
    defaultInk: "#1b1b1b",
    blend: "multiply",
    ruled: true,
    base: "#fefefe",
    layout(page, o) {
      const cell = 10;
      const step = Math.max(cell, Math.round(o.lineSpacingMm / cell) * cell) * o.lineSkip;
      const first = Math.ceil((o.marginMm + o.capMm * 1.1) / cell) * cell;
      return { left: Math.ceil(o.marginMm / cell) * cell + 1.5, right: page.w - o.marginMm, baselines: ruledLines(first, step, page.h - o.marginMm) };
    },
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#fefefe");
      for (let y = 10; y < page.h; y += 10) hline(ctx, ppm, y, 0, page.w, "#b7cde6", 0.2);
      for (let x = 10; x < page.w; x += 10) vline(ctx, ppm, x, 0, page.h, "#b7cde6", 0.2);
    },
  },
  {
    id: "stippen",
    name: "Stippen",
    note: "Puntraster van 5 mm (bullet journal)",
    defaultInk: "#1b1b1b",
    blend: "multiply",
    ruled: true,
    base: "#fffefb",
    layout(page, o) {
      const cell = 5;
      const step = Math.max(cell, Math.round(o.lineSpacingMm / cell) * cell) * o.lineSkip;
      const first = Math.ceil((o.marginMm + o.capMm * 1.1) / cell) * cell;
      return { left: Math.ceil(o.marginMm / cell) * cell, right: page.w - o.marginMm, baselines: ruledLines(first, step, page.h - o.marginMm) };
    },
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#fffefb");
      ctx.fillStyle = "#b4b4b4";
      const r = Math.max(0.8, 0.24 * ppm);
      for (let y = 5; y < page.h; y += 5) {
        for (let x = 5; x < page.w; x += 5) {
          ctx.beginPath();
          ctx.arc(x * ppm, y * ppm, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  {
    id: "collegeblok",
    name: "Collegeblok",
    note: "Gelinieerd met 23-gaats perforatie",
    defaultInk: "#1f3a93",
    blend: "multiply",
    ruled: true,
    base: "#fdfdfc",
    layout(page, o) {
      const lines = ruledLines(26, LINED_PITCH, page.h - 10);
      return { left: 23, right: page.w - 9, baselines: lines.filter((_, i) => i % o.lineSkip === 0) };
    },
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#fdfdfc");
      hline(ctx, ppm, 14, 18, page.w - 8, "#9db8d6", 0.35);
      hline(ctx, ppm, 15.2, 18, page.w - 8, "#9db8d6", 0.18);
      for (const y of ruledLines(26, LINED_PITCH, page.h - 10)) hline(ctx, ppm, y, 18, page.w - 8, "#adc5df", 0.2);
      vline(ctx, ppm, 20, 14, page.h - 8, "#e7a0a0", 0.25);
      // Perforatie: gaten met een lichte schaduwrand.
      const count = Math.max(4, Math.round((page.h - 30) / 9.5) + 1);
      const span = (count - 1) * 9.5;
      const y0 = (page.h - span) / 2;
      for (let i = 0; i < count; i++) {
        const cx = 8 * ppm;
        const cy = (y0 + i * 9.5) * ppm;
        const r = 2.5 * ppm;
        ctx.fillStyle = "#d8d8d4";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#bdbdb8";
        ctx.lineWidth = Math.max(1, 0.25 * ppm);
        ctx.stroke();
      }
    },
  },
  {
    id: "geel",
    name: "Geel notitieblok",
    note: "Kanariegeel met blauwe lijnen en dubbele kantlijn",
    defaultInk: "#1b1b1b",
    blend: "multiply",
    ruled: true,
    base: "#fcf4ad",
    layout(page, o) {
      const lines = ruledLines(36, 8.7, page.h - 10);
      return { left: 36.5, right: page.w - 9, baselines: lines.filter((_, i) => i % o.lineSkip === 0) };
    },
    draw(ctx, page, ppm, seed) {
      fill(ctx, page, ppm, "#fcf4ad");
      grain(ctx, page, ppm, seed, "#b9a640", "#ffffff", 0.35);
      hline(ctx, ppm, 25, 0, page.w, "#8fb0d6", 0.45);
      hline(ctx, ppm, 26.4, 0, page.w, "#8fb0d6", 0.2);
      for (const y of ruledLines(36, 8.7, page.h - 10)) hline(ctx, ppm, y, 0, page.w, "#93b4da", 0.22);
      vline(ctx, ppm, 31.8, 0, page.h, "#dc6a62", 0.25);
      vline(ctx, ppm, 33.4, 0, page.h, "#dc6a62", 0.25);
    },
  },
  {
    id: "schrijflijnen",
    name: "Schrijflijnen",
    note: "Basisschoollijnen met x-band; grootte volgt de lijnen",
    defaultInk: "#1b1b1b",
    blend: "multiply",
    ruled: true,
    base: "#ffffff",
    layout(page, o) {
      const pitch = 16 * o.lineSkip;
      const baselines: number[] = [];
      for (let top = 18; top + 12 <= page.h - 8; top += pitch) baselines.push(top + 8);
      return { left: 16, right: page.w - 12, baselines, xBandMm: 4 };
    },
    draw(ctx, page, ppm) {
      fill(ctx, page, ppm, "#ffffff");
      for (let top = 18; top + 12 <= page.h - 8; top += 16) {
        ctx.fillStyle = "rgba(160, 200, 238, 0.16)";
        ctx.fillRect(0, (top + 4) * ppm, page.w * ppm, 4 * ppm);
        hline(ctx, ppm, top, 0, page.w, "#c6d9ed", 0.15);
        ctx.setLineDash([1.5 * ppm, 1.2 * ppm]);
        hline(ctx, ppm, top + 4, 0, page.w, "#9fc2e4", 0.2);
        ctx.setLineDash([]);
        hline(ctx, ppm, top + 8, 0, page.w, "#6f9fd2", 0.3);
        hline(ctx, ppm, top + 12, 0, page.w, "#c6d9ed", 0.15);
      }
      vline(ctx, ppm, 12, 0, page.h, "#eaa3a3", 0.25);
    },
  },
  {
    id: "oud",
    name: "Oud papier",
    note: "Vergeeld perkament met vlekjes en rand",
    defaultInk: "#2e1f10",
    blend: "multiply",
    ruled: false,
    base: "#efe2c3",
    layout: (page, o) => freeLayout(page, o),
    draw(ctx, page, ppm, seed) {
      fill(ctx, page, ppm, "#efe2c3");
      blotches(ctx, page, ppm, seed, "176, 128, 62", 26, 0.16);
      blotches(ctx, page, ppm, seed + 7, "255, 250, 235", 14, 0.35);
      grain(ctx, page, ppm, seed + 3, "#7a5a2c", "#fffaf0", 1.2);
      const rng = mulberry32(seed + 11);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(140, 92, 40, ${0.08 + rng() * 0.18})`;
        ctx.beginPath();
        ctx.arc(rng() * page.w * ppm, rng() * page.h * ppm, (0.2 + rng() * 0.9) * ppm, 0, Math.PI * 2);
        ctx.fill();
      }
      vignette(ctx, page, ppm, "120, 78, 30", 0.38);
    },
  },
  {
    id: "kraft",
    name: "Kraftpapier",
    note: "Bruin pakpapier met vezels",
    defaultInk: "#1a1a1a",
    blend: "multiply",
    ruled: false,
    base: "#c7a173",
    layout: (page, o) => freeLayout(page, o),
    draw(ctx, page, ppm, seed) {
      fill(ctx, page, ppm, "#c7a173");
      blotches(ctx, page, ppm, seed, "120, 82, 40", 20, 0.12);
      const rng = mulberry32(seed + 5);
      const n = Math.round(page.w * page.h * 0.12);
      ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const x = rng() * page.w * ppm;
        const y = rng() * page.h * ppm;
        const len = (0.6 + rng() * 2.4) * ppm;
        const a = rng() * Math.PI;
        ctx.strokeStyle = rng() < 0.5 ? `rgba(95, 62, 28, ${0.08 + rng() * 0.14})` : `rgba(235, 205, 160, ${0.1 + rng() * 0.16})`;
        ctx.lineWidth = Math.max(0.6, 0.12 * ppm);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      grain(ctx, page, ppm, seed + 9, "#5c3c18", "#e8cfa5", 0.8);
    },
  },
  {
    id: "schoolbord",
    name: "Schoolbord",
    note: "Donker bord met krijt-inkt",
    defaultInk: "#f2f0e6",
    blend: "source-over",
    ruled: false,
    base: "#27322b",
    layout: (page, o) => freeLayout(page, o),
    draw(ctx, page, ppm, seed) {
      fill(ctx, page, ppm, "#27322b");
      blotches(ctx, page, ppm, seed, "230, 235, 225", 30, 0.07);
      grain(ctx, page, ppm, seed + 2, "#101511", "#c8d0c4", 0.9);
      vignette(ctx, page, ppm, "8, 10, 8", 0.45);
    },
  },
  {
    id: "transparant",
    name: "Transparant",
    note: "Alleen de inkt (PNG met doorzichtige achtergrond)",
    defaultInk: "#1b1b1b",
    blend: "source-over",
    ruled: false,
    base: null,
    layout: (page, o) => freeLayout(page, o),
    draw() {
      /* niets: doorzichtig */
    },
  },
];

export function paperById(id: string): PaperDef {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0];
}

export interface InkPreset {
  id: string;
  name: string;
  color: string;
  kind: "pen" | "potlood" | "krijt" | "stift";
}

export const INKS: InkPreset[] = [
  { id: "blauw", name: "Balpen blauw", color: "#1f3a93", kind: "pen" },
  { id: "zwart", name: "Zwart", color: "#1b1b1b", kind: "pen" },
  { id: "vulpen", name: "Vulpen", color: "#22306b", kind: "pen" },
  { id: "rood", name: "Rood", color: "#b0291f", kind: "pen" },
  { id: "groen", name: "Groen", color: "#1d6a44", kind: "pen" },
  { id: "sepia", name: "Sepia", color: "#5a3a1b", kind: "pen" },
  { id: "potlood", name: "Potlood", color: "#4a4a4a", kind: "potlood" },
  { id: "stift", name: "Stift", color: "#111111", kind: "stift" },
  { id: "krijt", name: "Krijt", color: "#f2f0e6", kind: "krijt" },
];
