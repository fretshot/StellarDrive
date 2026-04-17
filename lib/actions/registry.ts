import "server-only";
import { z } from "zod";
import type { ActionDefinition } from "@/lib/actions/types";

/**
 * The AI tool registry. Each action declares its input schema, whether it
 * is read-only, and how to preview/validate/execute itself. The AI layer
 * never calls Salesforce directly — only via actions registered here.
 *
 * Phase 1: CREATE only. No update/delete tools exist.
 */

// ---------- Read-only ----------

const listConnectedOrgs: ActionDefinition<Record<string, never>> = {
  name: "list_connected_orgs",
  label: "List connected orgs",
  description: "Return the Salesforce orgs the user has connected to StellarDrive.",
  readOnly: true,
  input: z.object({}).strict(),
  async execute(_input, ctx) {
    const { data } = await ctx.supabase
      .from("connected_salesforce_orgs")
      .select("id, alias, display_name, org_type, instance_url, status, last_sync_at");
    return data ?? [];
  },
};

const describeObject: ActionDefinition<{ orgId: string; apiName: string }> = {
  name: "describe_object",
  label: "Describe object",
  description: "Return persisted describe data for an SObject in a connected org.",
  readOnly: true,
  input: z.object({ orgId: z.string().uuid(), apiName: z.string().min(1) }).strict(),
  async execute(input, ctx) {
    const { data } = await ctx.supabase
      .from("salesforce_metadata_objects")
      .select("api_name, label, is_custom, key_prefix, createable, summary, last_synced_at")
      .eq("org_id", input.orgId)
      .eq("api_name", input.apiName)
      .maybeSingle();
    return data;
  },
};

const listObjects: ActionDefinition<{ orgId: string; query?: string; limit?: number }> = {
  name: "list_objects",
  label: "List objects",
  description: "List SObjects in a connected org, optionally filtered by substring.",
  readOnly: true,
  input: z
    .object({
      orgId: z.string().uuid(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .strict(),
  async execute(input, ctx) {
    let q = ctx.supabase
      .from("salesforce_metadata_objects")
      .select("api_name, label, is_custom, createable")
      .eq("org_id", input.orgId)
      .order("api_name", { ascending: true })
      .limit(input.limit ?? 50);
    if (input.query) q = q.ilike("api_name", `%${input.query}%`);
    const { data } = await q;
    return data ?? [];
  },
};

const listFields: ActionDefinition<{ orgId: string; objectApiName: string }> = {
  name: "list_fields",
  label: "List fields",
  description: "List fields of an SObject in a connected org.",
  readOnly: true,
  input: z.object({ orgId: z.string().uuid(), objectApiName: z.string().min(1) }).strict(),
  async execute(input, ctx) {
    const { data: obj } = await ctx.supabase
      .from("salesforce_metadata_objects")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("api_name", input.objectApiName)
      .maybeSingle();
    if (!obj) return [];
    const { data } = await ctx.supabase
      .from("salesforce_metadata_fields")
      .select("api_name, label, data_type, is_required, is_custom, reference_to")
      .eq("object_id", obj.id)
      .order("api_name", { ascending: true });
    return data ?? [];
  },
};

const listApexClasses: ActionDefinition<{ orgId: string; query?: string }> = {
  name: "list_apex_classes",
  label: "List Apex classes",
  description: "List Apex classes in a connected org.",
  readOnly: true,
  input: z.object({ orgId: z.string().uuid(), query: z.string().optional() }).strict(),
  async execute(input, ctx) {
    let q = ctx.supabase
      .from("salesforce_metadata_classes")
      .select("api_name, api_version, status, last_synced_at")
      .eq("org_id", input.orgId)
      .order("api_name", { ascending: true })
      .limit(100);
    if (input.query) q = q.ilike("api_name", `%${input.query}%`);
    const { data } = await q;
    return data ?? [];
  },
};

// ---------- Mutating ----------

const CreateRecordInput = z
  .object({
    orgId: z.string().uuid(),
    objectApiName: z.string().min(1),
    fields: z.record(z.string(), z.unknown()),
  })
  .strict();

const createRecord: ActionDefinition<z.infer<typeof CreateRecordInput>> = {
  name: "create_record",
  label: "Create record",
  description: "Create a single record on a standard or custom SObject.",
  readOnly: false,
  input: CreateRecordInput,
  async preview(input) {
    const keys = Object.keys(input.fields);
    return {
      actionType: "create_record",
      summary: `Create a new ${input.objectApiName} record with ${keys.length} fields`,
      diff: `+ ${input.objectApiName}\n${keys.map((k) => `    ${k}: ${JSON.stringify(input.fields[k])}`).join("\n")}`,
      targets: [{ orgId: input.orgId, entity: input.objectApiName }],
      risks: [
        "Creates a new record that will be visible to all users with access to this object.",
      ],
      payload: input,
    };
  },
  async validate(_input, _ctx) {
    // TODO(milestone-8): verify object exists + is createable + required fields present.
    return { ok: true };
  },
  async execute(_input, _ctx) {
    // TODO(milestone-8): call lib/salesforce/records.ts createRecord() via ctx.getConnection(orgId).
    throw new Error("create_record not implemented yet (milestone-8)");
  },
};

// Registry + lookup

export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  createRecord,
  // TODO(milestone-8): create_custom_field, create_custom_object, create_permission_set, assign_permission_set
];

export function getAction(name: string): ActionDefinition<any, any, any> | undefined {
  return ACTIONS.find((a) => a.name === name);
}
