import Link from "next/link";
import { Stars } from "./Ornaments";

export function Footer() {
  return (
    <footer className="foot wrap">
      <div className="foot-grid">
        <div>
          <p className="foot-title">Schrijfsite</p>
          <p className="small">
            Zet uw eigen handschrift om in een alfabet en schrijf er elke tekst mee — op gelinieerd, blanco, geruit of ander
            papier.
          </p>
          <Stars />
        </div>
        <div>
          <h4>Rubrieken</h4>
          <p className="small" style={{ margin: 0, lineHeight: 1.9 }}>
            <Link href="/sjabloon">Sjabloon afdrukken</Link>
            <br />
            <Link href="/handschrift/nieuw">Handschrift toevoegen</Link>
            <br />
            <Link href="/schrijven">Tekst schrijven</Link>
            <br />
            <Link href="/studio">Mijn studio</Link>
          </p>
        </div>
        <div>
          <h4>Colofon &amp; privacy</h4>
          <p className="small" style={{ margin: 0 }}>
            Uw handschrift en teksten worden alleen voor uw eigen account bewaard in een beveiligde database (Neon). Voor de
            AI-analyse wordt een afbeelding van uw letters naar Google Gemini gestuurd; de sleutel daarvoor staat uitsluitend op
            de server.
          </p>
        </div>
      </div>
    </footer>
  );
}
