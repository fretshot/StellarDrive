import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AuditEvent {
  user_id: string;
  org_id?: string | null;
  action_type: string;
  entity_type?: string | null;
  entity_ref?: string | null;
  outcome: "success" | "failure" | "warning";
  metadata?: Record<string, unknown>;
}

/**
 * Appends an audit log row using the service-role client so writes succeed
 * regardless of the caller's RLS context.
 */
export async function writeAudit(event: AuditEvent) {
  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    user_id: event.user_id,
    org_id: event.org_id ?? null,
    action_type: event.action_type,
    entity_type: event.entity_type ?? null,
    entity_ref: event.entity_ref ?? null,
    outcome: event.outcome,
    metadata: event.metadata ?? {},
  });
}
