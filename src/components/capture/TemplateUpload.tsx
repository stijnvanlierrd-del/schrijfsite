"use client";

import Link from "next/link";
import { useState } from "react";
import { detectTemplate, extractSheet } from "@/lib/hw/imageproc";
import { loadPhoto } from "@/lib/hw/browser";
import type { RawGlyph } from "@/lib/hw/types";
import { Dropzone } from "./Dropzone";

export function TemplateUpload({ onGlyphs }: { onGlyphs: (g: RawGlyph[]) => void }) {
  const [sheet, setSheet] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);

  async function handle(files: File[]) {
    for (const file of files) {
      setBusy(`Bezig met ${file.name}…`);
      await new Promise((r) => setTimeout(r, 40));
      try {
        const { gray } = await loadPhoto(file, 3200);
        await new Promise((r) => setTimeout(r, 10));
        const det = detectTemplate(gray, sheet === "auto" ? undefined : Number(sheet));
        const { glyphs, empty } = extractSheet(gray, det);
        onGlyphs(glyphs);
        setLog((l) => [
          ...l,
          {
            ok: true,
            text: `${file.name}: ${det.sheet.name}${det.sheetDetected || sheet !== "auto" ? "" : " (aangenomen)"} — ${glyphs.length} tekens uitgeknipt${
              empty.length ? `, ${empty.length} leeg: ${empty.join(" ")}` : ""
            }.`,
          },
        ]);
      } catch (err) {
        setLog((l) => [...l, { ok: false, text: `${file.name}: ${(err as Error).message}` }]);
      }
    }
    setBusy(null);
  }

  return (
    <div className="cols-2">
      <div>
        <p style={{ marginTop: 0 }}>
          Heeft u het <Link href="/sjabloon">sjabloon</Link> ingevuld? Upload hier een foto of scan. U kunt meerdere bladen
          tegelijk kiezen (blad 1 en 2).
        </p>
        <Dropzone accept="image/*" multiple onFiles={handle} disabled={busy !== null} label="Kies of sleep uw ingevulde sjabloon" />
        <div className="field" style={{ marginTop: 16, maxWidth: 320 }}>
          <label htmlFor="sheet">Welk blad?</label>
          <select id="sheet" className="select" value={sheet} onChange={(e) => setSheet(e.target.value)}>
            <option value="auto">Automatisch herkennen</option>
            <option value="1">Blad 1 — Basis</option>
            <option value="2">Blad 2 — Varianten</option>
          </select>
        </div>
      </div>
      <div>
        <h3 className="panel-title">Verslag</h3>
        {busy ? (
          <p>
            <span className="spinner" /> {busy}
          </p>
        ) : null}
        {log.length === 0 && !busy ? <p className="muted small">Nog niets geüpload.</p> : null}
        {log.map((l, i) => (
          <p key={i} className={`alert ${l.ok ? "alert--ok" : "alert--error"}`}>
            {l.text}
          </p>
        ))}
        <p className="hint">Tip: fotografeer bij daglicht, recht van boven, zonder schaduw van uw telefoon.</p>
      </div>
    </div>
  );
}
