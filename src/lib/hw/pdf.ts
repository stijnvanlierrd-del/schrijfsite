/** Minimale PDF-schrijver: elke pagina is één JPEG-afbeelding op ware grootte. */

const enc = new TextEncoder();

function pdfString(s: string): string {
  // Alleen ASCII; haakjes en backslashes escapen.
  const ascii = s.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
  return `(${ascii.replace(/([\\()])/g, "\\$1")})`;
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG maken mislukt"))), "image/jpeg", quality),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasesToPdf(
  pages: HTMLCanvasElement[],
  pageMm: { w: number; h: number },
  title = "Schrijfsite",
  quality = 0.92,
): Promise<Blob> {
  return buildPdf(pages.length, (i) => pages[i], pageMm, title, quality);
}

/** Bouwt een PDF pagina voor pagina (zodat grote documenten niet alles tegelijk in het geheugen houden). */
export async function buildPdf(
  pageCount: number,
  getPage: (index: number) => HTMLCanvasElement | Promise<HTMLCanvasElement>,
  pageMm: { w: number; h: number },
  title = "Schrijfsite",
  quality = 0.92,
): Promise<Blob> {
  const ptW = (pageMm.w / 25.4) * 72;
  const ptH = (pageMm.h / 25.4) * 72;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObj = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // Objectnummers: 1 catalog, 2 pages, 3 info, daarna per pagina 3 objecten.
  const pageObj = (i: number) => 4 + i * 3;
  startObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObj(2);
  push(`<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>\nendobj\n`);
  startObj(3);
  push(`<< /Title ${pdfString(title)} /Producer (Schrijfsite) /Creator (Schrijfsite) >>\nendobj\n`);

  for (let i = 0; i < pageCount; i++) {
    const canvas = await getPage(i);
    const jpeg = await canvasToJpeg(canvas, quality);
    const pn = pageObj(i);
    const content = `q ${ptW.toFixed(2)} 0 0 ${ptH.toFixed(2)} 0 0 cm /Im0 Do Q\n`;
    startObj(pn);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW.toFixed(2)} ${ptH.toFixed(2)}] /Resources << /XObject << /Im0 ${pn + 2} 0 R >> >> /Contents ${pn + 1} 0 R >>\nendobj\n`,
    );
    startObj(pn + 1);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
    startObj(pn + 2);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push("\nendstream\nendobj\n");
  }

  const total = 4 + pageCount * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
