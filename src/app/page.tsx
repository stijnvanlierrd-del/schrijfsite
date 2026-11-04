import Link from "next/link";
import { Star, Stars } from "@/components/Ornaments";
import { PAPERS } from "@/lib/hw/paper";
import { getSessionUserSafe } from "@/lib/auth";

export default async function Home() {
  const loggedIn = Boolean(await getSessionUserSafe());
  const start = loggedIn ? "/handschrift/nieuw" : "/registreren";

  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <span className="kicker">
            <Star /> Voorpaginanieuws
          </span>
          <div style={{ margin: "14px 0 6px" }}>
            <span className="blackbox">Uw handschrift</span>
          </div>
          <h1 className="headline">
            Van pen tot lettertype — <em>en weer terug</em> op papier
          </h1>
          <p className="lede dropcap">
            Schrijf het alfabet één keer met de hand. Schrijfsite knipt elke letter uit, zet hem recht op de schrijflijn en laat
            een AI uw stijl analyseren. Daarna plakt u willekeurige tekst en krijgt u die terug in úw handschrift: op gelinieerd,
            blanco, geruit of zelfs vergeeld papier, klaar om te downloaden als PNG of PDF.
          </p>
          <div className="btn-row" style={{ marginTop: 22 }}>
            <Link className="btn btn--red" href={start}>
              {loggedIn ? "Handschrift toevoegen" : "Begin gratis"} →
            </Link>
            <Link className="btn btn--ghost" href="/sjabloon">
              Sjabloon afdrukken
            </Link>
          </div>
          <div className="hero-meta">
            <p className="small muted" style={{ margin: 0, maxWidth: 360, fontStyle: "italic" }}>
              Voor uw boodschappenlijst, uw liefdesbrief of uw verslag — wij oordelen niet.
            </p>
            <div style={{ textAlign: "right" }}>
              <div className="byline">
                Gezet door:
                <br />
                uw eigen hand
              </div>
              <div style={{ marginTop: 8 }}>
                <Stars />
              </div>
            </div>
          </div>
        </div>
        <figure className="photo" style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/voorbeeld/brief.png" alt="Voorbeeld: een brief in handschrift op gelinieerd papier" width={874} height={760} />
          <figcaption style={{ padding: "8px 10px", borderTop: "1.5px solid var(--ink)" }}>
            Voorbeeld — een brief, gezet in een proefhandschrift van onze redactie.
          </figcaption>
        </figure>
      </section>

      <hr className="rule" />
      <section className="section" aria-labelledby="hoe">
        <span className="kicker">
          <Star /> Gebruiksaanwijzing
        </span>
        <h2 id="hoe" className="section-title" style={{ marginTop: 8 }}>
          Zo werkt het, in drie kolommen
        </h2>
        <div className="cols-3" style={{ marginTop: 18 }}>
          <article>
            <span className="steps-num">I.</span>
            <h3 className="title-caps" style={{ fontSize: 30, margin: "0 0 8px" }}>
              Schrijf het alfabet
            </h3>
            <p>
              Druk het <Link href="/sjabloon">sjabloon</Link> af, vul de vakjes in en maak een foto. Liever digitaal? Teken de
              letters met muis, vinger of stylus. Of fotografeer gewoon een blad met uw letters: de AI zoekt ze zelf op.
            </p>
          </article>
          <article>
            <span className="steps-num">II.</span>
            <h3 className="title-caps" style={{ fontSize: 30, margin: "0 0 8px" }}>
              Laat het analyseren
            </h3>
            <p>
              Elke letter wordt uitgeknipt, rechtgezet en op de basislijn uitgelijnd. De AI controleert of alle letters kloppen,
              beschrijft uw stijl en stelt de spatiëring en natuurlijke variatie voor.
            </p>
          </article>
          <article>
            <span className="steps-num">III.</span>
            <h3 className="title-caps" style={{ fontSize: 30, margin: "0 0 8px" }}>
              Plak uw tekst
            </h3>
            <p>
              Plak een tekst, kies papier, inkt en grootte, en download het resultaat als PNG, ZIP of PDF. Alles wordt bewaard in
              uw persoonlijke studio, zodat u later verder kunt.
            </p>
          </article>
        </div>
      </section>

      <section className="section" aria-labelledby="papier">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span className="kicker">
              <Star /> Papierwaren
            </span>
            <h2 id="papier" className="section-title" style={{ marginTop: 8 }}>
              Twaalf soorten papier
            </h2>
          </div>
          <p className="muted small" style={{ maxWidth: 420, margin: 0 }}>
            Van schoolschrift tot schoolbord: de tekst valt netjes op de lijnen, of zweeft vrij over blanco wit.
          </p>
        </div>
        <div className="paper-strip" style={{ marginTop: 22 }}>
          {PAPERS.map((p) => (
            <div key={p.id} className="paper-card">
              <div className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/voorbeeld/papier-${p.id}.jpg`} alt={`Voorbeeld op ${p.name.toLowerCase()}`} loading="lazy" width={300} height={424} />
              </div>
              <strong>{p.name}</strong>
              <span>{p.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="vragen">
        <span className="kicker">
          <Star /> Lezersvragen
        </span>
        <h2 id="vragen" className="section-title" style={{ marginTop: 8 }}>
          Wat u zich misschien afvraagt
        </h2>
        <div className="cols-2" style={{ marginTop: 18 }}>
          <div>
            <h3 className="byline" style={{ margin: "0 0 4px" }}>Welke pen werkt het best?</h3>
            <p>Een zwarte of donkerblauwe pen of fineliner. Potlood werkt ook, maar wordt vaak te licht gefotografeerd.</p>
            <h3 className="byline" style={{ margin: "18px 0 4px" }}>Werkt het met aan-elkaar-schrift?</h3>
            <p>
              Schrijfsite zet losse letters. Schrijf de letters in het sjabloon daarom los; het resultaat oogt toch natuurlijk
              dankzij variatie in hoek, grootte en afstand.
            </p>
          </div>
          <div>
            <h3 className="byline" style={{ margin: "0 0 4px" }}>En accenten, zoals ë en é?</h3>
            <p>
              Het sjabloon bevat losse accenten. Die worden automatisch boven de juiste letter gezet: café, ruïne en Zoë komen er
              keurig uit.
            </p>
            <h3 className="byline" style={{ margin: "18px 0 4px" }}>Is mijn handschrift veilig?</h3>
            <p>
              Uw letters en teksten zijn alleen zichtbaar voor uw eigen account. De AI-sleutel staat uitsluitend op de server en
              wordt nooit naar uw browser gestuurd.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <span className="blackbox blackbox--sm">Laatste oproep</span>
        <h2 className="headline" style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>
          Uw pen ligt al klaar.
        </h2>
        <Link className="btn btn--red" href={start}>
          {loggedIn ? "Naar de studio" : "Maak een gratis account"} →
        </Link>
      </section>
    </div>
  );
}
