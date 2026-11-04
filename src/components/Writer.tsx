"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { canvasToBlob, downloadBlob } from "@/lib/hw/browser";
import { INKS, PAGE_SIZES, PAPERS, paperById, type PageSizeId, type PaperId } from "@/lib/hw/paper";
import { buildPdf } from "@/lib/hw/pdf";
import { flattenForPrint, loadBank, renderDocument, type GlyphBank, type RenderOptions } from "@/lib/hw/render";
import { DEFAULT_SETTINGS, normalizeSettings, type GlyphData, type HandwritingSettings } from "@/lib/hw/types";
import { makeZip } from "@/lib/hw/zip";
import { cssFontFamily, ensureFonts } from "@/lib/fonts-client";
import { Star } from "./Ornaments";

interface HwItem {
  id: string;
  name: string;
  glyph_count: number;
  char_count: number;
}

interface Opts {
  paper: PaperId;
  pageSize: PageSizeId;
  inkId: string;
  inkColor: string;
  inkKind: RenderOptions["inkKind"];
  capMm: number;
  lineSpacingMm: number;
  marginMm: number;
  lineSkip: number;
  natural: number;
  spacing: number;
  wordSpacing: number;
  slant: number;
  seed: number;
  dpi: number;
}

const DEFAULT_OPTS: Opts = {
  paper: "gelinieerd",
  pageSize: "A4",
  inkId: "blauw",
  inkColor: "#1f3a93",
  inkKind: "pen",
  capMm: 4.6,
  lineSpacingMm: 9,
  marginMm: 18,
  lineSkip: 1,
  natural: 1,
  spacing: 1,
  wordSpacing: 1,
  slant: 0,
  seed: 20261104,
  dpi: 200,
};

const STARTER = `Beste lezer,

Dit is een tekst in mijn eigen handschrift, gezet door Schrijfsite. Plak hier uw eigen tekst: een brief, een recept, een verslag of een gedicht.

Kies hiernaast het papier, de inkt en de grootte, en download het resultaat als PNG of PDF.

Met vriendelijke groet,`;

const STORAGE_KEY = "schrijfsite:opties";
const PREVIEW_PAGES = 8;

function sanitizeOpts(v: unknown): Opts {
  const o = { ...DEFAULT_OPTS, ...((v && typeof v === "object" ? v : {}) as Partial<Opts>) };
  const num = (x: unknown, min: number, max: number, d: number) => (Number.isFinite(Number(x)) ? Math.max(min, Math.min(max, Number(x))) : d);
  return {
    paper: PAPERS.some((p) => p.id === o.paper) ? o.paper : DEFAULT_OPTS.paper,
    pageSize: o.pageSize in PAGE_SIZES ? o.pageSize : "A4",
    inkId: typeof o.inkId === "string" ? o.inkId : "blauw",
    inkColor: /^#[0-9a-f]{6}$/i.test(String(o.inkColor)) ? o.inkColor : DEFAULT_OPTS.inkColor,
    inkKind: ["pen", "potlood", "krijt", "stift"].includes(o.inkKind) ? o.inkKind : "pen",
    capMm: num(o.capMm, 2.5, 14, DEFAULT_OPTS.capMm),
    lineSpacingMm: num(o.lineSpacingMm, 5, 30, DEFAULT_OPTS.lineSpacingMm),
    marginMm: num(o.marginMm, 6, 40, DEFAULT_OPTS.marginMm),
    lineSkip: o.lineSkip === 2 ? 2 : 1,
    natural: num(o.natural, 0, 2.5, 1),
    spacing: num(o.spacing, 0.3, 2.5, 1),
    wordSpacing: num(o.wordSpacing, 0.4, 2.5, 1),
    slant: num(o.slant, -15, 15, 0),
    seed: num(o.seed, 0, 2 ** 31, DEFAULT_OPTS.seed),
    dpi: [150, 200, 300].includes(Number(o.dpi)) ? Number(o.dpi) : 200,
  };
}

function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "handschrift"
  );
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function PageView({ canvas, transparent }: { canvas: HTMLCanvasElement; transparent: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.replaceChildren(canvas);
  }, [canvas]);
  return <div ref={ref} className={`page-frame${transparent ? " checker" : ""}`} />;
}

