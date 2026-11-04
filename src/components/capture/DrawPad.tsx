"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCENTS, DIGITS, LOWER, PUNCT, UPPER } from "@/lib/hw/charset";
import { PAD, paintStrokes, strokesToGlyph, type Stroke } from "@/lib/hw/draw";
import type { RawGlyph } from "@/lib/hw/types";
import { cssFontFamily } from "@/lib/fonts-client";

const SEQUENCE = [...LOWER, ...UPPER, ...DIGITS, ...PUNCT, ...ACCENTS];

export function DrawPad({ onGlyphs, active }: { onGlyphs: (g: RawGlyph[]) => void; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null);
  const frame = useRef<number | null>(null);
  const [strokes, setStrokes] = useState<Record<string, Stroke[]>>({});
  const [index, setIndex] = useState(0);
  const [pen, setPen] = useState(7);
  const [sent, setSent] = useState<string | null>(null);
  const ch = SEQUENCE[index];

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const size = Math.max(100, Math.round(c.clientWidth * dpr));
    if (c.width !== size) {
      c.width = size;
      c.height = size;
    }
    const ctx = c.getContext("2d")!;
    const s = c.width / PAD.w;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    const line = (y: number, color: string, w: number, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w * s;
      ctx.setLineDash(dash.map((d) => d * s));
      ctx.beginPath();
      ctx.moveTo(8 * s, y * s);
      ctx.lineTo((PAD.w - 8) * s, y * s);
      ctx.stroke();
    };
    line(PAD.capY, "#cfe3f5", 1, [6, 5]);
    line(PAD.xY, "#d9eaf8", 1, [2, 5]);
    line(PAD.baseY, "#8fbfe8", 1.6);
    line(PAD.descY, "#e3eef8", 1, [6, 5]);
    ctx.setLineDash([]);
    // Spookletter als geheugensteun.
    ctx.fillStyle = "rgba(0,0,0,0.055)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `${190 * s}px ${cssFontFamily("--font-body", "serif")}`;
    ctx.fillText(ch, (PAD.w / 2) * s, PAD.baseY * s);
    const list = [...(strokes[ch] ?? []), ...(current.current ? [current.current] : [])];
    paintStrokes(ctx, list, s, pen, "#1b1b1b");
  }, [strokes, ch, pen]);

  useEffect(() => {
    redraw();
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  useEffect(() => {
    if (active) redraw();
  }, [active, redraw]);

  const schedule = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      redraw();
    });
  };

  const toPad = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * PAD.w,
      y: ((e.clientY - r.top) / r.height) * PAD.h,
      p: e.pointerType === "pen" ? Math.max(0.1, e.pressure || 0.5) : 0.5,
    };
  };

  const finishStroke = () => {
    const s = current.current;
    current.current = null;
    if (s && s.length) setStrokes((prev) => ({ ...prev, [ch]: [...(prev[ch] ?? []), s] }));
  };

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + SEQUENCE.length) % SEQUENCE.length), []);
  const undo = useCallback(() => setStrokes((prev) => ({ ...prev, [ch]: (prev[ch] ?? []).slice(0, -1) })), [ch]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go, undo]);

  const doneChars = SEQUENCE.filter((c) => (strokes[c] ?? []).length > 0);

  function send() {
    const glyphs: RawGlyph[] = [];
    for (const c of doneChars) {
      const g = strokesToGlyph(strokes[c], c, pen);
      if (g) glyphs.push(g);
    }
    if (!glyphs.length) return;
    onGlyphs(glyphs);
    setStrokes({});
    setIndex(0);
    setSent(`${glyphs.length} getekende tekens staan nu in de controlelijst hieronder.`);
  }

  return (
    <div className="drawpad-wrap">
      <div>
        <canvas
          ref={canvasRef}
          className="drawpad"
          aria-label={`Tekenvlak voor het teken ${ch}`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            current.current = [toPad(e)];
            schedule();
          }}
          onPointerMove={(e) => {
            if (!current.current) return;
            const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            for (const ev of evs) current.current.push(toPad(ev));
            schedule();
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        <div className="btn-row" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(-1)}>
            ← Vorige
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={undo} disabled={!(strokes[ch] ?? []).length}>
            Ongedaan
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStrokes((p) => ({ ...p, [ch]: [] }))}>
            Wissen
          </button>
          <button type="button" className="btn btn--sm" onClick={() => go(1)}>
            Volgende →
          </button>
        </div>
      </div>
      <div>
        <p style={{ marginTop: 0 }}>
          Teken het teken <strong style={{ fontFamily: "var(--display)", fontSize: 40, lineHeight: 1, padding: "0 6px" }}>{ch}</strong>
          met de muis, uw vinger of een stylus. Laat het rusten op de <span style={{ color: "#4d8fd0" }}>blauwe lijn</span>;
          hoofdletters reiken tot de bovenste stippellijn.
        </p>
        <div className="range-row" style={{ maxWidth: 320 }}>
          <label htmlFor="pen">Pendikte</label>
          <output htmlFor="pen">{pen}</output>
          <input id="pen" type="range" min={3} max={14} step={0.5} value={pen} onChange={(e) => setPen(Number(e.target.value))} />
        </div>
        <p className="field-label" style={{ margin: "8px 0" }}>
          Tekens ({doneChars.length}/{SEQUENCE.length})
        </p>
        <div className="char-pick">
          {SEQUENCE.map((c, i) => (
            <button
              key={c + i}
              type="button"
              className={(strokes[c] ?? []).length ? "done" : ""}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              title={`Teken ${c}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn--red" onClick={send} disabled={!doneChars.length}>
            Naar de controle ({doneChars.length})
          </button>
        </div>
        {sent ? <p className="alert alert--ok">{sent}</p> : null}
        <p className="hint">Sneltoetsen: ← → wisselen van teken, Ctrl+Z ongedaan maken.</p>
      </div>
    </div>
  );
}
