"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function NavLinks({ user }: { user: { name: string } | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const items = [
    { href: "/", label: "Voorpagina" },
    { href: "/sjabloon", label: "Sjabloon" },
    { href: "/studio", label: "Studio" },
    { href: "/schrijven", label: "Schrijven" },
  ];
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <nav className="mast-nav" aria-label="Hoofdmenu">
      {items.map((it, i) => (
        <span key={it.href} style={{ display: "contents" }}>
          {i > 0 ? (
            <span className="dot" aria-hidden="true">
              ✦
            </span>
          ) : null}
          <Link href={it.href} aria-current={current(it.href) ? "page" : undefined}>
            {it.label}
          </Link>
        </span>
      ))}
      <span className="dot" aria-hidden="true">
        ✦
      </span>
      {user ? (
        <>
          <span className="who">{user.name}</span>
          <button type="button" onClick={logout} disabled={busy}>
            Uitloggen
          </button>
        </>
      ) : (
        <>
          <Link href="/inloggen" aria-current={current("/inloggen") ? "page" : undefined}>
            Inloggen
          </Link>
          <Link href="/registreren" aria-current={current("/registreren") ? "page" : undefined}>
            Account maken
          </Link>
        </>
      )}
    </nav>
  );
}
