"use client";

import { useState } from "react";
import { rawToCanvas } from "@/lib/hw/browser";
import { ALL_CHARS } from "@/lib/hw/charset";
import { GlyphEditor } from "./GlyphEditor";
import { GlyphImage } from "./GlyphImage";
import type { ReviewItem } from "./types";

export function GlyphReview({
  items,
  existingChars,
  onChange,
}: {
  items: ReviewItem[];
  existingChars: string[];
  onChange: (items: ReviewItem[]) => void;
}) {
  const included = items.filter((i) => i.include && [...i.ch].length === 1);
  const have = new Set([...existingChars, ...included.map((i) => i.ch)]);
  const missing = [...ALL_CHARS].filter((c) => !have.has(c));
  const update = (key: string, patch: Partial<ReviewItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const [editing, setEditing] = useState<string | null>(null);
  const current = items.find((i) => i.key === editing);

  if (!items.length) return null;
  return (
    <section aria-labelledby="controle" style={{ marginTop: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="kicker">Controle</span>
          <h2 id="controle" className="section-title" style={{ margin: "6px 0 4px" }}>
            {included.length} tekens gevonden
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Klopt een letter niet? Klik op de letter om hem te draaien, een stukje weg te gummen of bij te tekenen. Pas het teken
            aan in het vakje eronder, of zet het vinkje uit om hem over te slaan.
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(items.map((i) => ({ ...i, include: true })))}>
            Alles aan
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([])}>
            Lijst leegmaken
          </button>
        </div>
      </div>
      {missing.length ? (
        <p className="alert" style={{ marginTop: 14 }}>
          <strong>Nog niet aanwezig ({missing.length}):</strong> <span style={{ letterSpacing: "0.18em" }}>{missing.join(" ")}</span>
          <br />
          <span className="small muted">Ontbrekende tekens worden later in een reserve-lettertype gezet; u kunt ze altijd nog toevoegen.</span>
        </p>
      ) : (
        <p className="alert alert--ok" style={{ marginTop: 14 }}>
          Alle {ALL_CHARS.length} standaardtekens zijn aanwezig. Uitstekend!
        </p>
      )}
      <div className="glyph-grid" style={{ marginTop: 16 }}>
        {items.map((it) => (
          <div key={it.key} className={`glyph-card${it.include ? "" : " is-off"}`}>
            {it.warning ? (
              <span className="glyph-warn" title={it.warning}>
                !
              </span>
            ) : null}
            <button type="button" className="glyph-view glyph-view--btn" onClick={() => setEditing(it.key)} title="Bewerken">
              <GlyphImage url={it.url} width={it.raw.width} height={it.raw.height} baseline={it.raw.baseline} alt={`Teken ${it.ch}`} />
              <span className="glyph-edit" aria-hidden="true">
                ✎
              </span>
            </button>
            <div className="glyph-foot">
              <input
                type="checkbox"
                checked={it.include}
                onChange={(e) => update(it.key, { include: e.target.checked })}
                aria-label={`Teken ${it.ch} meenemen`}
              />
              <input
                type="text"
                value={it.ch}
                maxLength={2}
                aria-label="Welk teken is dit?"
                onChange={(e) => {
                  const v = [...e.target.value.normalize("NFC")].slice(-1).join("");
                  update(it.key, { ch: v });
                }}
              />
              <button type="button" className="x x--edit" aria-label={`Bewerk ${it.ch}`} onClick={() => setEditing(it.key)}>
                ✎
              </button>
              <button type="button" className="x" aria-label={`Verwijder ${it.ch}`} onClick={() => onChange(items.filter((i) => i.key !== it.key))}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      {current ? (
        <GlyphEditor
          key={current.key}
          input={{
            ch: current.ch,
            image: rawToCanvas(current.raw),
            width: current.raw.width,
            height: current.raw.height,
            baseline: current.raw.baseline,
            source: current.raw.source,
          }}
          onCancel={() => setEditing(null)}
          onSave={(g) => {
            update(current.key, { raw: g, ch: g.ch, url: rawToCanvas(g).toDataURL("image/png"), include: true, warning: undefined });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
