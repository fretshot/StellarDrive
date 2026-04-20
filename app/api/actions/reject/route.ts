import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
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

  const { previewId } = parsed.data;

  try {
    const admin = createSupabaseAdminClient();

    // Load and verify ownership + pending status
    const { data: preview, error: fetchError } = await admin
      .from("action_previews")
      .select("id, user_id, status, action_type")
      .eq("id", previewId)
      .single();

    if (fetchError || !preview) {
      throw new ActionError("auth", "preview_not_found", "Preview not found");
    }

    if (preview.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 401 });
    }

    if (preview.status !== "pending") {
      throw new ActionError(
        "validation",
        "preview_not_pending",
        `Preview is not pending (current status: ${preview.status})`,
      );
    }

    // Mark as rejected
    const { error: updateError } = await admin
      .from("action_previews")
      .update({ status: "rejected" })
      .eq("id", previewId);

    if (updateError) {
      throw new ActionError("internal", "update_failed", "Failed to reject preview", updateError);
    }

    await writeAudit({
      user_id: user.id,
      action_type: "preview.rejected",
      outcome: "success",
      entity_type: preview.action_type,
      metadata: { preview_id: previewId },
    });

    return NextResponse.json({ ok: true });
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
