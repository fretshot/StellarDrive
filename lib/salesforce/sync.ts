import "server-only";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import {
  describeObject,
  listApexClasses,
  listApexTriggers,
  listObjects,
  listWorkflowRules,
  readOrganization,
  type FieldSummary,
  type ObjectSummary,
  type TriggerSummary,
  type WorkflowRuleSummary,
} from "@/lib/salesforce/metadata";
import { normalizeOrgType } from "@/lib/salesforce/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

export type SyncKind = "objects" | "fields" | "classes" | "triggers" | "workflows" | "full";

/** Core SObjects we always describe in full when syncing "fields" or "full". */
const STANDARD_CORE = new Set([
  "Account",
  "Contact",
  "Lead",
  "Opportunity",
  "Case",
  "Task",
  "Event",
  "User",
  "Product2",
  "Campaign",
  "ContentDocument",
  "ContentVersion",
]);

const DESCRIBE_CONCURRENCY = 6;

export interface SyncResult {
  job_id: string;
  objects: number;
  fields: number;
  classes: number;
  triggers: number;
  workflows: number;
}

export async function runMetadataSync(params: {
  userId: string;
  orgId: string;
  kind: SyncKind;
}): Promise<SyncResult> {
  const { userId, orgId, kind } = params;
  const admin = createSupabaseAdminClient();

  const { data: job, error: jobErr } = await admin
    .from("metadata_sync_jobs")
    .insert({ org_id: orgId, kind, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(`failed to create sync job: ${jobErr?.message}`);

  await writeAudit({
    user_id: userId,
    org_id: orgId,
    action_type: "metadata.sync_started",
    outcome: "success",
    metadata: { kind, job_id: job.id },
  });

  const counts = { objects: 0, fields: 0, classes: 0, triggers: 0, workflows: 0 };

  try {
    const conn = await getSalesforceConnection(orgId, userId);

    // Keep org_type and sf_created_at accurate on every sync (cheap).
    try {
      const org = await readOrganization(conn);
      await admin
        .from("connected_salesforce_orgs")
        .update({
          org_type: normalizeOrgType(org.OrganizationType, org.IsSandbox),
          sf_created_at: org.CreatedDate,
        })
        .eq("id", orgId);
    } catch {
      // Non-fatal — sync can proceed without re-classifying.
    }

    if (kind === "objects" || kind === "full" || kind === "fields") {
      const objects = await listObjects(conn);
      await upsertObjects(admin, orgId, objects);
      counts.objects = objects.length;

      if (kind === "fields" || kind === "full") {
        const toDescribe = objects.filter(
          (o) => o.is_custom || STANDARD_CORE.has(o.api_name),
        );
        counts.fields = await syncFields(admin, orgId, conn, toDescribe);
      }
    }

    if (kind === "classes" || kind === "full") {
      const classes = await listApexClasses(conn);
      await upsertClasses(admin, orgId, classes);
      counts.classes = classes.length;
    }

    if (kind === "triggers" || kind === "full") {
      const triggers = await listApexTriggers(conn);
      await upsertTriggers(admin, orgId, triggers);
      counts.triggers = triggers.length;
    }

    if (kind === "workflows" || kind === "full") {
      const workflows = await listWorkflowRules(conn);
      await upsertWorkflows(admin, orgId, workflows);
      counts.workflows = workflows.length;
    }

    await admin
      .from("metadata_sync_jobs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    await admin
      .from("connected_salesforce_orgs")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", orgId);

    await writeAudit({
      user_id: userId,
      org_id: orgId,
      action_type: "metadata.sync_completed",
      outcome: "success",
      metadata: { kind, job_id: job.id, ...counts },
    });

    return { job_id: job.id, ...counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("metadata_sync_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    await admin
      .from("connected_salesforce_orgs")
      .update({ last_error: message })
      .eq("id", orgId);
    await writeAudit({
      user_id: userId,
      org_id: orgId,
      action_type: "metadata.sync_completed",
      outcome: "failure",
      metadata: { kind, job_id: job.id, error: message },
    });
    throw err;
  }
}

async function upsertObjects(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  objects: ObjectSummary[],
) {
  if (objects.length === 0) return;
  const now = new Date().toISOString();
  const rows = objects.map((o) => ({
    org_id: orgId,
    api_name: o.api_name,
    label: o.label,
    is_custom: o.is_custom,
    key_prefix: o.key_prefix,
    createable: o.createable,
    summary: o.summary,
    last_synced_at: now,
  }));
  // Chunk to stay under PostgREST size limits.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("salesforce_metadata_objects")
      .upsert(rows.slice(i, i + 500), { onConflict: "org_id,api_name" });
    if (error) throw new Error(`upsert objects: ${error.message}`);
  }
}

async function upsertClasses(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  classes: { api_name: string; api_version: string; status: string; body_hash: string; summary: Record<string, unknown> }[],
) {
  if (classes.length === 0) return;
  const now = new Date().toISOString();
  const rows = classes.map((c) => ({
    org_id: orgId,
    api_name: c.api_name,
    api_version: c.api_version,
    status: c.status,
    body_hash: c.body_hash,
    summary: c.summary,
    last_synced_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("salesforce_metadata_classes")
      .upsert(rows.slice(i, i + 500), { onConflict: "org_id,api_name" });
    if (error) throw new Error(`upsert classes: ${error.message}`);
  }
}

async function syncFields(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  conn: Awaited<ReturnType<typeof getSalesforceConnection>>,
  objects: ObjectSummary[],
): Promise<number> {
  if (objects.length === 0) return 0;

  // Map api_name -> row id so we can attach fields.
  const { data: existing } = await admin
    .from("salesforce_metadata_objects")
    .select("id, api_name")
    .eq("org_id", orgId);
  const byName = new Map<string, string>();
  for (const row of existing ?? []) byName.set(row.api_name, row.id);

  let total = 0;

  // Describe in chunks with bounded concurrency.
  for (let i = 0; i < objects.length; i += DESCRIBE_CONCURRENCY) {
    const chunk = objects.slice(i, i + DESCRIBE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (obj) => {
        try {
          const { fields } = await describeObject(conn, obj.api_name);
          return { obj, fields };
        } catch (err) {
          // Skip any object we can't describe (e.g. permission-gated).
          return { obj, fields: [] as FieldSummary[], error: err };
        }
      }),
    );

    const rows = [] as Array<Record<string, unknown>>;
    for (const { obj, fields } of results) {
      const objectId = byName.get(obj.api_name);
      if (!objectId) continue;
      for (const f of fields) {
        rows.push({
          org_id: orgId,
          object_id: objectId,
          api_name: f.api_name,
          label: f.label,
          data_type: f.data_type,
          is_required: f.is_required,
          is_custom: f.is_custom,
          reference_to: f.reference_to,
          summary: f.summary,
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await admin
        .from("salesforce_metadata_fields")
        .upsert(rows, { onConflict: "object_id,api_name" });
      if (error) throw new Error(`upsert fields: ${error.message}`);
      total += rows.length;
    }
  }

  return total;
}

async function upsertTriggers(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  triggers: TriggerSummary[],
) {
  if (triggers.length === 0) return;
  const now = new Date().toISOString();
  const rows = triggers.map((t) => ({
    org_id: orgId,
    api_name: t.api_name,
    object_name: t.object_name,
    status: t.status,
    events: t.events,
    last_synced_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("salesforce_metadata_triggers")
      .upsert(rows.slice(i, i + 500), { onConflict: "org_id,api_name" });
    if (error) throw new Error(`upsert triggers: ${error.message}`);
  }
}

async function upsertWorkflows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  workflows: WorkflowRuleSummary[],
) {
  if (workflows.length === 0) return;
  const now = new Date().toISOString();
  const rows = workflows.map((w) => ({
    org_id: orgId,
    api_name: w.api_name,
    object_name: w.object_name,
    active: w.active,
    last_synced_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("salesforce_metadata_workflows")
      .upsert(rows.slice(i, i + 500), { onConflict: "org_id,api_name" });
    if (error) throw new Error(`upsert workflows: ${error.message}`);
  }
}
