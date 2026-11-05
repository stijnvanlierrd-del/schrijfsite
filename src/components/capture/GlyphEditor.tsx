"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CAP_PX, type GlyphSource, type RawGlyph } from "@/lib/hw/types";

/** Werkvlak in genormaliseerde eenheden (100 px = hoogte van een hoofdletter). */
const W = 400;
const H = 400;
const BASE_Y = 255;
const CAP_Y = BASE_Y - CAP_PX;
const X_Y = BASE_Y - CAP_PX * 0.6;
const DESC_Y = BASE_Y + CAP_PX * 0.42;

type Tool = "gum" | "pen" | "schuif";

export interface EditorInput {
  ch: string;
  /** Inkt (zwart + alfa) op ware grootte. */
  image: CanvasImageSource;
  width: number;
  height: number;
  baseline: number;
  source: GlyphSource;
}

interface View {
  angle: number;
  dx: number;
  dy: number;
  scale: number;
}
interface Snapshot extends View {
  ink: ImageData;
}

const NO_VIEW: View = { angle: 0, dx: 0, dy: 0, scale: 1 };

/**
 * Bewerkvenster voor één teken: draaien (90°-stappen en fijn), gummen, bijtekenen,
 * verschuiven/schalen ten opzichte van de schrijflijn en het teken hernoemen.
 */
