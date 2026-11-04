import Link from "next/link";
import { Star } from "@/components/Ornaments";

export default function NotFound() {
  return (
    <div className="wrap" style={{ padding: "60px 0", textAlign: "center" }}>
      <span className="kicker">
        <Star /> Rectificatie
      </span>
      <h1 className="headline">Dit artikel bestaat niet</h1>
      <p className="lede">De pagina die u zoekt is niet (meer) te vinden, of hoort bij een ander account.</p>
      <Link className="btn btn--red" href="/">
        Naar de voorpagina
      </Link>
    </div>
  );
}
