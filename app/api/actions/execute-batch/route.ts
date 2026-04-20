import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import { executeBatch } from "@/lib/actions/executor";
import { ActionError } from "@/lib/actions/types";

export const runtime = "nodejs";

const Body = z.object({
  messageId: z.string().uuid(),
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

  try {
    const { steps } = await executeBatch(parsed.data.messageId, {
      userId: user.id,
      sessionId: null,
      messageId: parsed.data.messageId,
      orgId: null,
      supabase,
      getConnection: (orgId: string) => getSalesforceConnection(orgId, user.id),
    });
    return NextResponse.json({ steps });
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
