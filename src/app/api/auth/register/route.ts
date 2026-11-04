import { createSession, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, assertSameOrigin, clientIp, errorResponse, json, readJson, str } from "@/lib/http";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson(req, 10_000);
    const email = str(body.email, "e-mailadres", { min: 5, max: 200 }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Vul een geldig e-mailadres in.");
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8) throw new HttpError(400, "Kies een wachtwoord van minimaal 8 tekens.");
    if (password.length > 200) throw new HttpError(400, "Dat wachtwoord is te lang.");

    // Eenvoudige bescherming tegen massaal registreren vanaf één IP-adres.
    const ip = clientIp(req);
    const recent = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM login_attempts WHERE key = $1 AND at > now() - interval '1 hour'",
      [`reg:${ip}`],
    );
    if ((recent[0]?.n ?? 0) >= 10) throw new HttpError(429, "Te veel nieuwe accounts vanaf dit adres. Probeer het later opnieuw.");

    const hash = await hashPassword(password);
    const rows = await query<{ id: string; email: string; name: string }>(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, name`,
      [email, name, hash],
    );
    if (!rows[0]) throw new HttpError(409, "Er bestaat al een account met dit e-mailadres. Log in.");
    await query("INSERT INTO login_attempts (key) VALUES ($1)", [`reg:${ip}`]);
    await createSession(rows[0].id);
    return json({ user: rows[0] }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
