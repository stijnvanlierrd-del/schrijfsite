import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HandwritingEditor } from "@/components/HandwritingEditor";
import { getSessionUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export const metadata: Metadata = { title: "Handschrift" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HandwritingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opgeslagen?: string }>;
}) {
  const { id } = await params;
  const { opgeslagen } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/inloggen?volgende=/handschrift/${encodeURIComponent(id)}`);
  if (!UUID.test(id)) notFound();
  const hw = await queryOne<{ id: string }>("SELECT id FROM handwritings WHERE id = $1 AND user_id = $2", [id, user.id]);
  if (!hw) notFound();
  return (
    <div className="wrap">
      <HandwritingEditor id={hw.id} justSaved={opgeslagen === "1"} />
    </div>
  );
}