export function GlyphEditor({
  input,
  onCancel,
  onSave,
  saving = false,
}: {
  input: EditorInput;
  onCancel: () => void;
  onSave: (glyph: RawGlyph) => void | Promise<void>;
  saving?: boolean;
}) {
  const screen = useRef<HTMLCanvasElement>(null);
  const ink = useRef<HTMLCanvasElement | null>(null);
  const pivot = useRef({ x: W / 2, y: BASE_Y - CAP_PX / 2 });
  const history = useRef<Snapshot[]>([]);
  const drawing = useRef<{ last: { x: number; y: number }; mode: Tool; start: View & { px: number; py: number } } | null>(null);
  const [view, setView] = useState<View>(NO_VIEW);
  const [tool, setTool] = useState<Tool>("gum");
  const [size, setSize] = useState(14);
  const [ch, setCh] = useState(input.ch);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  // Alleen de invoer bij het openen telt; een nieuwe invoer = nieuw venster (via `key`).
  const original = useRef(input);

  // Werkcanvas vullen met het teken, met de schrijflijn op BASE_Y.
  const init = useCallback(() => {
    const input = original.current;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const fit = Math.min(1, (W - 20) / input.width, (H - 20) / input.height);
    const w = input.width * fit;
    const h = input.height * fit;
    const x = (W - w) / 2;
    let y = BASE_Y - input.baseline * fit;
    y = Math.max(4, Math.min(H - h - 4, y));
    ctx.drawImage(input.image, x, y, w, h);
    ink.current = c;
    pivot.current = { x: x + w / 2, y: y + h / 2 };
    history.current = [];
    setCanUndo(false);
    setView(NO_VIEW);
    setTick((t) => t + 1);
  }, []);

  useEffect(init, [init]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyView = (ctx: CanvasRenderingContext2D, v: View) => {
    const p = pivot.current;
    ctx.translate(p.x + v.dx, p.y + v.dy);
    ctx.rotate((v.angle * Math.PI) / 180);
    ctx.scale(v.scale, v.scale);
    ctx.translate(-p.x, -p.y);
  };

  // Scherm tekenen: hulplijnen + inkt met de huidige draaiing/verschuiving.
  useEffect(() => {
    const c = screen.current;
    if (!c || !ink.current) return;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    const line = (y: number, color: string, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
      ctx.stroke();
    };
    line(CAP_Y, "#d9d6cf", [4, 4]);
    line(X_Y, "#e6e3dc", [2, 4]);
    line(DESC_Y, "#e6e3dc", [2, 4]);
    line(BASE_Y, "#5b8fc4");
    ctx.setLineDash([]);
    ctx.fillStyle = "#9b9b96";
    ctx.font = "11px sans-serif";
    ctx.fillText("hoofdletter", 6, CAP_Y - 4);
    ctx.fillText("schrijflijn", 6, BASE_Y - 4);
    ctx.save();
    applyView(ctx, view);
    ctx.drawImage(ink.current, 0, 0);
    ctx.restore();
    if (cursor && tool !== "schuif") {
      ctx.strokeStyle = tool === "gum" ? "#b0291f" : "#232323";
      ctx.lineWidth = 1;
      ctx.setLineDash(tool === "gum" ? [3, 3] : []);
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [view, cursor, tool, size, tick]);

  const snapshot = () => {
    const c = ink.current;
    if (!c) return;
    history.current.push({ ink: c.getContext("2d")!.getImageData(0, 0, W, H), ...view });
    if (history.current.length > 40) history.current.shift();
    setCanUndo(true);
  };

  function undo() {
    const s = history.current.pop();
    if (!s || !ink.current) return;
    ink.current.getContext("2d")!.putImageData(s.ink, 0, 0);
    setView({ angle: s.angle, dx: s.dx, dy: s.dy, scale: s.scale });
    setCanUndo(history.current.length > 0);
    setTick((t) => t + 1);
  }

  const changeView = (patch: Partial<View>, record = true) => {
    if (record) snapshot();
    setView((v) => ({ ...v, ...patch }));
  };

  const toCanvas = (e: React.PointerEvent) => {
    const r = screen.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  /** Scherm → inktcoördinaten (inverse van de weergave). */
  const toInk = (p: { x: number; y: number }) => {
    const pv = pivot.current;
    const a = (-view.angle * Math.PI) / 180;
    const x = (p.x - pv.x - view.dx) / view.scale;
    const y = (p.y - pv.y - view.dy) / view.scale;
    return { x: pv.x + x * Math.cos(a) - y * Math.sin(a), y: pv.y + x * Math.sin(a) + y * Math.cos(a) };
  };

  const paint = (from: { x: number; y: number }, to: { x: number; y: number }, mode: Tool) => {
    const ctx = ink.current!.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = mode === "gum" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size / view.scale;
    const a = toInk(from);
    const b = toInk(to);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, size / view.scale / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    setTick((t) => t + 1);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    snapshot();
    drawing.current = { last: p, mode: tool, start: { ...view, px: p.x, py: p.y } };
    if (tool !== "schuif") paint(p, p, tool);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e);
    setCursor(p);
    const d = drawing.current;
    if (!d) return;
    if (d.mode === "schuif") {
      setView((v) => ({ ...v, dx: d.start.dx + p.x - d.start.px, dy: d.start.dy + p.y - d.start.py }));
    } else {
      paint(d.last, p, d.mode);
    }
    d.last = p;
  };
  const onUp = () => {
    drawing.current = null;
  };

  /** Huidige weergave omzetten in een bijgesneden glyph met basislijn. */
  const render = (): RawGlyph | null => {
    if (!ink.current) return null;
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d", { willReadFrequently: true })!;
    applyView(ctx, view);
    ctx.drawImage(ink.current, 0, 0);
    const data = ctx.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (data[(y * W + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    if (maxX < 0) return null;
    const x0 = Math.max(0, minX - 2);
    const y0 = Math.max(0, minY - 2);
    const gw = Math.min(W - 1, maxX + 2) - x0 + 1;
    const gh = Math.min(H - 1, maxY + 2) - y0 + 1;
    const alpha = new Uint8ClampedArray(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) alpha[y * gw + x] = data[((y + y0) * W + x + x0) * 4 + 3];
    return { ch, width: gw, height: gh, baseline: BASE_Y - y0, alpha, source: input.source };
  };

  /** Zet de onderkant van de inkt op de schrijflijn (voor letters zonder staart). */
  const snapToLine = () => {
    const g = render();
    if (!g) return;
    const bottom = BASE_Y - g.baseline + g.height - 2; // onderste inktpixel in schermcoördinaten
    changeView({ dy: view.dy + (BASE_Y - bottom) });
  };

  /** Maakt de letter even hoog als een hoofdletter (of x-hoogte bij kleine letters). */
  const fitHeight = () => {
    const g = render();
    if (!g) return;
    const inkH = g.height - 4;
    if (inkH < 4) return;
    const small = /^[acemnorsuvwxz]$/.test(ch);
    const target = small ? CAP_PX * 0.6 : CAP_PX;
    changeView({ scale: Math.max(0.2, Math.min(4, view.scale * (target / inkH))) });
  };

  const clearAll = () => {
    snapshot();
    ink.current!.getContext("2d")!.clearRect(0, 0, W, H);
    setTick((t) => t + 1);
  };

  const rotateBy = (deg: number) => changeView({ angle: ((((view.angle + deg) % 360) + 540) % 360) - 180 });
  const valid = [...ch].length === 1 && !/\s/.test(ch);

  async function save() {
    const g = render();
    if (!g || !valid) return;
    await onSave({ ...g, ch: ch.normalize("NFC") });
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ge-title" tabIndex={-1} ref={dialog}>
        <header className="modal-head">
          <span className="kicker">Teken bewerken</span>
          <h2 id="ge-title">
            Letter
            <input
              className="ge-char"
              value={ch}
              aria-label="Welk teken is dit?"
              onChange={(e) => setCh([...e.target.value.normalize("NFC")].slice(-1).join(""))}
            />
          </h2>
          <button type="button" className="modal-x" aria-label="Sluiten" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="ge-body">
          <div className="ge-stage">
            <canvas
              ref={screen}
              width={W}
              height={H}
              className={`ge-canvas ge-canvas--${tool}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setCursor(null)}
              aria-label="Teken; sleep om te gummen, te tekenen of te verschuiven"
            />
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              De blauwe lijn is de schrijflijn. Letters als g, j, p, q en y hangen eronder.
            </p>
          </div>
          <div className="ge-tools">
            <div className="ge-group">
              <span className="ge-label">Draaien</span>
              <div className="btn-row">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => rotateBy(-90)} title="90° linksom">
                  ↺ 90°
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => rotateBy(90)} title="90° rechtsom">
                  ↻ 90°
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => rotateBy(180)} title="Op zijn kop">
                  180°
                </button>
              </div>
              <div className="range-row" style={{ marginTop: 8 }}>
                <label htmlFor="ge-angle">Fijn</label>
                <output htmlFor="ge-angle">{Math.round(view.angle)}°</output>
                <input
                  id="ge-angle"
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={Math.round(view.angle)}
                  onPointerDown={snapshot}
                  onKeyDown={snapshot}
                  onChange={(e) => changeView({ angle: Number(e.target.value) }, false)}
                />
              </div>
            </div>

            <div className="ge-group">
              <span className="ge-label">Gereedschap</span>
              <div className="ge-seg" role="radiogroup" aria-label="Gereedschap">
                {(
                  [
                    ["gum", "Gum", "Inkt wegvegen"],
                    ["pen", "Pen", "Inkt bijtekenen"],
                    ["schuif", "Verschuif", "Letter verplaatsen"],
                  ] as const
                ).map(([id, label, title]) => (
                  <button key={id} type="button" role="radio" aria-checked={tool === id} title={title} onClick={() => setTool(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {tool !== "schuif" ? (
                <div className="range-row" style={{ marginTop: 8 }}>
                  <label htmlFor="ge-size">Dikte</label>
                  <output htmlFor="ge-size">{size}</output>
                  <input id="ge-size" type="range" min={2} max={48} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))} />
                </div>
              ) : null}
            </div>

            <div className="ge-group">
              <span className="ge-label">Grootte en plaats</span>
              <div className="range-row">
                <label htmlFor="ge-scale">Grootte</label>
                <output htmlFor="ge-scale">{Math.round(view.scale * 100)}%</output>
                <input
                  id="ge-scale"
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.01}
                  value={view.scale}
                  onPointerDown={snapshot}
                  onKeyDown={snapshot}
                  onChange={(e) => changeView({ scale: Number(e.target.value) }, false)}
                />
              </div>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => changeView({ dy: view.dy - 3 })} title="Omhoog">
                  ↑
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => changeView({ dy: view.dy + 3 })} title="Omlaag">
                  ↓
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={snapToLine}>
                  Op de lijn
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={fitHeight}>
                  Standaardhoogte
                </button>
              </div>
            </div>

            <div className="ge-group">
              <div className="btn-row">
                <button type="button" className="btn btn--ghost btn--sm" onClick={undo} disabled={!canUndo}>
                  Ongedaan maken
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={init}>
                  Begin opnieuw
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={clearAll}>
                  Alles wissen
                </button>
              </div>
            </div>
          </div>
        </div>
        <footer className="modal-foot">
          {!valid ? <span className="small" style={{ color: "var(--red)" }}>Vul één teken in.</span> : null}
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Annuleren
          </button>
          <button type="button" className="btn btn--red" onClick={save} disabled={!valid || saving}>
            {saving ? <span className="spinner" /> : null} Toepassen
          </button>
        </footer>
      </div>
    </div>
  );
}
