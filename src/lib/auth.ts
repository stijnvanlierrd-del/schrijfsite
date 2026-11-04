import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { query, queryOne } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = "schrijf_sessie";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Een geldige dummy-hash, zodat inloggen met een onbekend e-mailadres even lang duurt. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(randomBytes(12).toString("hex"));
  return dummyHash;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [sha256(token), userId, expires]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  // Opruimen van verlopen sessies (goedkoop, af en toe).
  if (Math.random() < 0.05) await query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/** Leest de ingelogde gebruiker uit de sessiecookie (Server Components en Route Handlers). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const row = await queryOne<{ id: string; email: string; name: string; expires_at: Date | string }>(
    `SELECT u.id, u.email, u.name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) return null;
  // Verlengen wanneer de sessie over minder dan 15 dagen verloopt.
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() < 15 * 86400_000) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
    try {
      // Lukt alleen in Route Handlers; in Server Components gooit dit en verlengen we later.
      jar.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires,
      });
      await query("UPDATE sessions SET expires_at = $2 WHERE token_hash = $1", [sha256(token), expires]).catch(() => {});
    } catch {
      /* niets */
    }
  }
  return { id: row.id, email: row.email, name: row.name };
}

const MAX_FAILED_PER_EMAIL = 8;
const MAX_FAILED_PER_IP = 30;

export async function tooManyAttempts(email: string, ip: string): Promise<boolean> {
  const rows = await query<{ key: string; n: number }>(
    `SELECT key, count(*)::int AS n FROM login_attempts
      WHERE key = ANY($1::text[]) AND at > now() - interval '15 minutes'
      GROUP BY key`,
    [[`email:${email}`, `ip:${ip}`]],
  );
  for (const r of rows) {
    if (r.key.startsWith("email:") && r.n >= MAX_FAILED_PER_EMAIL) return true;
    if (r.key.startsWith("ip:") && r.n >= MAX_FAILED_PER_IP) return true;
  }
  return false;
}

export async function recordFailedAttempt(email: string, ip: string): Promise<void> {
  await query("INSERT INTO login_attempts (key) VALUES ($1), ($2)", [`email:${email}`, `ip:${ip}`]);
  if (Math.random() < 0.05) await query("DELETE FROM login_attempts WHERE at < now() - interval '1 day'").catch(() => {});
}

export async function clearAttempts(email: string): Promise<void> {
  await query("DELETE FROM login_attempts WHERE key = $1", [`email:${email}`]).catch(() => {});
}

/** Zoals getSessionUser, maar een databasefout levert `null` op (Next.js-interne signalen worden doorgegeven). */
export async function getSessionUserSafe(): Promise<SessionUser | null> {
  try {
    return await getSessionUser();
  } catch (err) {
    unstable_rethrow(err);
    console.error("Sessie lezen mislukt:", err);
    return null;
  }
}
