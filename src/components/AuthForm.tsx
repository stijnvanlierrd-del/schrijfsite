"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("volgende");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/studio";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? ""),
    };
    if (mode === "register" && body.password !== String(form.get("password2") ?? "")) {
      setError("De wachtwoorden zijn niet gelijk.");
      return;
    }
    setBusy(true);
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { body });
      router.push(target);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate={false}>
      {mode === "register" ? (
        <div className="field">
          <label htmlFor="name">Naam</label>
          <input className="input" id="name" name="name" autoComplete="name" maxLength={80} placeholder="Hoe mogen we u noemen?" />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="email">E-mailadres</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" inputMode="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Wachtwoord</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "register" ? <span className="hint">Minimaal 8 tekens.</span> : null}
      </div>
      {mode === "register" ? (
        <div className="field">
          <label htmlFor="password2">Herhaal wachtwoord</label>
          <input className="input" id="password2" name="password2" type="password" required minLength={8} autoComplete="new-password" />
        </div>
      ) : null}
      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn--red btn--block" type="submit" disabled={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        {mode === "login" ? "Inloggen" : "Account aanmaken"}
      </button>
      <p className="small" style={{ marginTop: 16, textAlign: "center" }}>
        {mode === "login" ? (
          <>
            Nog geen account? <Link href={`/registreren${next ? `?volgende=${encodeURIComponent(next)}` : ""}`}>Maak er gratis een</Link>.
          </>
        ) : (
          <>
            Al een account? <Link href={`/inloggen${next ? `?volgende=${encodeURIComponent(next)}` : ""}`}>Log in</Link>.
          </>
        )}
      </p>
    </form>
  );
}
