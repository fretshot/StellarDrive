import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import { getAction } from "@/lib/actions/registry";
import { buildPreview } from "@/lib/actions/executor";
import { ActionError } from "@/lib/actions/types";

export const runtime = "nodejs";

const Body = z.object({
  actionName: z.string().min(1),
  input: z.unknown(),
  sessionId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  orgId: z.string().uuid().nullable(),
});

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

  const action = getAction(parsed.data.actionName);
  if (!action) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (action.readOnly) {
    return NextResponse.json({ error: "read-only actions do not use previews" }, { status: 400 });
  }

  const input = action.input.safeParse(parsed.data.input);
  if (!input.success) {
    return NextResponse.json({ error: "invalid input", issues: input.error.issues }, { status: 400 });
  }

  try {
    const { previewId, preview } = await buildPreview(action, input.data, {
      userId: user.id,
      sessionId: parsed.data.sessionId,
      messageId: parsed.data.messageId,
      orgId: parsed.data.orgId,
      supabase,
      getConnection: (orgId: string) => getSalesforceConnection(orgId, user.id),
    });
    return NextResponse.json({ previewId, preview });
  } catch (err) {
    if (err instanceof ActionError) {
      return NextResponse.json(
        { error: err.code, category: err.category, message: err.message, details: err.details },
        { status: 400 },
      );
    }
    throw err;
  }
}
