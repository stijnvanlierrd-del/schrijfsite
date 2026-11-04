"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { rawToCanvas, rawToGlyphData } from "@/lib/hw/browser";
import type { GlyphData, RawGlyph } from "@/lib/hw/types";
import { DrawPad } from "./DrawPad";
import { GlyphReview } from "./GlyphReview";
import { PhotoAi } from "./PhotoAi";
import { TemplateUpload } from "./TemplateUpload";
import { toReviewItems, type ReviewItem } from "./types";

type Tab = "sjabloon" | "tekenen" | "foto";
const TABS: { id: Tab; label: string }[] = [
  { id: "sjabloon", label: "Sjabloon scannen" },
  { id: "tekenen", label: "Op scherm tekenen" },
  { id: "foto", label: "Foto + AI" },
];

export function CaptureWizard({
  handwritingId,
  handwritingName,
  existingChars = [],
}: {
  handwritingId?: string;
  handwritingName?: string;
  existingChars?: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(handwritingName ?? "Mijn handschrift");
  const [tab, setTab] = useState<Tab>("sjabloon");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = (raws: RawGlyph[]) => setItems((prev) => [...prev, ...toReviewItems(raws, (g) => rawToCanvas(g).toDataURL("image/png"))]);
  const chosen = items.filter((i) => i.include && [...i.ch].length === 1 && !/\s/.test(i.ch));

  async function save() {
    setError(null);
    if (!chosen.length) return;
    if (!handwritingId && !name.trim()) {
      setError("Geef het handschrift een naam.");
      return;
    }
    setProgress({ done: 0, total: chosen.length });
    try {
      let id = handwritingId;
      if (!id) id = (await api<{ id: string }>("/api/handwritings", { body: { name: name.trim() } })).id;
      const glyphs: GlyphData[] = chosen.map((i) => rawToGlyphData({ ...i.raw, ch: i.ch.normalize("NFC") }));
      const replaceChars = replace ? [...new Set(glyphs.map((g) => g.ch))] : [];
      let batch: GlyphData[] = [];
      let size = 0;
      let done = 0;
      let first = true;
      const flush = async () => {
        if (!batch.length) return;
        await api(`/api/handwritings/${id}/glyphs`, { body: { glyphs: batch, replaceChars: first ? replaceChars : [] } });
        first = false;
        done += batch.length;
        setProgress({ done, total: glyphs.length });
        batch = [];
        size = 0;
      };
      for (const g of glyphs) {
        const s = g.png.length + 300;
        if (batch.length && (size + s > 2_600_000 || batch.length >= 150)) await flush();
        batch.push(g);
        size += s;
      }
      await flush();
      router.push(`/handschrift/${id}?opgeslagen=1`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  }

  return (
    <div>
      <div className="field" style={{ maxWidth: 520 }}>
        <label htmlFor="hwname">{handwritingId ? "Handschrift" : "Naam van dit handschrift"}</label>
        <input
          id="hwname"
          className="input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          disabled={Boolean(handwritingId)}
        />
        {handwritingId ? (
          <span className="hint">
            Nieuwe tekens worden toegevoegd aan dit handschrift (als extra varianten). <Link href={`/handschrift/${handwritingId}`}>Terug</Link>
          </span>
        ) : null}
      </div>

      <div className="tabs" role="tablist" aria-label="Manier van invoeren">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div hidden={tab !== "sjabloon"}>
        <TemplateUpload onGlyphs={add} />
      </div>
      <div hidden={tab !== "tekenen"}>
        <DrawPad onGlyphs={add} active={tab === "tekenen"} />
      </div>
      <div hidden={tab !== "foto"}>
        <PhotoAi onGlyphs={add} />
      </div>

      <GlyphReview items={items} existingChars={existingChars} onChange={setItems} />

      {items.length ? (
        <div className="panel" style={{ marginTop: 26, display: "grid", gap: 14 }}>
          {handwritingId ? (
            <label className="check">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Bestaande varianten van deze tekens vervangen (anders worden ze toegevoegd)
            </label>
          ) : null}
          {progress ? (
            <div>
              <div className="progress" aria-label="Opslaan">
                <i style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
              <p className="small">
                Opslaan… {progress.done}/{progress.total}
              </p>
            </div>
          ) : null}
          {error ? <p className="alert alert--error">{error}</p> : null}
          <div className="btn-row">
            <button type="button" className="btn btn--red" onClick={save} disabled={!chosen.length || progress !== null}>
              {progress ? <span className="spinner" /> : null} {chosen.length} tekens opslaan
            </button>
            <span className="small muted">Wordt opgeslagen in uw account (Neon-database).</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
