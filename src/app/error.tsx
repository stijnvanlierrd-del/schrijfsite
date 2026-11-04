"use client";

import { Star } from "@/components/Ornaments";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap" style={{ padding: "60px 0", textAlign: "center" }}>
      <span className="kicker">
        <Star /> Storing op de drukpers
      </span>
      <h1 className="headline">Er ging iets mis</h1>
      <p className="lede">Probeer het nog eens. Blijft het misgaan, kom dan straks terug.</p>
      <button className="btn btn--red" type="button" onClick={() => reset()}>
        Opnieuw proberen
      </button>
    </div>
  );
}
