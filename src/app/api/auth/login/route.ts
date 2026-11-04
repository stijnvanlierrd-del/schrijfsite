import {
  clearAttempts,
  createSession,
  getDummyHash,
  recordFailedAttempt,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, clientIp, errorResponse, json, readJson, str } from "@/lib/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson(req, 10_000);
    const email = str(body.email, "e-mailadres", { min: 3, max: 200 }).toLowerCase();
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    const ip = clientIp(req);
    if (await tooManyAttempts(email, ip)) {
      throw new HttpError(429, "Te veel mislukte pogingen. Wacht een kwartier en probeer het opnieuw.");
    }
    const user = await queryOne<{ id: string; email: string; name: string; password_hash: string }>(
      "SELECT id, email, name, password_hash FROM users WHERE email = $1",
      [email],
    );
    const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !ok) {
      await recordFailedAttempt(email, ip);
      throw new HttpError(401, "Dat e-mailadres of wachtwoord klopt niet.");
    }
    await clearAttempts(email);
    await createSession(user.id);
    return json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    return errorResponse(err);
  }
}
