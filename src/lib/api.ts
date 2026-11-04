/** Kleine fetch-helper voor de browser met nette Nederlandse foutmeldingen. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("Geen verbinding met de server. Controleer je internet en probeer opnieuw.");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* geen JSON */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    if (res.status === 401) throw new Error(msg ?? "Je sessie is verlopen. Log opnieuw in.");
    if (res.status === 413) throw new Error(msg ?? "Het bestand is te groot.");
    throw new Error(msg ?? `Er ging iets mis (${res.status}).`);
  }
  return data as T;
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}
