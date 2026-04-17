import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import { executePreview } from "@/lib/actions/executor";
import { ActionError } from "@/lib/actions/types";

export const runtime = "nodejs";

const Body = z.object({
  previewId: z.string().uuid(),
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
    const { result } = await executePreview(parsed.data.previewId, {
      userId: user.id,
      sessionId: null,
      messageId: null,
      orgId: null,
      supabase,
      getConnection: (orgId: string) => getSalesforceConnection(orgId, user.id),
    });
    return NextResponse.json({ result });
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
