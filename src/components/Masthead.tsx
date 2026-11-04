import Link from "next/link";
import { Star } from "./Ornaments";
import { NavLinks } from "./NavLinks";

function dutchDate(d: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(d);
}

function issueNumber(d: Date) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

export function Masthead({ user }: { user: { name: string } | null }) {
  const now = new Date();
  return (
    <header className="mast wrap">
      <div className="mast-top">
        <span>
          <Star />
          <span className="hide-sm">{dutchDate(now)}</span>
          <span className="sr-only">{dutchDate(now)}</span>
        </span>
        <span>
          <span className="hide-sm">Editie nr. {issueNumber(now)}</span>
          <Star />
          {now.getFullYear()}
        </span>
      </div>
      <Link href="/" className="mast-title" aria-label="Schrijfsite — naar de voorpagina">
        Schrijfsite
      </Link>
      <p className="mast-sub">Het dagblad voor uw eigen handschrift — opgericht om pen en pixel te verenigen</p>
      <NavLinks user={user} />
    </header>
  );
}
