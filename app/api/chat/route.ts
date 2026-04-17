import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.string().uuid().nullable(),
  orgId: z.string().uuid().nullable(),
  message: z.string().min(1),
});

/**
 * Chat endpoint. Will stream Claude tool-use turns, dispatch read-only tools
 * inline, and persist mutating-action previews for user confirmation.
 *
 * TODO(milestone-7): implement the streaming tool-use loop using the
 * Anthropic SDK, lib/ai/tool-definitions.ts, and lib/actions/registry.ts.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  return NextResponse.json({ error: "not implemented (milestone-7)" }, { status: 501 });
}
