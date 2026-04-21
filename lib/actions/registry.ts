import "server-only";
import { z } from "zod";
import type { ActionDefinition } from "@/lib/actions/types";
import {
  createCustomField as sfCreateCustomField,
  createCustomObject as sfCreateCustomObject,
  createPermissionSet as sfCreatePermissionSet,
} from "@/lib/salesforce/metadata-deploy";
import {
  createRecord as sfCreateRecord,
  assignPermissionSet as sfAssignPermissionSet,
} from "@/lib/salesforce/records";

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

const searchPermissionSets: ActionDefinition<{ orgId: string; query: string }> = {
  name: "search_permission_sets",
  label: "Search permission sets",
  description:
    "Search Salesforce Permission Sets by Name or Label to get their Salesforce IDs (0PS…). " +
    "Use this whenever you need a permission set ID from a prior conversation turn and cannot use $ref. " +
    "Queries live Salesforce (not cached metadata).",
  readOnly: true,
  input: z.object({ orgId: z.string().uuid(), query: z.string().min(1) }).strict(),
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    const safe = input.query.replace(/'/g, "''");
    const result = await conn.query<{ Id: string; Name: string; Label: string }>(
      `SELECT Id, Name, Label FROM PermissionSet WHERE (Name LIKE '%${safe}%' OR Label LIKE '%${safe}%') AND IsCustom = true LIMIT 10`,
    );
    return result.records;
  },
};

const searchUsers: ActionDefinition<{ orgId: string; query: string }> = {
  name: "search_users",
  label: "Search users",
  description: "Search Salesforce Users by name to get their IDs. Use this before calling assign_permission_set. Queries live Salesforce (not cached metadata).",
  readOnly: true,
  input: z.object({ orgId: z.string().uuid(), query: z.string().min(1) }).strict(),
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    const safeQuery = input.query.replace(/'/g, "''");
    const result = await conn.query<{ Id: string; Name: string; Username: string }>(
      `SELECT Id, Name, Username FROM User WHERE Name LIKE '%${safeQuery}%' AND IsActive = true LIMIT 10`,
    );
    return result.records;
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
  description: "Create a single record on any standard or custom SObject.",
  readOnly: false,
  input: CreateRecordInput,
  async preview(input) {
    const keys = Object.keys(input.fields);
    return {
      actionType: "create_record",
      summary: `Create a new ${input.objectApiName} record with ${keys.length} field${keys.length === 1 ? "" : "s"}`,
      diff: `+ ${input.objectApiName}\n${keys.map((k) => `    ${k}: ${JSON.stringify(input.fields[k])}`).join("\n")}`,
      targets: [{ orgId: input.orgId, entity: input.objectApiName }],
      risks: ["Creates a new record visible to all users with access to this object."],
      payload: input,
    };
  },
  async validate(input, ctx) {
    const { data: obj } = await ctx.supabase
      .from("salesforce_metadata_objects")
      .select("createable")
      .eq("org_id", input.orgId)
      .eq("api_name", input.objectApiName)
      .maybeSingle();
    if (!obj) return { ok: false, issues: [{ path: "objectApiName", message: `Object ${input.objectApiName} not found in synced metadata` }] };
    if (!obj.createable) return { ok: false, issues: [{ path: "objectApiName", message: `Object ${input.objectApiName} is not createable` }] };
    return { ok: true };
  },
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    return sfCreateRecord(conn, { objectApiName: input.objectApiName, fields: input.fields });
  },
};

const CreateCustomFieldInput = z
  .object({
    orgId: z.string().uuid(),
    objectApiName: z.string().min(1),
    fieldApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*__c$/, "Must end with __c"),
    label: z.string().min(1).max(255),
    type: z.enum(["Text", "TextArea", "Checkbox", "Number", "Date", "DateTime", "Email", "Phone", "Url"]),
    length: z.number().int().min(1).max(255).optional(),
    required: z.boolean().optional(),
    description: z.string().max(1000).optional(),
  })
  .strict();

const createCustomField: ActionDefinition<z.infer<typeof CreateCustomFieldInput>> = {
  name: "create_custom_field",
  label: "Create custom field",
  description: "Create a custom field on an existing SObject via the Metadata API. Field API name must end with __c.",
  readOnly: false,
  input: CreateCustomFieldInput,
  async preview(input) {
    const risks: string[] = [];
    if (input.required) risks.push("Adding a required field may break existing record creation flows and page layouts.");
    else risks.push(`Adds a new ${input.type} field to all ${input.objectApiName} records.`);
    return {
      actionType: "create_custom_field",
      summary: `Create ${input.type} field ${input.fieldApiName} on ${input.objectApiName}`,
      diff: `+ ${input.objectApiName}.${input.fieldApiName} (${input.type}${input.length ? `(${input.length})` : ""})${input.required ? " [required]" : ""}`,
      targets: [{ orgId: input.orgId, entity: input.objectApiName }],
      risks,
      payload: input,
    };
  },
  async validate(input, ctx) {
    const { data: obj } = await ctx.supabase
      .from("salesforce_metadata_objects")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("api_name", input.objectApiName)
      .maybeSingle();
    if (!obj) return { ok: false, issues: [{ path: "objectApiName", message: `Object ${input.objectApiName} not found in synced metadata` }] };
    const { data: existing } = await ctx.supabase
      .from("salesforce_metadata_fields")
      .select("api_name")
      .eq("object_id", obj.id)
      .eq("api_name", input.fieldApiName)
      .maybeSingle();
    if (existing) return { ok: false, issues: [{ path: "fieldApiName", message: `Field ${input.fieldApiName} already exists on ${input.objectApiName}` }] };
    if (input.type === "Text" && !input.length) return { ok: false, issues: [{ path: "length", message: "Text fields require a length (1–255)" }] };
    return { ok: true };
  },
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    return sfCreateCustomField(conn, input);
  },
};

