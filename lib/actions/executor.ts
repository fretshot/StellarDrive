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
  batchIndex = 0,
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
      batch_index: batchIndex,
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

  const { data: exec, error: execInsertError } = await admin
    .from("action_executions")
    .insert({ preview_id: row.id, status: "running" })
    .select("id")
    .single();
  if (execInsertError || !exec) {
    throw new ActionError("internal", "exec_insert_failed", execInsertError?.message ?? "no row");
  }

  try {
    const result = await action.execute(parsedInput.data, ctx);
    await admin
      .from("action_executions")
      .update({ status: "succeeded", result, finished_at: new Date().toISOString() })
      .eq("id", exec.id);
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
      .eq("id", exec.id);
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

/**
 * Recursively replaces $ref:step[N].fieldPath tokens with values from
 * prior step results. Runs server-side at execute time only.
 */
export function resolveRefs(payload: unknown, results: unknown[]): unknown {
  if (typeof payload === "string") {
    const m = payload.match(/^\$ref:step\[(\d+)\]\.(.+)$/);
    if (m) {
      const stepResult = results[Number(m[1])];
      return m[2].split(".").reduce((o: unknown, k) => {
        if (o !== null && typeof o === "object") return (o as Record<string, unknown>)[k];
        return undefined;
      }, stepResult);
    }
  }
  if (Array.isArray(payload)) return payload.map((v) => resolveRefs(v, results));
  if (payload !== null && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).map(([k, v]) => [k, resolveRefs(v, results)]),
    );
  }
  return payload;
}

export interface BatchStepResult {
  previewId: string;
  status: "executed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

/**
 * Execute all pending previews for a message in batch_index order.
 * Resolves $ref tokens using prior step results. Stops on first failure.
 */
export async function executeBatch(
  messageId: string,
  ctx: ActionContext,
): Promise<{ steps: BatchStepResult[] }> {
  const admin = createSupabaseAdminClient();

  const { data: rows, error: rowsError } = await admin
    .from("action_previews")
    .select("id, user_id, org_id, action_type, payload, status, created_at")
    .eq("message_id", messageId)
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .order("batch_index", { ascending: true });

  if (rowsError) throw new ActionError("internal", "load_previews_failed", rowsError.message);
  if (!rows || rows.length === 0) return { steps: [] };

  const results: unknown[] = [];
  const steps: BatchStepResult[] = [];
  let failed = false;

  for (const row of rows) {
    if (failed) {
      await admin.from("action_previews").update({ status: "expired" }).eq("id", row.id);
      steps.push({ previewId: row.id, status: "skipped" });
      continue;
    }

    if (row.user_id !== ctx.userId) {
      await admin.from("action_previews").update({ status: "failed" }).eq("id", row.id);
      steps.push({ previewId: row.id, status: "failed", error: "Ownership check failed" });
      failed = true;
      continue;
    }

    if (Date.now() - new Date(row.created_at).getTime() > PREVIEW_TTL_MS) {
      await admin.from("action_previews").update({ status: "expired" }).eq("id", row.id);
      steps.push({ previewId: row.id, status: "failed", error: "Preview expired" });
      failed = true;
      continue;
    }

    const action = getAction(row.action_type);
    if (!action) {
      await admin.from("action_previews").update({ status: "failed" }).eq("id", row.id);
      steps.push({ previewId: row.id, status: "failed", error: `Unknown action: ${row.action_type}` });
      failed = true;
      continue;
    }

    const resolvedPayload = resolveRefs(row.payload, results);
    const parsedInput = action.input.safeParse(resolvedPayload);
    if (!parsedInput.success) {
      await admin.from("action_previews").update({ status: "failed" }).eq("id", row.id);
      steps.push({ previewId: row.id, status: "failed", error: "Input invalid after $ref resolution" });
      failed = true;
      continue;
    }

    const execCtx: ActionContext = { ...ctx, orgId: row.org_id };

    if (action.validate) {
      const v = await action.validate(parsedInput.data, execCtx);
      if (!v.ok) {
        await writeAudit({
          user_id: ctx.userId,
          org_id: row.org_id,
          action_type: "action.validation_failed",
          entity_type: action.name,
          outcome: "failure",
          metadata: { preview_id: row.id, issues: v.issues },
        });
        steps.push({ previewId: row.id, status: "failed", error: v.issues.map((i) => i.message).join(", ") });
        failed = true;
        continue;
      }
    }

    await admin
      .from("action_previews")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: exec, error: execInsertError } = await admin
      .from("action_executions")
      .insert({ preview_id: row.id, status: "running" })
      .select("id")
      .single();
    if (execInsertError || !exec) {
      await admin.from("action_previews").update({ status: "failed" }).eq("id", row.id);
      steps.push({ previewId: row.id, status: "failed", error: "Failed to create execution record" });
      failed = true;
      continue;
    }

    try {
      const result = await action.execute(parsedInput.data, execCtx);
      results.push(result);
      await admin
        .from("action_executions")
        .update({ status: "succeeded", result, finished_at: new Date().toISOString() })
        .eq("id", exec.id);
      await admin.from("action_previews").update({ status: "executed" }).eq("id", row.id);
      await writeAudit({
        user_id: ctx.userId,
        org_id: row.org_id,
        action_type: "action.executed",
        entity_type: action.name,
        outcome: "success",
        metadata: { preview_id: row.id, result },
      });
      steps.push({ previewId: row.id, status: "executed", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ error: message });
      await admin
        .from("action_executions")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", exec.id);
      await admin.from("action_previews").update({ status: "failed" }).eq("id", row.id);
      await writeAudit({
        user_id: ctx.userId,
        org_id: row.org_id,
        action_type: "action.executed",
        entity_type: action.name,
        outcome: "failure",
        metadata: { preview_id: row.id, error: message },
      });
      steps.push({ previewId: row.id, status: "failed", error: message });
      failed = true;
    }
  }

  return { steps };
}
