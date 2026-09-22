import { NextResponse } from "next/server";
import { assertWriteToken } from "./live-store";

export function requireWriteToken(req: Request): NextResponse | null {
  if (!process.env.OPS_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "OPS_WRITE_TOKEN is not configured on the server. Set it in the environment.",
      },
      { status: 503 }
    );
  }
  if (!assertWriteToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return null;
}
