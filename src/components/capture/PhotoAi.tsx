"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { contactSheet, loadPhoto, rawToCanvas, rotatePhoto, type LoadedPhoto } from "@/lib/hw/browser";
import { extractPhotoGlyphs, rotateAiChars, type AiChar } from "@/lib/hw/photo";
import type { RawGlyph } from "@/lib/hw/types";
import { Dropzone } from "./Dropzone";

const LOOKALIKE = ["lI1|", "oO0", "sS5", "zZ2"];
function sameShape(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return LOOKALIKE.some((set) => set.includes(a) && set.includes(b));
}

export function PhotoAi({ onGlyphs }: { onGlyphs: (g: RawGlyph[]) => void }) {
  const photo = useRef<LoadedPhoto | null>(null);
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
      photo.current = p;
      setPreview(p.preview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function turn(quarterTurns: number) {
    if (!photo.current) return;
    photo.current = rotatePhoto(photo.current, quarterTurns);
    setPreview(photo.current.preview);
    setBoxes([]);
    setReport(null);
  }

  async function analyse() {
    if (!photo.current) return;
    setError(null);
    setReport(null);
    setBusy("De AI zoekt elke letter op de foto… (15 tot 60 seconden bij een vol vel)");
    try {
      const res = await api<{ characters: AiChar[]; rotation?: number; model: string }>("/api/ai/segment", {
        body: { image: photo.current.aiJpeg, hint },
      });
      if (!res.characters.length) throw new Error("De AI vond geen handgeschreven tekens. Probeer een scherpere foto.");
      setBusy("Letters uitknippen en rechtzetten…");
      await new Promise((r) => setTimeout(r, 20));
      // Lag de foto op zijn kant of op zijn kop? Dan eerst de foto (en de vakken) rechtop draaien.
      const turns = Math.round((res.rotation ?? 0) / 90) % 4;
      let chars = res.characters;
      let out;
      if (turns) {
        photo.current = rotatePhoto(photo.current, turns);
        setPreview(photo.current.preview);
        // De AI geeft de vakken meestal in de oorspronkelijke stand, maar soms al rechtgezet.
        // Beide proberen en de uitleg kiezen die het best op de inkt past.
        const asGiven = rotateAiChars(chars, turns);
        const a = extractPhotoGlyphs(photo.current.gray, asGiven);
        const b = extractPhotoGlyphs(photo.current.gray, chars);
        if (b.inkScore > a.inkScore) out = b;
        else {
          out = a;
          chars = asGiven;
        }
      } else {
        out = extractPhotoGlyphs(photo.current.gray, chars);
      }
      setBoxes(chars);
      // Tweede ronde: de uitgeknipte tekens los laten benoemen (betrouwbaarder dan de vakjes op de foto).
      let relabeled = 0;
      let uncertain = 0;
      if (out.glyphs.length) {
        setBusy("De AI controleert elke uitgeknipte letter… (± 15 seconden)");
        try {
          const per = 100;
          const sheets: string[] = [];
          const counts: number[] = [];
          for (let i = 0; i < out.glyphs.length && sheets.length < 5; i += per) {
            const part = out.glyphs.slice(i, i + per);
            sheets.push(
              contactSheet(
                part.map((g) => ({ ch: g.ch, canvas: rawToCanvas(g), w: g.width, h: g.height, baseline: g.baseline })),
                { numbersOnly: true, guides: true },
              ),
            );
            counts.push(part.length);
          }
          const lab = await api<{ labels: { sheet: number; cell: number; char: string }[] }>("/api/ai/label", {
            body: { sheets, counts, hint },
          });
          for (const l of lab.labels) {
            const g = out.glyphs[l.sheet * per + l.cell];
            if (!g) continue;
            if (!g.ch && l.char) {
              g.ch = l.char;
              g.warning = undefined;
              relabeled++;
            } else if (g.ch && l.char && l.char !== g.ch && sameShape(g.ch, l.char)) {
              // Alleen hoofd/klein of l/I/1, O/0: de eerste ronde ziet de hele rij en weet dat beter.
            } else if (g.ch && l.char && l.char !== g.ch) {
              g.warning = `De AI twijfelt: ‘${g.ch}’ of ‘${l.char}’? Gekozen is ‘${l.char}’.`;
              g.ch = l.char;
              uncertain++;
            } else if (g.ch && !l.char) {
              g.warning = `De AI denkt dat dit geen los teken is (stukje, vlek of twee tekens). Eerst gelezen als ‘${g.ch}’: vul dat in als het klopt, of verwijder het.`;
              g.ch = "";
              uncertain++;
            }
          }
        } catch {
          // Tweede ronde is een extraatje; zonder blijft het resultaat van de eerste ronde staan.
        }
      }
      onGlyphs(out.glyphs);
      setReport(
        (turns ? `De foto lag ${turns === 2 ? "op zijn kop" : "op zijn kant"} en is automatisch rechtgezet. ` : "") +
          `${out.glyphs.filter((g) => g.ch).length} tekens herkend en uitgeknipt` +
          (out.glyphs.some((g) => !g.ch) ? `, plus ${out.glyphs.filter((g) => !g.ch).length} die u zelf kunt benoemen (achteraan, met !)` : "") +
          `${out.failed.length ? `; niet gevonden: ${out.failed.join(" ")}` : ""}.` +
          (relabeled || uncertain
            ? ` Bij de controle per letter zijn ${relabeled} tekens alsnog benoemd en ${uncertain} gemarkeerd met ! om na te kijken.`
            : "") +
          " Staat een letter nog scheef of zit er een vlek bij? Klik hieronder op de letter om hem te draaien of bij te werken." +
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
          Schrijf op een blanco, gelinieerd of ruitjesvel het alfabet, de cijfers en wat leestekens — met wat ruimte tussen de letters.
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Foto
          </h3>
          {preview ? (
            <div className="btn-row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => turn(-1)} disabled={busy !== null} title="Foto 90° linksom draaien">
                ↺ Draai
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => turn(1)} disabled={busy !== null} title="Foto 90° rechtsom draaien">
                ↻ Draai
              </button>
            </div>
          ) : null}
        </div>
        {preview ? (
          <p className="small muted" style={{ margin: "6px 0 8px" }}>
            Zet de foto rechtop voordat u de AI laat zoeken; ligt hij scheef, dan probeert de AI hem zelf recht te zetten.
          </p>
        ) : null}
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
