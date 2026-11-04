"use client";

import { useEffect, useRef, useState } from "react";
import { SHEETS, PAGE, type SheetDef } from "@/lib/hw/charset";
import { drawTemplate } from "@/lib/hw/template";
import { buildPdf } from "@/lib/hw/pdf";
import { canvasToBlob, downloadBlob } from "@/lib/hw/browser";
import { cssFontFamily, ensureFonts } from "@/lib/fonts-client";

function termes() {
  return cssFontFamily("--font-body", '"TeX Gyre Termes", "Times New Roman", serif');
}

async function renderSheet(sheet: SheetDef, dpi: number): Promise<HTMLCanvasElement> {
  const family = termes();
  await ensureFonts(`12px ${family}`, `bold 12px ${family}`, `italic 12px ${family}`);
  const ppm = dpi / 25.4;
  const c = document.createElement("canvas");
  c.width = Math.round(PAGE.w * ppm);
  c.height = Math.round(PAGE.h * ppm);
  drawTemplate(c.getContext("2d")!, sheet, ppm, family);
  return c;
}

function SheetCard({ sheet }: { sheet: SheetDef }) {
  const holder = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    renderSheet(sheet, 60).then((c) => {
      if (!alive || !holder.current) return;
      c.style.width = "100%";
      c.style.height = "auto";
      c.setAttribute("aria-label", `Voorbeeld van ${sheet.name}`);
      holder.current.replaceChildren(c);
    });
    return () => {
      alive = false;
    };
  }, [sheet]);

  async function pdf(open: boolean) {
    setBusy(open ? "print" : "pdf");
    try {
      const canvas = await renderSheet(sheet, 220);
      const blob = await buildPdf(1, () => canvas, PAGE, `Schrijfsite sjabloon ${sheet.id}`, 0.95);
      if (open) {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) downloadBlob(blob, `schrijfsite-sjabloon-blad-${sheet.id}.pdf`);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        downloadBlob(blob, `schrijfsite-sjabloon-blad-${sheet.id}.pdf`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function png() {
    setBusy("png");
    try {
      const canvas = await renderSheet(sheet, 200);
      downloadBlob(await canvasToBlob(canvas), `schrijfsite-sjabloon-blad-${sheet.id}.png`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article style={{ display: "grid", gap: 14 }}>
      <div className="photo photo--color" ref={holder} style={{ aspectRatio: "210 / 297", boxShadow: "8px 8px 0 var(--ink)" }} />
      <div>
        <h2 className="title-caps" style={{ fontSize: 34, margin: "6px 0 2px" }}>
          {sheet.name}
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          {sheet.description} · {sheet.chars.length} vakjes
        </p>
      </div>
      <div className="btn-row">
        <button className="btn btn--red" type="button" onClick={() => pdf(false)} disabled={busy !== null}>
          {busy === "pdf" ? <span className="spinner" /> : null} PDF downloaden
        </button>
        <button className="btn btn--ghost" type="button" onClick={() => pdf(true)} disabled={busy !== null}>
          {busy === "print" ? <span className="spinner" /> : null} Openen &amp; afdrukken
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={png} disabled={busy !== null}>
          {busy === "png" ? <span className="spinner" /> : null} PNG
        </button>
      </div>
    </article>
  );
}

export function TemplateDownloads() {
  return (
    <section className="section">
      <div className="cols-2">
        {SHEETS.map((s) => (
          <SheetCard key={s.id} sheet={s} />
        ))}
      </div>
    </section>
  );
}
