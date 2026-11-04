import { Star } from "./Ornaments";

export interface Analysis {
  headline: string;
  summary: string;
  traits: { style: string; slant: string; size: string; spacing: string; pressure: string; legibility: number; consistency: number };
  observations: string[];
  settings: Record<string, number>;
  issues: { index: number; char: string; problem: string }[];
  model?: string;
  analysedAt?: string;
}

function Score({ value }: { value: number }) {
  return (
    <span className="score" aria-label={`${value} van 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < value ? "on" : ""} />
      ))}
      <b style={{ marginLeft: 6 }}>{value}/10</b>
    </span>
  );
}

export function AnalysisArticle({ analysis }: { analysis: Analysis }) {
  const date = analysis.analysedAt
    ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(analysis.analysedAt))
    : null;
  return (
    <article>
      <span className="kicker">
        <Star /> Analyse{date ? ` · ${date}` : ""}
      </span>
      <h3 className="headline" style={{ fontSize: "clamp(32px, 4.6vw, 56px)", margin: "8px 0 14px" }}>
        {analysis.headline || "Een hand met karakter"}
      </h3>
      <div className="cols-2">
        <div>
          <p className="dropcap" style={{ marginTop: 0 }}>
            {analysis.summary}
          </p>
          {analysis.observations.length ? (
            <>
              <h4 className="panel-title" style={{ marginTop: 18 }}>
                Opvallend
              </h4>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {analysis.observations.map((o, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {o}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div>
          <dl className="facts" style={{ margin: 0 }}>
            <div>
              <dt>Stijl</dt>
              <dd>{analysis.traits.style}</dd>
            </div>
            <div>
              <dt>Helling</dt>
              <dd>{analysis.traits.slant}</dd>
            </div>
            <div>
              <dt>Verhouding</dt>
              <dd>{analysis.traits.size}</dd>
            </div>
            <div>
              <dt>Ruimte</dt>
              <dd>{analysis.traits.spacing}</dd>
            </div>
            <div>
              <dt>Druk</dt>
              <dd>{analysis.traits.pressure}</dd>
            </div>
            <div>
              <dt>Leesbaarheid</dt>
              <dd>
                <Score value={analysis.traits.legibility} />
              </dd>
            </div>
            <div>
              <dt>Regelmaat</dt>
              <dd>
                <Score value={analysis.traits.consistency} />
              </dd>
            </div>
          </dl>
          {analysis.issues.length ? (
            <div className="alert alert--error" style={{ marginTop: 16 }}>
              <strong>Correcties ({analysis.issues.length})</strong>
              <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
                {analysis.issues.map((i, k) => (
                  <li key={k}>
                    <b style={{ fontFamily: "var(--display)", fontSize: 20 }}>{i.char}</b> — {i.problem}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="alert alert--ok" style={{ marginTop: 16 }}>
              Geen correcties: alle letters zijn herkend zoals bedoeld.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
