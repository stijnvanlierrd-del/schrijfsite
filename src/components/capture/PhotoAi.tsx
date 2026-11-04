"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { loadPhoto } from "@/lib/hw/browser";
import { extractPhotoGlyphs, type AiChar } from "@/lib/hw/photo";
import type { Gray } from "@/lib/hw/imageproc";
import type { RawGlyph } from "@/lib/hw/types";
import { Dropzone } from "./Dropzone";

export function PhotoAi({ onGlyphs }: { onGlyphs: (g: RawGlyph[]) => void }) {
  const gray = useRef<Gray | null>(null);
  const aiJpeg = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<AiChar[]>([]);
  const [report, setReport] = useState<string | null>(null);

  async function onFiles(files: File[]) {
    setError(null);
    setReport(null);
    setBoxes([]);
    setBusy("Foto inlezen…");
    try {
      const p = await loadPhoto(files[0], 3000);
      gray.current = p.gray;
      aiJpeg.current = p.aiJpeg;
      setPreview(p.preview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function analyse() {
    if (!gray.current || !aiJpeg.current) return;
    setError(null);
    setReport(null);
    setBusy("De AI zoekt elke letter op de foto… (± 15 seconden)");
    try {
      const res = await api<{ characters: AiChar[]; model: string }>("/api/ai/segment", { body: { image: aiJpeg.current, hint } });
      if (!res.characters.length) throw new Error("De AI vond geen handgeschreven tekens. Probeer een scherpere foto.");
      setBusy("Letters uitknippen en rechtzetten…");
      await new Promise((r) => setTimeout(r, 20));
      const out = extractPhotoGlyphs(gray.current, res.characters);
      setBoxes(res.characters);
      onGlyphs(out.glyphs);
      setReport(
        `${out.glyphs.length} tekens herkend en uitgeknipt${out.failed.length ? `; niet gelukt: ${out.failed.join(" ")}` : ""}.` +
          (out.small ? " Let op: de letters zijn klein op de foto — fotografeer dichterbij voor een scherper resultaat." : ""),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cols-2">
      <div>
        <p style={{ marginTop: 0 }}>
          Schrijf op een gewoon (liefst blanco) vel het alfabet, de cijfers en wat leestekens — met wat ruimte tussen de letters.
          De AI zoekt elke letter op en benoemt hem; daarna worden ze rechtgezet en op de schrijflijn gezet.
        </p>
        <Dropzone accept="image/*" onFiles={onFiles} disabled={busy !== null} label="Kies of sleep een foto van uw handschrift" />
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="hint">Wat heeft u opgeschreven? (aanbevolen)</label>
          <textarea
            id="hint"
            className="textarea"
            style={{ minHeight: 90 }}
            placeholder="bijv. abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,!?"
            value={hint}
            maxLength={600}
            onChange={(e) => setHint(e.target.value)}
          />
          <span className="hint">Helpt de AI om twijfelgevallen (zoals l, I en 1) goed te benoemen.</span>
        </div>
        <button type="button" className="btn btn--red" onClick={analyse} disabled={!preview || busy !== null}>
          {busy && busy.startsWith("De AI") ? <span className="spinner" /> : null} Laat de AI de letters zoeken
        </button>
        {busy ? (
          <p className="small" style={{ marginTop: 12 }}>
            <span className="spinner" /> {busy}
          </p>
        ) : null}
        {error ? <p className="alert alert--error">{error}</p> : null}
        {report ? <p className="alert alert--ok">{report}</p> : null}
      </div>
      <div>
        <h3 className="panel-title">Foto</h3>
        {preview ? (
          <div className="photo photo--color" style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Uw foto" />
            {boxes.map((b, i) => (
              <span
                key={i}
                title={b.char}
                style={{
                  position: "absolute",
                  left: `${b.box[1] / 10}%`,
                  top: `${b.box[0] / 10}%`,
                  width: `${(b.box[3] - b.box[1]) / 10}%`,
                  height: `${(b.box[2] - b.box[0]) / 10}%`,
                  border: "1.5px solid var(--red)",
                  pointerEvents: "none",
                }}
              />
            ))}
          </div>
        ) : (
          <p className="empty-note">Nog geen foto gekozen.</p>
        )}
      </div>
    </div>
  );
}
