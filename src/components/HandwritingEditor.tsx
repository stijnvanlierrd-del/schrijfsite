"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { contactSheet } from "@/lib/hw/browser";
import { ALL_CHARS, CATEGORY_ORDER } from "@/lib/hw/charset";
import { loadBank, renderDocument, type GlyphBank } from "@/lib/hw/render";
import { DEFAULT_SETTINGS, normalizeSettings, type GlyphData, type HandwritingSettings } from "@/lib/hw/types";
import { cssFontFamily, ensureFonts } from "@/lib/fonts-client";
import { AnalysisArticle, type Analysis } from "./AnalysisArticle";
import { GlyphEditor, type EditorInput } from "./capture/GlyphEditor";
import { rawToGlyphData } from "@/lib/hw/browser";
import { Star } from "./Ornaments";

interface Loaded {
  handwriting: { id: string; name: string; settings: unknown; analysis: Analysis | null; updated_at: string };
  glyphs: (GlyphData & { id: string })[];
}

export const SAMPLE =
  "Pa's wijze lynx bezag vroom het fikse aquaduct. Op de markt dronk Zoë koffie in café De Hoek, en zei: ‘Wat een mooie dag!’ 0123456789";

const SLIDERS: { key: keyof HandwritingSettings; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "letterSpacing", label: "Letterafstand", min: 0, max: 0.4, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: "wordSpacing", label: "Woordafstand", min: 0.2, max: 1.2, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: "rotationJitter", label: "Draaiing per letter", min: 0, max: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)}°` },
  { key: "scaleJitter", label: "Grootteverschil", min: 0, max: 0.2, step: 0.005, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "baselineJitter", label: "Dansen op de lijn", min: 0, max: 0.15, step: 0.005, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "slant", label: "Extra schuinte", min: -15, max: 15, step: 0.5, fmt: (v) => `${v.toFixed(1)}°` },
];

export function HandwritingEditor({ id, justSaved }: { id: string; justSaved: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [bank, setBank] = useState<GlyphBank | null>(null);
  const [settings, setSettings] = useState<HandwritingSettings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    justSaved ? { ok: true, text: "Opgeslagen! Uw letters staan veilig in uw account." } : null,
  );
  const preview = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; input: EditorInput } | null>(null);
  const [savingGlyph, setSavingGlyph] = useState(false);

  const load = useCallback(async () => {
    const d = await api<Loaded>(`/api/handwritings/${id}`);
    setData(d);
    setName(d.handwriting.name);
    setSettings(normalizeSettings(d.handwriting.settings));
    setAnalysis(d.handwriting.analysis);
    setSelected(new Set());
    setBank(await loadBank(d.glyphs));
  }, [id]);

  useEffect(() => {
    load().catch((err) => setNotice({ ok: false, text: (err as Error).message }));
  }, [load]);

  useEffect(() => {
    if (!bank || !preview.current) return;
    let alive = true;
    const t = setTimeout(async () => {
      const fallback = cssFontFamily("--font-hand", "cursive");
      await ensureFonts(`40px ${fallback}`);
      if (!alive || !preview.current) return;
      const r = renderDocument(bank, {
        text: SAMPLE,
        paper: "gelinieerd",
        pageSize: "A5",
        inkColor: "#1f3a93",
        inkKind: "pen",
        capMm: 4.6,
        lineSpacingMm: 9,
        marginMm: 12,
        lineSkip: 1,
        settings,
        seed: 11,
        dpi: 120,
        fallbackFont: fallback,
        only: [0],
      });
      // Alleen het bovenste deel van het A5-vel tonen (daar staat de proeftekst).
      const page = r.pages[0];
      const c = document.createElement("canvas");
      c.width = page.width;
      c.height = Math.round(page.height * 0.42);
      c.getContext("2d")!.drawImage(page, 0, 0);
      c.style.width = "100%";
      c.style.height = "auto";
      c.style.display = "block";
      preview.current.replaceChildren(c);
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [bank, settings]);

  const byChar = useMemo(() => {
    const m = new Map<string, (GlyphData & { id: string })[]>();
    for (const g of data?.glyphs ?? []) m.set(g.ch, [...(m.get(g.ch) ?? []), g]);
    return m;
  }, [data]);
  const extra = useMemo(() => [...byChar.keys()].filter((c) => !ALL_CHARS.includes(c)).sort(), [byChar]);
  const issueChars = useMemo(() => new Set((analysis?.issues ?? []).map((i) => i.char)), [analysis]);
  const missingCount = [...ALL_CHARS].filter((c) => !byChar.has(c)).length;

  async function saveName() {
    if (!data || !name.trim() || name.trim() === data.handwriting.name) return;
    try {
      await api(`/api/handwritings/${id}`, { method: "PATCH", body: { name: name.trim() } });
      setData({ ...data, handwriting: { ...data.handwriting, name: name.trim() } });
      setNotice({ ok: true, text: "Naam bijgewerkt." });
      router.refresh();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    }
  }

  async function saveSettings() {
    setBusy("settings");
    try {
      await api(`/api/handwritings/${id}`, { method: "PATCH", body: { settings } });
      setDirty(false);
      setNotice({ ok: true, text: "Instellingen opgeslagen; ze worden gebruikt bij het schrijven." });
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    if (!selected.size || !window.confirm(`${selected.size} variant(en) verwijderen?`)) return;
    setBusy("delete");
    try {
      await api(`/api/handwritings/${id}/glyphs`, { method: "DELETE", body: { ids: [...selected] } });
      await load();
      setNotice({ ok: true, text: "Verwijderd." });
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function openEditor(g: GlyphData & { id: string }) {
    try {
      const img = new Image();
      img.src = `data:image/png;base64,${g.png}`;
      await img.decode();
      setEditing({
        id: g.id,
        input: { ch: g.ch, image: img, width: g.width, height: g.height, baseline: g.baseline, source: g.source },
      });
    } catch {
      setNotice({ ok: false, text: "Deze variant kon niet geopend worden." });
    }
  }

  async function saveEdited(raw: Parameters<typeof rawToGlyphData>[0]) {
    if (!editing) return;
    setSavingGlyph(true);
    try {
      await api(`/api/handwritings/${id}/glyphs/${editing.id}`, { method: "PUT", body: { glyph: rawToGlyphData(raw) } });
      setEditing(null);
      await load();
      setNotice({ ok: true, text: `Teken ‘${raw.ch}’ bijgewerkt.` });
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setSavingGlyph(false);
    }
  }

  async function deleteHandwriting() {
    if (!window.confirm("Dit handschrift en al zijn tekens definitief verwijderen?")) return;
    try {
      await api(`/api/handwritings/${id}`, { method: "DELETE" });
      router.push("/studio");
      router.refresh();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    }
  }

  async function analyse() {
    if (!bank) return;
    setBusy("ai");
    setNotice(null);
    try {
      const order = [...ALL_CHARS, ...extra];
      const firsts = order.map((c) => bank.map.get(c)?.[0]).filter((g): g is NonNullable<typeof g> => Boolean(g));
      if (firsts.length < 5) throw new Error("Voeg eerst wat meer tekens toe voordat u een analyse laat maken.");
      const sheet = contactSheet(firsts.map((g) => ({ ch: g.ch, canvas: g.img, w: g.w, h: g.h, baseline: g.baseline })));
      const fallback = cssFontFamily("--font-hand", "cursive");
      const sampleCanvas = renderDocument(bank, {
        text: SAMPLE,
        paper: "blanco",
        pageSize: "A5",
        inkColor: "#1b1b1b",
        inkKind: "pen",
        capMm: 5,
        lineSpacingMm: 10,
        marginMm: 10,
        lineSkip: 1,
        settings,
        seed: 3,
        dpi: 100,
        fallbackFont: fallback,
        only: [0],
      }).pages[0];
      const sample = sampleCanvas.toDataURL("image/jpeg", 0.8);
      const res = await api<{ analysis: Analysis }>("/api/ai/analyze", {
        body: { sheet, sample, labels: firsts.map((g) => g.ch), handwritingId: id },
      });
      setAnalysis(res.analysis);
      setNotice({ ok: true, text: "Analyse klaar. Bekijk het artikel hieronder." });
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <p style={{ padding: "60px 0", textAlign: "center" }}>
        {notice && !notice.ok ? (
          <span className="alert alert--error">{notice.text}</span>
        ) : (
          <>
            <span className="spinner" /> Handschrift laden…
          </>
        )}
      </p>
    );
  }

  const toggle = (gid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });

  const cell = (c: string) => {
    const list = byChar.get(c) ?? [];
    return (
      <div key={c} className={`char-cell${list.length ? "" : " missing"}${issueChars.has(c) ? " has-issue" : ""}`}>
        <header>
          <b>{c}</b>
          <span className="meta">{list.length ? `${list.length}×` : "ontbreekt"}</span>
        </header>
        <div className="variants">
          {list.map((g) => (
            <button
              key={g.id}
              type="button"
              className="variant"
              aria-pressed={selected.has(g.id)}
              title="Klik om te selecteren · dubbelklik om te bewerken"
              onClick={() => toggle(g.id)}
              onDoubleClick={() => openEditor(g)}
              style={{ width: Math.max(24, g.width * 0.42 + 8) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${g.png}`}
                alt={`Variant van ${c}`}
                style={{ top: 44 - g.baseline * 0.42, height: g.height * 0.42, width: g.width * 0.42 }}
                draggable={false}
              />
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <section style={{ padding: "34px 0 18px" }}>
        <span className="kicker">
          <Star /> Handschrift
        </span>
        <div style={{ display: "flex", gap: 14, alignItems: "end", flexWrap: "wrap", marginTop: 8 }}>
          <input
            className="input"
            aria-label="Naam van het handschrift"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            style={{
              fontFamily: "var(--display)",
              fontSize: "clamp(36px, 5.4vw, 66px)",
              lineHeight: 1,
              background: "transparent",
              border: 0,
              borderBottom: "1.5px dashed var(--grey-2)",
              padding: "4px 0",
              maxWidth: 760,
            }}
          />
        </div>
        <p className="meta" style={{ marginTop: 8 }}>
          {byChar.size} verschillende tekens · {data.glyphs.length} varianten · {missingCount} standaardtekens ontbreken
        </p>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <Link className="btn btn--red" href={`/schrijven?h=${id}`}>
            Schrijf met dit handschrift →
          </Link>
          <Link className="btn btn--ghost" href={`/handschrift/nieuw?h=${id}`}>
            + Tekens toevoegen
          </Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={deleteHandwriting}>
            Handschrift verwijderen
          </button>
        </div>
        {notice ? <p className={`alert ${notice.ok ? "alert--ok" : "alert--error"}`}>{notice.text}</p> : null}
      </section>

      <hr className="rule" />
      <section className="section" style={{ paddingTop: 30 }}>
        <div className="cols-2">
          <div>
            <h2 className="panel-title">Proefdruk</h2>
            <div className="photo photo--color" ref={preview} style={{ boxShadow: "8px 8px 0 var(--ink)", minHeight: 200 }} />
            <p className="caption">Zo ziet uw handschrift eruit op gelinieerd A5-papier, met de instellingen hiernaast.</p>
          </div>
          <div>
            <h2 className="panel-title">Instellingen voor een natuurlijk resultaat</h2>
            {SLIDERS.map((s) => (
              <div className="range-row" key={s.key}>
                <label htmlFor={`s-${s.key}`}>{s.label}</label>
                <output htmlFor={`s-${s.key}`}>{s.fmt(settings[s.key])}</output>
                <input
                  id={`s-${s.key}`}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={settings[s.key]}
                  onChange={(e) => {
                    setSettings({ ...settings, [s.key]: Number(e.target.value) });
                    setDirty(true);
                  }}
                />
              </div>
            ))}
            <div className="btn-row">
              <button type="button" className="btn" onClick={saveSettings} disabled={!dirty || busy !== null}>
                {busy === "settings" ? <span className="spinner" /> : null} Instellingen opslaan
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setSettings(DEFAULT_SETTINGS);
                  setDirty(true);
                }}
              >
                Standaard
              </button>
              {analysis ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setSettings(normalizeSettings(analysis.settings));
                    setDirty(true);
                  }}
                >
                  AI-advies toepassen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="ai-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span className="label-box label-box--red">AI-analyse</span>
            <h2 id="ai-title" className="section-title" style={{ marginTop: 10 }}>
              Wat zegt de expert?
            </h2>
            <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
              De AI bekijkt al uw letters, controleert of elk vakje het juiste teken bevat, beschrijft uw stijl en adviseert over
              spatiëring en variatie.
            </p>
          </div>
          <button type="button" className="btn btn--red" onClick={analyse} disabled={busy !== null || !bank}>
            {busy === "ai" ? <span className="spinner" /> : null} {analysis ? "Opnieuw analyseren" : "Analyseer mijn handschrift"}
          </button>
        </div>
        <div style={{ marginTop: 24 }}>
          {busy === "ai" ? (
            <p className="alert">
              <span className="spinner" /> De AI bestudeert uw letters… dit duurt meestal 10 à 30 seconden.
            </p>
          ) : null}
          {analysis ? <AnalysisArticle analysis={analysis} /> : busy !== "ai" ? <p className="empty-note">Nog geen analyse gemaakt.</p> : null}
        </div>
      </section>

      <section className="section" aria-labelledby="tekens">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
          <h2 id="tekens" className="section-title" style={{ margin: 0 }}>
            Alle tekens
          </h2>
          <div className="btn-row">
            {selected.size ? (
              <>
                <span className="small muted">{selected.size} geselecteerd</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(new Set())}>
                  Deselecteer
                </button>
              </>
            ) : (
              <span className="small muted">Klik op een variant om hem te selecteren; dubbelklik om hem te draaien, gummen of bij te tekenen.</span>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={selected.size !== 1 || busy !== null}
              onClick={() => {
                const g = data.glyphs.find((x) => selected.has(x.id));
                if (g) openEditor(g);
              }}
            >
              Bewerk variant
            </button>
            <button type="button" className="btn btn--red btn--sm" onClick={deleteSelected} disabled={!selected.size || busy !== null}>
              Verwijder selectie
            </button>
          </div>
        </div>
        {CATEGORY_ORDER.map((cat) => (
          <div key={cat.name} style={{ marginTop: 22 }}>
            <h3 className="panel-title">{cat.name}</h3>
            <div className="char-table">{[...cat.chars].map(cell)}</div>
          </div>
        ))}
        {extra.length ? (
          <div style={{ marginTop: 22 }}>
            <h3 className="panel-title">Overige tekens</h3>
            <div className="char-table">{extra.map(cell)}</div>
          </div>
        ) : null}
      </section>
      {editing ? (
        <GlyphEditor
          key={editing.id}
          input={editing.input}
          saving={savingGlyph}
          onCancel={() => setEditing(null)}
          onSave={saveEdited}
        />
      ) : null}
    </div>
  );
}
