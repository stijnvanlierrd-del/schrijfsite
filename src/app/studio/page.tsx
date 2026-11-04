import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteButton } from "@/components/DeleteButton";
import { Star } from "@/components/Ornaments";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

interface HwRow {
  id: string;
  name: string;
  updated_at: string;
  glyph_count: number;
  char_count: number;
  analysed: boolean;
}
interface DocRow {
  id: string;
  title: string;
  handwriting_name: string | null;
  updated_at: string;
  preview: string;
  length: number;
}

const fmt = (d: string | Date) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(d));

export default async function Studio() {
  const user = await getSessionUser();
  if (!user) redirect("/inloggen?volgende=/studio");
  const [hws, docs] = await Promise.all([
    query<HwRow>(
      `SELECT h.id, h.name, h.updated_at,
              (SELECT count(*)::int FROM glyphs g WHERE g.handwriting_id = h.id) AS glyph_count,
              (SELECT count(DISTINCT g.ch)::int FROM glyphs g WHERE g.handwriting_id = h.id) AS char_count,
              (h.analysis IS NOT NULL) AS analysed
         FROM handwritings h WHERE h.user_id = $1 ORDER BY h.updated_at DESC`,
      [user.id],
    ),
    query<DocRow>(
      `SELECT d.id, d.title, h.name AS handwriting_name, d.updated_at, left(d.content, 140) AS preview, length(d.content)::int AS length
         FROM documents d LEFT JOIN handwritings h ON h.id = d.handwriting_id
        WHERE d.user_id = $1 ORDER BY d.updated_at DESC LIMIT 100`,
      [user.id],
    ),
  ]);

  return (
    <div className="wrap">
      <section style={{ padding: "34px 0 10px" }}>
        <span className="kicker">
          <Star /> Redactielokaal
        </span>
        <h1 className="headline">Goedendag{user.name ? `, ${user.name}` : ""}.</h1>
        <p className="lede" style={{ marginTop: 0 }}>
          Hier liggen uw handschriften en bewaarde teksten. Begin met een handschrift, of schrijf meteen verder.
        </p>
        <div className="btn-row">
          <Link className="btn btn--red" href="/handschrift/nieuw">
            + Nieuw handschrift
          </Link>
          <Link className="btn btn--ghost" href="/schrijven">
            Tekst schrijven
          </Link>
          <Link className="btn btn--ghost" href="/sjabloon">
            Sjabloon afdrukken
          </Link>
        </div>
      </section>

      <div className="cols-2" style={{ marginTop: 34 }}>
        <section aria-labelledby="hw-title">
          <h2 id="hw-title" className="section-title">
            Handschriften
          </h2>
          {hws.length === 0 ? (
            <p className="empty-note">
              Nog geen handschrift. <Link href="/handschrift/nieuw">Voeg uw eerste toe</Link> — het kost een paar minuten.
            </p>
          ) : (
            <div className="card-list">
              {hws.map((h) => (
                <div className="card-row" key={h.id}>
                  <div>
                    <h3>
                      <Link href={`/handschrift/${h.id}`}>{h.name}</Link>
                    </h3>
                    <div className="meta">
                      {h.char_count} tekens · {h.glyph_count} varianten · bijgewerkt {fmt(h.updated_at)}
                      {h.analysed ? " · ✦ geanalyseerd" : ""}
                    </div>
                  </div>
                  <div className="btn-row">
                    <Link className="btn btn--sm" href={`/schrijven?h=${h.id}`}>
                      Schrijf
                    </Link>
                    <Link className="btn btn--ghost btn--sm" href={`/handschrift/${h.id}`}>
                      Bewerk
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="doc-title">
          <h2 id="doc-title" className="section-title">
            Bewaarde teksten
          </h2>
          {docs.length === 0 ? (
            <p className="empty-note">Nog geen bewaarde teksten. Schrijf iets en klik op ‘Opslaan’.</p>
          ) : (
            <div className="card-list">
              {docs.map((d) => (
                <div className="card-row" key={d.id}>
                  <div style={{ minWidth: 0 }}>
                    <h3>
                      <Link href={`/schrijven?d=${d.id}`}>{d.title}</Link>
                    </h3>
                    <div className="meta">
                      {d.handwriting_name ? `in ‘${d.handwriting_name}’ · ` : ""}
                      {d.length} tekens · {fmt(d.updated_at)}
                    </div>
                    <p className="small muted" style={{ margin: "6px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.preview}
                    </p>
                  </div>
                  <div className="btn-row">
                    <Link className="btn btn--sm" href={`/schrijven?d=${d.id}`}>
                      Open
                    </Link>
                    <DeleteButton url={`/api/documents/${d.id}`} confirmText={`Tekst ‘${d.title}’ verwijderen?`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