const CreateCustomObjectInput = z
  .object({
    orgId: z.string().uuid(),
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*__c$/, "Must end with __c"),
    label: z.string().min(1).max(255),
    pluralLabel: z.string().min(1).max(255),
    nameFieldLabel: z.string().max(255).optional(),
    description: z.string().max(1000).optional(),
  })
  .strict();

const createCustomObject: ActionDefinition<z.infer<typeof CreateCustomObjectInput>> = {
  name: "create_custom_object",
  label: "Create custom object",
  description: "Create a new custom SObject via the Metadata API. API name must end with __c.",
  readOnly: false,
  input: CreateCustomObjectInput,
  async preview(input) {
    return {
      actionType: "create_custom_object",
      summary: `Create custom object ${input.apiName} (${input.label})`,
      diff: `+ ${input.apiName}\n    Label: ${input.label}\n    Plural: ${input.pluralLabel}`,
      targets: [{ orgId: input.orgId, entity: input.apiName }],
      risks: ["Creates a new SObject visible to all users with appropriate permissions."],
      payload: input,
    };
  },
  async validate(input, ctx) {
    const { data: org } = await ctx.supabase
      .from("connected_salesforce_orgs")
      .select("status")
      .eq("id", input.orgId)
      .maybeSingle();
    if (!org) return { ok: false, issues: [{ path: "orgId", message: "Org not found" }] };
    if (org.status !== "active") return { ok: false, issues: [{ path: "orgId", message: "Org is not active" }] };
    return { ok: true };
  },
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    return sfCreateCustomObject(conn, input);
  },
};

const CreatePermissionSetInput = z
  .object({
    orgId: z.string().uuid(),
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Must be a valid API name (no __c suffix)"),
    label: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
  })
  .strict();

const createPermissionSet: ActionDefinition<z.infer<typeof CreatePermissionSetInput>> = {
  name: "create_permission_set",
  label: "Create permission set",
  description: "Create a new Permission Set via the Metadata API. Returns the Salesforce record ID needed for assignment.",
  readOnly: false,
  input: CreatePermissionSetInput,
  async preview(input) {
    return {
      actionType: "create_permission_set",
      summary: `Create Permission Set "${input.label}" (${input.apiName})`,
      diff: `+ PermissionSet: ${input.apiName}\n    Label: ${input.label}${input.description ? `\n    Description: ${input.description}` : ""}`,
      targets: [{ orgId: input.orgId, entity: "PermissionSet", label: input.label }],
      risks: ["Creates a new Permission Set with no permissions. Permissions and assignments must be configured separately."],
      payload: input,
    };
  },
  async validate(input, ctx) {
    const { data: org } = await ctx.supabase
      .from("connected_salesforce_orgs")
      .select("status")
      .eq("id", input.orgId)
      .maybeSingle();
    if (!org) return { ok: false, issues: [{ path: "orgId", message: "Org not found" }] };
    if (org.status !== "active") return { ok: false, issues: [{ path: "orgId", message: "Org is not active" }] };
    return { ok: true };
  },
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    return sfCreatePermissionSet(conn, {
      apiName: input.apiName,
      label: input.label,
      description: input.description,
    });
  },
};

const AssignPermissionSetInput = z
  .object({
    orgId: z.string().uuid(),
    permissionSetId: z.string().min(1),
    assigneeId: z.string().min(1),
  })
  .strict();

const assignPermissionSet: ActionDefinition<z.infer<typeof AssignPermissionSetInput>> = {
  name: "assign_permission_set",
  label: "Assign permission set",
  description: "Assign a Permission Set to a Salesforce user. permissionSetId may be a $ref token from a prior create_permission_set step.",
  readOnly: false,
  input: AssignPermissionSetInput,
  async preview(input) {
    const isRef = input.permissionSetId.startsWith("$ref:");
    return {
      actionType: "assign_permission_set",
      summary: `Assign permission set to user ${input.assigneeId}`,
      diff: `+ PermissionSetAssignment\n    PermissionSetId: ${isRef ? input.permissionSetId : input.permissionSetId}\n    AssigneeId: ${input.assigneeId}`,
      targets: [{ orgId: input.orgId, entity: "PermissionSetAssignment" }],
      risks: ["Grants the user all permissions defined in the permission set immediately upon execution."],
      payload: input,
    };
  },
  async validate(input, _ctx) {
    if (input.permissionSetId.startsWith("$ref:")) return { ok: true };
    if (!/^0PS[a-zA-Z0-9]{12,15}$/.test(input.permissionSetId)) {
      return { ok: false, issues: [{ path: "permissionSetId", message: "permissionSetId does not look like a valid PermissionSet ID" }] };
    }
    return { ok: true };
  },
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    return sfAssignPermissionSet(conn, {
      permissionSetId: input.permissionSetId,
      assigneeId: input.assigneeId,
    });
  },
};

// Registry + lookup

export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  searchPermissionSets,
  searchUsers,
  createRecord,
  createCustomField,
  createCustomObject,
  createPermissionSet,
  assignPermissionSet,
];

export function getAction(name: string): ActionDefinition<any, any, any> | undefined {
  return ACTIONS.find((a) => a.name === name);
}
