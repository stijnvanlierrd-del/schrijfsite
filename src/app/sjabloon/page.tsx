import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "@/components/Ornaments";
import { TemplateDownloads } from "@/components/TemplateDownloads";

export const metadata: Metadata = { title: "Sjabloon afdrukken" };

export default function TemplatePage() {
  return (
    <div className="wrap">
      <section style={{ padding: "34px 0 6px" }}>
        <span className="kicker">
          <Star /> Drukwerk
        </span>
        <h1 className="headline">Het handschriftsjabloon</h1>
        <p className="lede" style={{ maxWidth: 820 }}>
          Druk het sjabloon af op A4 (ware grootte), schrijf in elk vakje één teken en maak er een foto of scan van. De zwarte
          hoekvierkanten zorgen ervoor dat Schrijfsite het blad altijd terugvindt — ook als de foto scheef of ondersteboven is.
        </p>
      </section>
      <hr className="rule" />
      <TemplateDownloads />
      <section className="section">
        <div className="cols-3">
          <div>
            <span className="steps-num">1.</span>
            <h3 className="byline">Afdrukken</h3>
            <p>Kies ‘Ware grootte’ of 100% in het afdrukvenster. Blad 1 is genoeg om te beginnen; blad 2 geeft extra varianten.</p>
          </div>
          <div>
            <span className="steps-num">2.</span>
            <h3 className="byline">Invullen</h3>
            <p>
              Gebruik een zwarte of donkerblauwe pen. Laat de letter rusten op de blauwe stippellijn; staarten van g, j, p, q en y
              mogen eronder. Schrijf zoals u normaal schrijft.
            </p>
          </div>
          <div>
            <span className="steps-num">3.</span>
            <h3 className="byline">Fotograferen</h3>
            <p>
              Leg het blad plat bij goed licht, fotografeer recht van boven met alle vier de hoeken in beeld en upload de foto
              bij <Link href="/handschrift/nieuw">Handschrift toevoegen</Link>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
