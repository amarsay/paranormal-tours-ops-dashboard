import { NextResponse } from "next/server";
import { assertWriteToken } from "./live-store";

export function requireWriteToken(req: Request): NextResponse | null {
  if (!process.env.OPS_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "OPS_WRITE_TOKEN is not configured on the server. Set it in the environment.",
        code: "write_token_not_configured",
      },
      { status: 503 }
    );
  }
  if (!assertWriteToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised", code: "unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Read a JSON object body. Errors (400, nothing applied):
 *   empty_body   — no body / whitespace only
 *   invalid_json — not parseable
 *   invalid_body — valid JSON but not an object (null, array, number, string, boolean)
 */
export async function readJsonObjectBody(
  req: Request
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const fail = (error: string, code: string) => ({
    ok: false as const,
    response: NextResponse.json({ error, code }, { status: 400 }),
  });
  let text: string;
  try {
    text = await req.text();
  } catch {
    return fail("Invalid JSON body", "invalid_json");
  }
  if (!text.trim()) return fail("Empty request body", "empty_body");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("Invalid JSON body", "invalid_json");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail("Request body must be a JSON object", "invalid_body");
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}
