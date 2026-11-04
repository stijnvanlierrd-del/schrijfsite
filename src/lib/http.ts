import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: number | ResponseInit): NextResponse {
  const opts = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, {
    ...opts,
    headers: { "Cache-Control": "no-store", ...(opts?.headers ?? {}) },
  });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: "Er ging iets mis op de server. Probeer het opnieuw." }, 500);
}

/** Blokkeert cross-site schrijfverzoeken (CSRF-bescherming naast SameSite=Lax cookies). */
export function assertSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Verzoek van een andere website geweigerd.");
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Ongeldige herkomst.");
    }
    if (!host || originHost !== host) throw new HttpError(403, "Verzoek van een andere website geweigerd.");
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 1_000_000): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "Het verzoek is te groot.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Het verzoek is te groot.");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object") throw new Error();
    return value as T;
  } catch {
    throw new HttpError(400, "Ongeldige gegevens ontvangen.");
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Je bent niet ingelogd.");
  return user;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "onbekend").trim().slice(0, 64);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string): string {
  if (!UUID_RE.test(id)) throw new HttpError(404, "Niet gevonden.");
  return id.toLowerCase();
}

export function str(value: unknown, field: string, { min = 0, max = 200 } = {}): string {
  if (typeof value !== "string") throw new HttpError(400, `Veld '${field}' ontbreekt.`);
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `Veld '${field}' is te kort.`);
  if (v.length > max) throw new HttpError(400, `Veld '${field}' is te lang.`);
  return v;
}
