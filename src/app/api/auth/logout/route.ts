import { destroySession } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await destroySession();
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
