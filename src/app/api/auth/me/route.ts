import { getSessionUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";

export async function GET() {
  try {
    return json({ user: await getSessionUser() });
  } catch (err) {
    return errorResponse(err);
  }
}
