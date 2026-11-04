import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Writer } from "@/components/Writer";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Schrijven" };
export const dynamic = "force-dynamic";

export default async function WritePage({ searchParams }: { searchParams: Promise<{ h?: string; d?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
    redirect(`/inloggen?volgende=${encodeURIComponent(`/schrijven${q ? `?${q}` : ""}`)}`);
  }
  return (
    <div className="wrap">
      <Writer initialHandwriting={sp.h ?? null} initialDocument={sp.d ?? null} />
    </div>
  );
}
