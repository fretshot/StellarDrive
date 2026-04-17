import "server-only";
import { ActionError, type ActionContext, type ActionDefinition } from "@/lib/actions/types";
import { getAction } from "@/lib/actions/registry";
import { writeAudit } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

/**
 * Build and persist a preview for a mutating action. Read-only actions do
 * not use this path — they run inline in the chat loop.
 */
export async function buildPreview<I>(
  action: ActionDefinition<I, unknown, unknown>,
  input: I,
  ctx: ActionContext,
): Promise<{ previewId: string; preview: unknown }> {
  if (action.readOnly) {
    throw new ActionError("internal", "preview_on_read_only", "Read-only actions do not produce previews");
  }
  if (!action.preview) {
    throw new ActionError("internal", "missing_preview", `Action ${action.name} has no preview()`);
  }

  const preview = await action.preview(input, ctx);
  const validation = action.validate ? await action.validate(input, ctx) : { ok: true as const };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("action_previews")
    .insert({
      user_id: ctx.userId,
      session_id: ctx.sessionId,
      message_id: ctx.messageId,
      org_id: ctx.orgId,
      action_type: action.name,
      payload: input,
      preview,
      validation,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new ActionError("internal", "preview_persist_failed", error?.message ?? "no row");
  }

  await writeAudit({
    user_id: ctx.userId,
    org_id: ctx.orgId,
    action_type: "preview.created",
    entity_type: action.name,
    outcome: validation.ok ? "success" : "warning",
    metadata: { preview_id: data.id, validation },
  });

  return { previewId: data.id, preview };
}

/**
 * Execute a previously-created preview. The only way mutating actions ever
 * actually mutate Salesforce.
 */
export async function executePreview(
  previewId: string,
  ctx: ActionContext,
): Promise<{ result: unknown }> {
  const admin = createSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("action_previews")
    .select("id, user_id, org_id, action_type, payload, status, created_at")
    .eq("id", previewId)
    .maybeSingle();
  if (error || !row) throw new ActionError("auth", "preview_not_found", "Preview not found");
  if (row.user_id !== ctx.userId) throw new ActionError("auth", "preview_not_owned", "Preview is not yours");
  if (row.status !== "pending") {
    throw new ActionError("validation", "preview_not_pending", `Preview status is ${row.status}`);
  }
  if (Date.now() - new Date(row.created_at).getTime() > PREVIEW_TTL_MS) {
    await admin.from("action_previews").update({ status: "expired" }).eq("id", row.id);
    throw new ActionError("validation", "preview_expired", "Preview expired");
  }

  const action = getAction(row.action_type);
  if (!action) throw new ActionError("internal", "unknown_action", row.action_type);

  const parsedInput = action.input.safeParse(row.payload);
  if (!parsedInput.success) {
    throw new ActionError("validation", "invalid_payload", "Stored payload failed schema", parsedInput.error.issues);
  }

  if (action.validate) {
    const v = await action.validate(parsedInput.data, ctx);
    if (!v.ok) {
      await writeAudit({
        user_id: ctx.userId,
        org_id: row.org_id,
        action_type: "action.validation_failed",
        entity_type: action.name,
        outcome: "failure",
        metadata: { preview_id: row.id, issues: v.issues },
      });
      throw new ActionError("validation", "revalidation_failed", "Validation failed at execute time", v.issues);
    }
  }

  await admin
    .from("action_previews")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", row.id);

  const { data: exec } = await admin
    .from("action_executions")
    .insert({ preview_id: row.id, status: "running" })
    .select("id")
    .single();

  try {
    const result = await action.execute(parsedInput.data, ctx);
    await admin
      .from("action_executions")
      .update({ status: "succeeded", result, finished_at: new Date().toISOString() })
      .eq("id", exec!.id);
    await admin.from("action_previews").update({ status: "executed" }).eq("id", row.id);
    await writeAudit({
      user_id: ctx.userId,
      org_id: row.org_id,
      action_type: "action.executed",
      entity_type: action.name,
      outcome: "success",
      metadata: { preview_id: row.id, result },
    });
    return { result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("action_executions")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", exec!.id);
    await admin.from("action_previews").update({ status: "failed" }).eq("id", row.id);
    await writeAudit({
      user_id: ctx.userId,
      org_id: row.org_id,
      action_type: "action.executed",
      entity_type: action.name,
      outcome: "failure",
      metadata: { preview_id: row.id, error: message },
    });
    throw err;
  }
}
