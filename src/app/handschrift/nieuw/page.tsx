import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CaptureWizard } from "@/components/capture/CaptureWizard";
import { Star } from "@/components/Ornaments";
import { getSessionUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export const metadata: Metadata = { title: "Handschrift toevoegen" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewHandwritingPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/inloggen?volgende=${encodeURIComponent(h ? `/handschrift/nieuw?h=${h}` : "/handschrift/nieuw")}`);
  let hw: { id: string; name: string } | null = null;
  let chars: string[] = [];
  if (h && UUID.test(h)) {
    hw = await queryOne<{ id: string; name: string }>("SELECT id, name FROM handwritings WHERE id = $1 AND user_id = $2", [h, user.id]);
    if (hw) chars = (await query<{ ch: string }>("SELECT DISTINCT ch FROM glyphs WHERE handwriting_id = $1", [hw.id])).map((r) => r.ch);
  }
  return (
    <div className="wrap">
      <section style={{ padding: "34px 0 10px" }}>
        <span className="kicker">
          <Star /> {hw ? "Aanvulling" : "Nieuw handschrift"}
        </span>
        <h1 className="headline">{hw ? `Tekens toevoegen aan ‘${hw.name}’` : "Leg uw handschrift vast"}</h1>
        <p className="lede" style={{ maxWidth: 820, marginTop: 0 }}>
          Kies hoe u uw letters aanlevert. Alles wordt eerst in uw browser verwerkt; u controleert het resultaat voordat er iets
          wordt opgeslagen.
        </p>
      </section>
      <hr className="rule" style={{ marginBottom: 26 }} />
      <CaptureWizard handwritingId={hw?.id} handwritingName={hw?.name} existingChars={chars} />
    </div>
  );
}
