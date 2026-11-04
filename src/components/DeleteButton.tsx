"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export function DeleteButton({ url, confirmText, label = "Verwijderen", redirectTo }: { url: string; confirmText: string; label?: string; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        try {
          await api(url, { method: "DELETE" });
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        } catch (err) {
          window.alert((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