function PaperSwatch({ id, name, active, onClick }: { id: PaperId; name: string; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ppm = 0.42;
    c.width = Math.round(210 * ppm);
    c.height = Math.round(297 * ppm);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    paperById(id).draw(ctx, { w: 210, h: 297 }, ppm, 7);
  }, [id]);
  return (
    <button type="button" className="swatch" aria-pressed={active} onClick={onClick} title={paperById(id).note}>
      <canvas ref={ref} style={id === "transparant" ? { background: "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 10px 10px" } : undefined} />
      <span>{name}</span>
    </button>
  );
}

export function Writer({ initialHandwriting, initialDocument }: { initialHandwriting: string | null; initialDocument: string | null }) {
  const router = useRouter();
  const [list, setList] = useState<HwItem[] | null>(null);
  const [hwId, setHwId] = useState<string | null>(initialHandwriting);
  const [bank, setBank] = useState<GlyphBank | null>(null);
  const [baseSettings, setBaseSettings] = useState<HandwritingSettings>(DEFAULT_SETTINGS);
  const [text, setText] = useState(STARTER);
  const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS);
  const [docId, setDocId] = useState<string | null>(initialDocument);
  const [title, setTitle] = useState("Naamloze tekst");
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [ready, setReady] = useState(false);

  const paper = paperById(opts.paper);
  const set = (patch: Partial<Opts>) => setOpts((o) => ({ ...o, ...patch }));

  // Eerste lading: lijst met handschriften, eventueel een bewaard document of de laatst gebruikte instellingen.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api<{ handwritings: HwItem[] }>("/api/handwritings");
        if (!alive) return;
        setList(res.handwritings);
        let chosen = initialHandwriting;
        if (initialDocument) {
          const d = await api<{ document: { title: string; content: string; options: unknown; handwriting_id: string | null } }>(
            `/api/documents/${initialDocument}`,
          );
          if (!alive) return;
          setTitle(d.document.title);
          setText(d.document.content);
          setOpts(sanitizeOpts(d.document.options));
          chosen = d.document.handwriting_id ?? chosen;
        } else {
          try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved) setOpts(sanitizeOpts(JSON.parse(saved)));
          } catch {
            /* geen opslag beschikbaar */
          }
        }
        if (!chosen || !res.handwritings.some((h) => h.id === chosen)) chosen = res.handwritings[0]?.id ?? null;
        setHwId(chosen);
      } catch (err) {
        setNotice({ ok: false, text: (err as Error).message });
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialDocument, initialHandwriting]);

  // Handschrift laden.
  useEffect(() => {
    if (!hwId) {
      setBank(null);
      return;
    }
    let alive = true;
    setBank(null);
    (async () => {
      try {
        const d = await api<{ handwriting: { settings: unknown }; glyphs: GlyphData[] }>(`/api/handwritings/${hwId}`);
        const b = await loadBank(d.glyphs);
        if (!alive) return;
        setBaseSettings(normalizeSettings(d.handwriting.settings));
        setBank(b);
      } catch (err) {
        if (alive) setNotice({ ok: false, text: (err as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [hwId]);

  // Instellingen onthouden (alleen gemak, per browser).
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
    } catch {
      /* negeren */
    }
  }, [opts, ready]);

  const settings: HandwritingSettings = useMemo(
    () => ({
      letterSpacing: baseSettings.letterSpacing * opts.spacing,
      wordSpacing: baseSettings.wordSpacing * opts.wordSpacing,
      rotationJitter: baseSettings.rotationJitter * opts.natural,
      scaleJitter: baseSettings.scaleJitter * opts.natural,
      baselineJitter: baseSettings.baselineJitter * opts.natural,
      slant: baseSettings.slant + opts.slant,
    }),
    [baseSettings, opts.spacing, opts.wordSpacing, opts.natural, opts.slant],
  );

  const renderOpts = (dpi: number, only?: number[]): RenderOptions => ({
    text,
    paper: opts.paper,
    pageSize: opts.pageSize,
    inkColor: opts.inkColor,
    inkKind: opts.inkKind,
    capMm: opts.capMm,
    lineSpacingMm: opts.lineSpacingMm,
    marginMm: opts.marginMm,
    lineSkip: opts.lineSkip,
    settings,
    seed: opts.seed,
    dpi,
    fallbackFont: cssFontFamily("--font-hand", "cursive"),
    maxPages: 40,
    only,
  });

  // Live voorbeeld (met kleine vertraging tijdens het typen).
  useEffect(() => {
    if (!bank) return;
    let alive = true;
    setRendering(true);
    const t = setTimeout(async () => {
      await ensureFonts(`40px ${cssFontFamily("--font-hand", "cursive")}`);
      if (!alive) return;
      const res = renderDocument(bank, renderOpts(110, Array.from({ length: PREVIEW_PAGES }, (_, i) => i)));
      if (!alive) return;
      setPages(res.pages);
      setPageCount(res.pageCount);
      setMissing(res.missing);
      setTruncated(res.truncated);
      setRendering(false);
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, text, opts, settings]);

  const fileBase = slugify(title);

  async function exportPng(all: boolean) {
    if (!bank) return;
    setBusy(all ? "zip" : "png");
    try {
      await ensureFonts(`40px ${cssFontFamily("--font-hand", "cursive")}`);
      const count = all ? pageCount : 1;
      const files: { name: string; blob: Blob }[] = [];
      for (let p = 0; p < count; p++) {
        await tick();
        const page = renderDocument(bank, renderOpts(opts.dpi, [p])).pages[0];
        files.push({ name: `${fileBase}-pagina-${p + 1}.png`, blob: await canvasToBlob(page, "image/png") });
      }
      if (files.length === 1) downloadBlob(files[0].blob, `${fileBase}${count > 1 ? "-pagina-1" : ""}.png`);
      else downloadBlob(await makeZip(files), `${fileBase}.zip`);
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    if (!bank) return;
    setBusy("pdf");
    try {
      await ensureFonts(`40px ${cssFontFamily("--font-hand", "cursive")}`);
      const blob = await buildPdf(
        pageCount,
        async (i) => {
          await tick();
          return flattenForPrint(renderDocument(bank, renderOpts(opts.dpi, [i])).pages[0], paper.base);
        },
        PAGE_SIZES[opts.pageSize],
        title,
        0.9,
      );
      downloadBlob(blob, `${fileBase}.pdf`);
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function copyImage() {
    if (!bank) return;
    setBusy("copy");
    try {
      const page = renderDocument(bank, renderOpts(150, [0])).pages[0];
      const blob = await canvasToBlob(page, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNotice({ ok: true, text: "Pagina 1 staat op het klembord." });
    } catch {
      setNotice({ ok: false, text: "Kopiëren lukt niet in deze browser; gebruik de download." });
    } finally {
      setBusy(null);
    }
  }

  async function saveDocument() {
    setBusy("save");
    try {
      const body = { title: title.trim() || "Naamloze tekst", content: text, handwritingId: hwId, options: opts };
      if (docId) {
        await api(`/api/documents/${docId}`, { method: "PATCH", body });
      } else {
        const res = await api<{ id: string }>("/api/documents", { body });
        setDocId(res.id);
        router.replace(`/schrijven?d=${res.id}`, { scroll: false });
      }
      setNotice({ ok: true, text: "Tekst opgeslagen in uw studio." });
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function choosePaper(id: PaperId) {
    const next = paperById(id);
    const patch: Partial<Opts> = { paper: id };
    if (id === "schoolbord") Object.assign(patch, { inkId: "krijt", inkColor: "#f2f0e6", inkKind: "krijt" });
    else if (opts.inkId === "krijt") Object.assign(patch, { inkId: "blauw", inkColor: next.defaultInk, inkKind: "pen" });
    set(patch);
  }

  if (ready && list && list.length === 0) {
    return (
      <section style={{ padding: "50px 0" }}>
        <span className="kicker">
          <Star /> Schrijftafel
        </span>
        <h1 className="headline">Eerst een handschrift</h1>
        <p className="lede">U heeft nog geen handschrift. Leg uw letters vast en kom dan terug om te schrijven.</p>
        <Link href="/handschrift/nieuw" className="btn btn--red">
          Handschrift toevoegen →
        </Link>
      </section>
    );
  }

  const ruled = paper.ruled;
  const isLinePaper = ["gelinieerd", "collegeblok", "geel", "schrijflijnen"].includes(opts.paper);

  return (
    <div className="desk">
      <aside className="desk-controls" aria-label="Instellingen">
        <span className="kicker" style={{ marginTop: 6 }}>
          <Star /> Schrijftafel
        </span>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="hw">Handschrift</label>
          <select id="hw" className="select" value={hwId ?? ""} onChange={(e) => setHwId(e.target.value)} disabled={!list}>
            {(list ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.char_count} tekens)
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="text">Uw tekst</label>
          <textarea id="text" className="textarea" value={text} maxLength={60000} onChange={(e) => setText(e.target.value)} />
          <span className="hint">
            {text.length.toLocaleString("nl-NL")} tekens · {pageCount || 1} pagina{pageCount === 1 ? "" : "’s"}
          </span>
        </div>

        <details open>
          <summary>Papier</summary>
          <div className="inner">
            <div className="swatches">
              {PAPERS.map((p) => (
                <PaperSwatch key={p.id} id={p.id} name={p.name} active={opts.paper === p.id} onClick={() => choosePaper(p.id)} />
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {paper.note}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <span className="field-label">Formaat</span>
              <div className="seg" role="group" aria-label="Paginaformaat">
                {(Object.keys(PAGE_SIZES) as PageSizeId[]).map((k) => (
                  <button key={k} type="button" aria-pressed={opts.pageSize === k} onClick={() => set({ pageSize: k })}>
                    {PAGE_SIZES[k].name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details open>
          <summary>Inkt &amp; grootte</summary>
          <div className="inner">
            <div className="inks" role="group" aria-label="Inktkleur">
              {INKS.map((ink) => (
                <button
                  key={ink.id}
                  type="button"
                  className="ink"
                  title={ink.name}
                  aria-label={ink.name}
                  aria-pressed={opts.inkId === ink.id}
                  style={{ background: ink.color }}
                  onClick={() => set({ inkId: ink.id, inkColor: ink.color, inkKind: ink.kind })}
                />
              ))}
              <label className="ink" title="Eigen kleur" aria-pressed={opts.inkId === "eigen"} style={{ background: "conic-gradient(#b0291f, #e0b13a, #2f6b3c, #1f3a93, #6b2f8f, #b0291f)", position: "relative" }}>
                <input
                  type="color"
                  value={opts.inkColor}
                  aria-label="Eigen inktkleur"
                  onChange={(e) => set({ inkId: "eigen", inkColor: e.target.value, inkKind: "pen" })}
                  style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
                />
              </label>
            </div>
            <div className="range-row" style={{ marginTop: 14 }}>
              <label htmlFor="cap">Lettergrootte (hoofdletter)</label>
              <output htmlFor="cap">{opts.paper === "schrijflijnen" ? "volgt lijnen" : `${opts.capMm.toFixed(1)} mm`}</output>
              <input
                id="cap"
                type="range"
                min={2.5}
                max={14}
                step={0.1}
                value={opts.capMm}
                disabled={opts.paper === "schrijflijnen"}
                onChange={(e) => set({ capMm: Number(e.target.value) })}
              />
            </div>
            {isLinePaper ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="field-label">Regels</span>
                <div className="seg" role="group" aria-label="Regels gebruiken">
                  <button type="button" aria-pressed={opts.lineSkip === 1} onClick={() => set({ lineSkip: 1 })}>
                    Elke regel
                  </button>
                  <button type="button" aria-pressed={opts.lineSkip === 2} onClick={() => set({ lineSkip: 2 })}>
                    Om de regel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="range-row">
                  <label htmlFor="ls">Regelafstand</label>
                  <output htmlFor="ls">{opts.lineSpacingMm.toFixed(1)} mm{ruled ? " (op raster)" : ""}</output>
                  <input id="ls" type="range" min={5} max={24} step={0.5} value={opts.lineSpacingMm} onChange={(e) => set({ lineSpacingMm: Number(e.target.value) })} />
                </div>
                <div className="range-row">
                  <label htmlFor="mg">Marges</label>
                  <output htmlFor="mg">{opts.marginMm.toFixed(0)} mm</output>
                  <input id="mg" type="range" min={6} max={40} step={1} value={opts.marginMm} onChange={(e) => set({ marginMm: Number(e.target.value) })} />
                </div>
              </>
            )}
          </div>
        </details>

        <details>
          <summary>Natuurlijkheid</summary>
          <div className="inner">
            <div className="range-row">
              <label htmlFor="nat">Variatie (draaiing, grootte, dansen)</label>
              <output htmlFor="nat">{Math.round(opts.natural * 100)}%</output>
              <input id="nat" type="range" min={0} max={2.5} step={0.05} value={opts.natural} onChange={(e) => set({ natural: Number(e.target.value) })} />
            </div>
            <div className="range-row">
              <label htmlFor="sp">Letterafstand</label>
              <output htmlFor="sp">{Math.round(opts.spacing * 100)}%</output>
              <input id="sp" type="range" min={0.3} max={2.5} step={0.05} value={opts.spacing} onChange={(e) => set({ spacing: Number(e.target.value) })} />
            </div>
            <div className="range-row">
              <label htmlFor="ws">Woordafstand</label>
              <output htmlFor="ws">{Math.round(opts.wordSpacing * 100)}%</output>
              <input id="ws" type="range" min={0.4} max={2.5} step={0.05} value={opts.wordSpacing} onChange={(e) => set({ wordSpacing: Number(e.target.value) })} />
            </div>
            <div className="range-row">
              <label htmlFor="sl">Extra schuinte</label>
              <output htmlFor="sl">{opts.slant.toFixed(1)}°</output>
              <input id="sl" type="range" min={-15} max={15} step={0.5} value={opts.slant} onChange={(e) => set({ slant: Number(e.target.value) })} />
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 31) })}>
              ↻ Nieuwe variatie
            </button>
          </div>
        </details>

        <details open>
          <summary>Downloaden &amp; bewaren</summary>
          <div className="inner" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="field-label">Kwaliteit</span>
              <div className="seg" role="group" aria-label="Resolutie">
                {[150, 200, 300].map((d) => (
                  <button key={d} type="button" aria-pressed={opts.dpi === d} onClick={() => set({ dpi: d })}>
                    {d} dpi
                  </button>
                ))}
              </div>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn--red" onClick={exportPdf} disabled={!bank || busy !== null}>
                {busy === "pdf" ? <span className="spinner" /> : null} PDF
              </button>
              <button type="button" className="btn" onClick={() => exportPng(false)} disabled={!bank || busy !== null}>
                {busy === "png" ? <span className="spinner" /> : null} PNG{pageCount > 1 ? " (p. 1)" : ""}
              </button>
              {pageCount > 1 ? (
                <button type="button" className="btn" onClick={() => exportPng(true)} disabled={!bank || busy !== null}>
                  {busy === "zip" ? <span className="spinner" /> : null} Alle PNG’s (zip)
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost btn--sm" onClick={copyImage} disabled={!bank || busy !== null}>
                Kopiëren
              </button>
            </div>
            {paper.id === "transparant" ? <p className="hint">PNG blijft doorzichtig; in de PDF wordt de achtergrond wit.</p> : null}
            <div className="field" style={{ marginBottom: 6 }}>
              <label htmlFor="title">Titel</label>
              <input id="title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <button type="button" className="btn btn--ghost" onClick={saveDocument} disabled={busy !== null}>
              {busy === "save" ? <span className="spinner" /> : null} {docId ? "Wijzigingen opslaan" : "Opslaan in mijn studio"}
            </button>
          </div>
        </details>
        {notice ? <p className={`alert ${notice.ok ? "alert--ok" : "alert--error"}`}>{notice.text}</p> : null}
      </aside>

      <section aria-label="Voorbeeld" aria-live="polite">
        {missing.length ? (
          <p className="alert">
            <strong>Nog niet in uw handschrift:</strong> <span style={{ letterSpacing: "0.15em" }}>{missing.join(" ")}</span> — deze tekens worden in een
            reserve-handschrift gezet.{" "}
            {hwId ? <Link href={`/handschrift/nieuw?h=${hwId}`}>Voeg ze toe</Link> : null}
          </p>
        ) : null}
        {truncated ? <p className="alert alert--error">De tekst is te lang; alleen de eerste 40 pagina’s worden gemaakt.</p> : null}
        {!bank ? (
          <p style={{ padding: "60px 0", textAlign: "center" }}>
            <span className="spinner" /> Handschrift laden…
          </p>
        ) : (
          <div className="pages" style={{ opacity: rendering ? 0.75 : 1, transition: "opacity .15s" }}>
            {pages.map((c, i) => (
              <figure key={i} style={{ margin: 0, width: "100%", display: "grid", justifyItems: "center" }}>
                <PageView canvas={c} transparent={paper.base === null} />
                <figcaption className="page-no">
                  Pagina {i + 1} van {pageCount}
                </figcaption>
              </figure>
            ))}
            {pageCount > PREVIEW_PAGES ? (
              <p className="muted small">Het voorbeeld toont de eerste {PREVIEW_PAGES} pagina’s; downloads bevatten alle {pageCount} pagina’s.</p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
