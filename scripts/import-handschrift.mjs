// Eenmalige, versleutelde import van handschrift-tekens tijdens de Vercel-build.
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

// Sleutel afgeleid van een geheim dat alleen Vercel (en de eigenaar) kent; staat nooit in de repository.
const secret = process.env.GEMINI_API_KEY;
const key = secret ? createHash("sha256").update(`schrijfsite-hw-import|${secret}`).digest("hex") : "";
if (!key || !process.env.DATABASE_URL) {
  console.log("[import] geen sleutel of database; overslaan");
  process.exit(0);
}
const raw = Buffer.from(readFileSync(new URL("../data/import.enc", import.meta.url), "utf8"), "base64");
const iv = raw.subarray(0, 12);
const tag = raw.subarray(12, 28);
const d = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
d.setAuthTag(tag);
const data = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
const sql = neon(process.env.DATABASE_URL);
const own = await sql.query(
  "SELECT h.id FROM handwritings h JOIN users u ON u.id = h.user_id WHERE h.id = $1 AND u.email = $2",
  [data.handwritingId, data.email],
);
if (!own.length) throw new Error("[import] handschrift niet gevonden voor dit account");
await sql.query("DELETE FROM glyphs WHERE handwriting_id = $1", [data.handwritingId]);
const g = data.glyphs;
for (let i = 0; i < g.length; i += 40) {
  const part = g.slice(i, i + 40);
  await sql.query(
    `INSERT INTO glyphs (handwriting_id, ch, png, width, height, baseline, source)
     SELECT $1, t.ch, t.png, t.width, t.height, t.baseline, 'photo'
       FROM unnest($2::text[], $3::text[], $4::int[], $5::int[], $6::real[]) AS t(ch, png, width, height, baseline)`,
    [data.handwritingId, part.map((x) => x.ch), part.map((x) => x.png), part.map((x) => x.width), part.map((x) => x.height), part.map((x) => x.baseline)],
  );
}
await sql.query("UPDATE handwritings SET updated_at = now() WHERE id = $1", [data.handwritingId]);
const n = await sql.query("SELECT count(*)::int AS n FROM glyphs WHERE handwriting_id = $1", [data.handwritingId]);
console.log(`[import] klaar: ${n[0].n} tekens`);
