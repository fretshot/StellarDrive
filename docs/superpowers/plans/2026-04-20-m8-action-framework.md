# M8 — Action Framework + Mutating Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the full batch preview → confirm → execute pipeline so Claude can propose CREATE actions (custom fields, objects, permission sets, records, PS assignments), the user confirms once, and the server executes in dependency order with `$ref` token resolution.

**Architecture:** Mutating tools in `buildAiSdkTools` call `buildPreview()` and return `{ previewId, batchIndex, messageId, preview }` instead of executing. Previews sharing a `message_id` form an ordered batch. `POST /api/actions/execute-batch` resolves `$ref:step[N].fieldPath` tokens against prior step results, then executes sequentially, stopping on first failure.

**Tech Stack:** Next.js 15 App Router, AI SDK v6, jsforce (Metadata API + SObject DML), Supabase (Postgres + RLS), Zod, Tailwind CSS.

---

## File Map

**Create:**
- `supabase/migrations/0002_m8_batch_index.sql` — adds `batch_index` column to `action_previews`
- `app/api/actions/execute-batch/route.ts` — batch execute endpoint
- `app/api/actions/reject/route.ts` — single preview reject endpoint
- `components/chat/batch-preview-group.tsx` — confirm/reject UI for a batch of previews

**Modify:**
- `lib/salesforce/records.ts` — implement `createRecord`, `assignPermissionSet`
- `lib/salesforce/metadata-deploy.ts` — implement `createCustomField`, `createCustomObject`, `createPermissionSet`
- `lib/actions/executor.ts` — update `buildPreview` signature, add `resolveRefs`, add `executeBatch`
- `lib/actions/registry.ts` — wire `create_record`; add `create_custom_field`, `create_custom_object`, `create_permission_set`, `assign_permission_set`, `search_users`
- `lib/ai/tool-definitions.ts` — mutating tool closures call `buildPreview` instead of `action.execute`
- `lib/ai/system-prompt.ts` — append `$ref` instructions (rule 8)
- `components/chat/action-preview-card.tsx` — strip confirm/reject buttons, make display-only
- `components/chat/message-list.tsx` — detect `previewId` in tool outputs, render `BatchPreviewGroup`
- `types/database.ts` — regenerate after migration

---

## Task 1: DB Migration — add `batch_index` to `action_previews`

**Files:**
- Create: `supabase/migrations/0002_m8_batch_index.sql`
- Modify: `types/database.ts` (regenerate)

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0002_m8_batch_index.sql
ALTER TABLE action_previews
  ADD COLUMN batch_index integer NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply the migration**

Run against your local Supabase dev instance:
```bash
npx supabase db push
```
Expected: migration applies with no errors. If using remote dev: run the SQL directly in the Supabase dashboard SQL editor.

- [ ] **Step 3: Regenerate types**

```bash
npx supabase gen types typescript --local > types/database.ts
```
Expected: `types/database.ts` updated; the `action_previews` row type now includes `batch_index: number`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 2: Implement `lib/salesforce/records.ts`

**Files:**
- Modify: `lib/salesforce/records.ts`

- [ ] **Step 1: Replace the stub implementations**

Replace the entire file content with:

```ts
import "server-only";
import type { Connection } from "jsforce";

export interface CreateRecordInput {
  objectApiName: string;
  fields: Record<string, unknown>;
}

export async function createRecord(conn: Connection, input: CreateRecordInput) {
  const result = await conn.sobject(input.objectApiName).create(input.fields as Record<string, unknown>);
  if (Array.isArray(result)) throw new Error("Unexpected bulk result from createRecord");
  if (!result.success) {
    const errors = (result as any).errors as Array<{ message: string }> | undefined;
    throw new Error(errors?.map((e) => e.message).join("; ") || "SObject create failed");
  }
  return { id: result.id as string, success: true };
}

export interface AssignPermissionSetInput {
  permissionSetId: string;
  assigneeId: string;
}

export async function assignPermissionSet(conn: Connection, input: AssignPermissionSetInput) {
  const result = await conn.sobject("PermissionSetAssignment").create({
    PermissionSetId: input.permissionSetId,
    AssigneeId: input.assigneeId,
  });
  if (Array.isArray(result)) throw new Error("Unexpected bulk result from assignPermissionSet");
  if (!result.success) {
    const errors = (result as any).errors as Array<{ message: string }> | undefined;
    throw new Error(errors?.map((e) => e.message).join("; ") || "PermissionSetAssignment create failed");
  }
  return { id: result.id as string, success: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 3: Implement `lib/salesforce/metadata-deploy.ts`

**Files:**
- Modify: `lib/salesforce/metadata-deploy.ts`

- [ ] **Step 1: Replace the stub implementations**

Replace the entire file content with:

```ts
import "server-only";
import type { Connection } from "jsforce";

// ── helpers ──────────────────────────────────────────────────────────────────

function extractErrors(r: { success: boolean; errors?: unknown }): string {
  if (!r.errors) return "Metadata deploy failed";
  const errs = Array.isArray(r.errors) ? r.errors : [r.errors];
  return (errs as Array<{ message?: string }>).map((e) => e.message ?? String(e)).join("; ");
}

// ── createCustomField ────────────────────────────────────────────────────────

export interface CreateCustomFieldInput {
  objectApiName: string;
  fieldApiName: string;
  label: string;
  type: "Text" | "TextArea" | "Checkbox" | "Number" | "Date" | "DateTime" | "Email" | "Phone" | "Url";
  length?: number;
  required?: boolean;
  description?: string;
}

export async function createCustomField(conn: Connection, input: CreateCustomFieldInput) {
  const result = await (conn.metadata.create as Function)("CustomField", {
    fullName: `${input.objectApiName}.${input.fieldApiName}`,
    label: input.label,
    type: input.type,
    ...(input.length !== undefined ? { length: input.length } : {}),
    required: input.required ?? false,
    ...(input.description ? { description: input.description } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));
  return { fullName: r.fullName as string, success: true };
}

// ── createCustomObject ───────────────────────────────────────────────────────

export interface CreateCustomObjectInput {
  apiName: string;
  label: string;
  pluralLabel: string;
  nameFieldLabel?: string;
  description?: string;
}

export async function createCustomObject(conn: Connection, input: CreateCustomObjectInput) {
  const result = await (conn.metadata.create as Function)("CustomObject", {
    fullName: input.apiName,
    label: input.label,
    pluralLabel: input.pluralLabel,
    nameField: { type: "Text", label: input.nameFieldLabel ?? "Name" },
    deploymentStatus: "Deployed",
    sharingModel: "ReadWrite",
    ...(input.description ? { description: input.description } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));
  return { fullName: r.fullName as string, success: true };
}

// ── createPermissionSet ──────────────────────────────────────────────────────

export interface CreatePermissionSetInput {
  apiName: string;
  label: string;
  description?: string;
}

export async function createPermissionSet(conn: Connection, input: CreatePermissionSetInput) {
  const result = await (conn.metadata.create as Function)("PermissionSet", {
    fullName: input.apiName,
    label: input.label,
    ...(input.description ? { description: input.description } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));

  // Metadata API does not return the record ID — query it by Name
  const soql = await conn.query<{ Id: string }>(
    `SELECT Id FROM PermissionSet WHERE Name = '${input.apiName.replace(/'/g, "\\'")}' LIMIT 1`,
  );
  const id = soql.records[0]?.Id;
  if (!id) throw new Error("PermissionSet created but could not retrieve its Salesforce ID");
  return { id, fullName: r.fullName as string, success: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors (jsforce's `metadata.create` is typed loosely; the `Function` cast avoids overload noise).

---

## Task 4: Update `lib/actions/executor.ts` — `buildPreview` + `resolveRefs` + `executeBatch`

**Files:**
- Modify: `lib/actions/executor.ts`

- [ ] **Step 1: Update `buildPreview` to accept `batchIndex`**

Change the function signature and the `.insert(...)` call:

```ts
// Old signature:
export async function buildPreview<I>(
  action: ActionDefinition<I, unknown, unknown>,
  input: I,
  ctx: ActionContext,
): Promise<{ previewId: string; preview: unknown }>

// New signature (add batchIndex param):
export async function buildPreview<I>(
  action: ActionDefinition<I, unknown, unknown>,
  input: I,
  ctx: ActionContext,
  batchIndex = 0,
): Promise<{ previewId: string; preview: unknown }>
```

In the `.insert({...})` block inside `buildPreview`, add `batch_index: batchIndex`:

```ts
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
      batch_index: batchIndex,   // ← add this line
    })
    .select("id")
    .single();
```

- [ ] **Step 2: Add `resolveRefs` utility (append to executor.ts)**

Add this function after the existing `executePreview` export:

```ts
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
```

- [ ] **Step 3: Add `executeBatch` function (append to executor.ts)**

```ts
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

  const { data: rows } = await admin
    .from("action_previews")
    .select("id, user_id, org_id, action_type, payload, status, created_at")
    .eq("message_id", messageId)
    .eq("status", "pending")
    .order("batch_index", { ascending: true });

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
      steps.push({ previewId: row.id, status: "failed", error: `Unknown action: ${row.action_type}` });
      failed = true;
      continue;
    }

    const resolvedPayload = resolveRefs(row.payload, results);
    const parsedInput = action.input.safeParse(resolvedPayload);
    if (!parsedInput.success) {
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

    const { data: exec } = await admin
      .from("action_executions")
      .insert({ preview_id: row.id, status: "running" })
      .select("id")
      .single();

    try {
      const result = await action.execute(parsedInput.data, execCtx);
      results.push(result);
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
      steps.push({ previewId: row.id, status: "executed", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ error: message });
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
      steps.push({ previewId: row.id, status: "failed", error: message });
      failed = true;
    }
  }

  return { steps };
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 5: Registry — wire `create_record`

**Files:**
- Modify: `lib/actions/registry.ts`

- [ ] **Step 1: Add import for records module at top of file**

After the existing imports, add:

```ts
import { createRecord as sfCreateRecord } from "@/lib/salesforce/records";
```

- [ ] **Step 2: Replace the `createRecord` action definition**

Find the existing `createRecord` const and replace it entirely with:

```ts
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
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 6: Registry — add `create_custom_field`

**Files:**
- Modify: `lib/actions/registry.ts`

- [ ] **Step 1: Add import for metadata-deploy**

Add to imports at top of registry.ts:

```ts
import {
  createCustomField as sfCreateCustomField,
  createCustomObject as sfCreateCustomObject,
  createPermissionSet as sfCreatePermissionSet,
} from "@/lib/salesforce/metadata-deploy";
```

- [ ] **Step 2: Add the `createCustomField` action definition** (before the registry array at the bottom)

```ts
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
```

- [ ] **Step 3: Add `createCustomField` to the `ACTIONS` array**

In the `ACTIONS` array at the bottom, add `createCustomField` alongside `createRecord`:

```ts
export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  createRecord,
  createCustomField,   // ← add
];
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 7: Registry — add `create_custom_object`

**Files:**
- Modify: `lib/actions/registry.ts`

- [ ] **Step 1: Add the `createCustomObject` action definition** (after `createCustomField`)

```ts
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
      risks: ["Creates a new SObject visible to all users with appropriate permissions. A tab may need to be created separately."],
      payload: input,
    };
  },
  async validate(input, ctx) {
    // Verify org is active
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
```

- [ ] **Step 2: Add `createCustomObject` to the `ACTIONS` array**

```ts
export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  createRecord,
  createCustomField,
  createCustomObject,   // ← add
];
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 8: Registry — add `create_permission_set`

**Files:**
- Modify: `lib/actions/registry.ts`

- [ ] **Step 1: Add the `createPermissionSet` action definition** (after `createCustomObject`)

```ts
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
    // Returns { id, fullName, success } — id is used by $ref:step[N].id in assign_permission_set
    return sfCreatePermissionSet(conn, {
      apiName: input.apiName,
      label: input.label,
      description: input.description,
    });
  },
};
```

- [ ] **Step 2: Add `createPermissionSet` to `ACTIONS`**

```ts
export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  createRecord,
  createCustomField,
  createCustomObject,
  createPermissionSet,   // ← add
];
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 9: Registry — add `assign_permission_set`

**Files:**
- Modify: `lib/actions/registry.ts`

- [ ] **Step 1: Add import for `assignPermissionSet` from records module**

Update the existing records import (added in Task 5) to also include `assignPermissionSet`:

```ts
import {
  createRecord as sfCreateRecord,
  assignPermissionSet as sfAssignPermissionSet,
} from "@/lib/salesforce/records";
```

- [ ] **Step 2: Add the `assignPermissionSet` action definition** (after `createPermissionSet`)

```ts
const AssignPermissionSetInput = z
  .object({
    orgId: z.string().uuid(),
    permissionSetId: z.string().min(1),  // Salesforce record ID or $ref:step[N].id
    assigneeId: z.string().min(1),        // Salesforce User ID (15 or 18 chars)
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
    // $ref tokens are valid at preview time; they resolve at execute time
    if (input.permissionSetId.startsWith("$ref:")) return { ok: true };
    // Basic Salesforce ID length check (15 or 18 chars, starts with 0PS)
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
```

- [ ] **Step 3: Add `assignPermissionSet` to `ACTIONS`**

```ts
export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  createRecord,
  createCustomField,
  createCustomObject,
  createPermissionSet,
  assignPermissionSet,   // ← add
];
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 10: Registry — add `search_users`

**Files:**
- Modify: `lib/actions/registry.ts`

- [ ] **Step 1: Add the `searchUsers` action definition** (in the read-only section, after `listApexClasses`)

```ts
const searchUsers: ActionDefinition<{ orgId: string; query: string }> = {
  name: "search_users",
  label: "Search users",
  description: "Search Salesforce Users by name. Use this to find a user's ID before calling assign_permission_set. Queries live Salesforce (not cached metadata).",
  readOnly: true,
  input: z.object({ orgId: z.string().uuid(), query: z.string().min(1) }).strict(),
  async execute(input, ctx) {
    const conn = await ctx.getConnection(input.orgId);
    const safeQuery = input.query.replace(/'/g, "\\'");
    const result = await conn.query<{ Id: string; Name: string; Username: string }>(
      `SELECT Id, Name, Username FROM User WHERE Name LIKE '%${safeQuery}%' AND IsActive = true LIMIT 10`,
    );
    return result.records;
  },
};
```

- [ ] **Step 2: Add `searchUsers` to `ACTIONS`** (in the read-only section)

```ts
export const ACTIONS: ActionDefinition<any, any, any>[] = [
  listConnectedOrgs,
  describeObject,
  listObjects,
  listFields,
  listApexClasses,
  searchUsers,          // ← add (read-only section)
  createRecord,
  createCustomField,
  createCustomObject,
  createPermissionSet,
  assignPermissionSet,
];
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 11: Update `lib/ai/tool-definitions.ts` — mutating tools return preview

**Files:**
- Modify: `lib/ai/tool-definitions.ts`

- [ ] **Step 1: Add import for `buildPreview`**

```ts
import { buildPreview } from "@/lib/actions/executor";
```

- [ ] **Step 2: Replace `buildAiSdkTools` implementation**

Replace the entire `buildAiSdkTools` function with:

```ts
/**
 * AI SDK format: returns a tools record for use with streamText.
 * readOnly=true filters to read-only tools only.
 * ctx is bound into each tool's execute closure.
 *
 * Mutating tools: execute closure calls buildPreview() and returns
 * { previewId, batchIndex, messageId, preview } — NOT a Salesforce result.
 * The user must confirm via POST /api/actions/execute-batch before anything executes.
 */
export function buildAiSdkTools(readOnly: boolean, ctx: ActionContext) {
  let batchIndex = 0;

  return Object.fromEntries(
    ACTIONS
      .filter((a) => !readOnly || a.readOnly)
      .map((action) => [
        action.name,
        tool({
          description: action.description,
          inputSchema: action.input,
          execute: async (input: unknown) => {
            if (action.readOnly) {
              try {
                return await action.execute(input, ctx);
              } catch (err) {
                return { error: err instanceof Error ? err.message : String(err) };
              }
            }
            // Mutating: persist preview, return preview metadata to Claude
            try {
              const index = batchIndex++;
              const { previewId, preview } = await buildPreview(action, input as any, ctx, index);
              return { previewId, batchIndex: index, messageId: ctx.messageId, preview };
            } catch (err) {
              return { error: err instanceof Error ? err.message : String(err) };
            }
          },
        }),
      ]),
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 12: Update `lib/ai/system-prompt.ts` — add `$ref` instructions

**Files:**
- Modify: `lib/ai/system-prompt.ts`

- [ ] **Step 1: Append rule 8 to `SYSTEM_PROMPT`**

The current prompt ends with rule 7. Add rule 8 before the closing backtick:

```ts
export const SYSTEM_PROMPT = `You are StellarDrive, an assistant that helps Salesforce administrators analyze and manage their connected orgs.

Rules — these are non-negotiable:

1. You may only call tools that exist in the provided tool list. Do not invent tools or fabricate tool names.
2. StellarDrive supports CREATE operations only. Update and delete operations do not exist in this system. If asked, explain the limitation.
3. For any tool that is NOT read-only, your call produces a PREVIEW. The system will then ask the user to confirm. Do not claim an action has succeeded until you receive a success tool_result confirming execution.
4. Prefer calling read-only tools to gather facts before proposing a mutating action. Never guess at object or field API names — look them up.
5. When the user asks about "my orgs" or "my metadata", use the corresponding read-only tools instead of speculating.
6. Keep answers concise and actionable. When you propose a mutating action, explain what it will do and what the user should verify.
7. If a tool call fails, surface the error to the user plainly and suggest how to fix it.
8. When one mutating action depends on output from a prior mutating action in the same turn (e.g. assigning a permission set you just created), use \`$ref:step[N].fieldPath\` as the field value, where N is the zero-based index of the prior tool call in this turn. Example: if create_permission_set is your first mutating call (index 0) and its result has an \`id\` field, pass \`"$ref:step[0].id"\` as permissionSetId in assign_permission_set.
`;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 13: Create `app/api/actions/execute-batch/route.ts`

**Files:**
- Create: `app/api/actions/execute-batch/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import { executeBatch } from "@/lib/actions/executor";
import { ActionError } from "@/lib/actions/types";

export const runtime = "nodejs";

const Body = z.object({ messageId: z.string().uuid() });

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

  const ctx = {
    userId: user.id,
    sessionId: null,
    messageId: parsed.data.messageId,
    orgId: null,
    supabase,
    getConnection: (orgId: string) => getSalesforceConnection(orgId, user.id),
  };

  try {
    const result = await executeBatch(parsed.data.messageId, ctx);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ActionError) {
      return NextResponse.json(
        { error: err.code, category: err.category, message: err.message },
        { status: 400 },
      );
    }
    throw err;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 14: Create `app/api/actions/reject/route.ts`

**Files:**
- Create: `app/api/actions/reject/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const Body = z.object({ previewId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("action_previews")
    .select("id, user_id, org_id, action_type, status")
    .eq("id", parsed.data.previewId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (row.status !== "pending") {
    return NextResponse.json({ error: "preview is not pending", status: row.status }, { status: 400 });
  }

  await admin.from("action_previews").update({ status: "rejected" }).eq("id", row.id);
  await writeAudit({
    user_id: user.id,
    org_id: row.org_id,
    action_type: "preview.rejected",
    entity_type: row.action_type,
    outcome: "success",
    metadata: { preview_id: row.id },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 15: Update `components/chat/action-preview-card.tsx` — display-only

**Files:**
- Modify: `components/chat/action-preview-card.tsx`

- [ ] **Step 1: Strip confirm/reject buttons and fetch logic, keep only display**

Replace the entire file with:

```tsx
"use client";

interface ActionPreviewProps {
  preview: {
    summary: string;
    diff?: string;
    risks: string[];
    targets?: Array<{ orgId: string; entity: string; label?: string }>;
  };
}

export function ActionPreviewCard({ preview }: ActionPreviewProps) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
      <div className="font-medium text-amber-900 dark:text-amber-200">{preview.summary}</div>
      {preview.diff ? (
        <pre className="mt-2 overflow-x-auto rounded bg-white/70 p-2 text-xs dark:bg-neutral-900/50">
          {preview.diff}
        </pre>
      ) : null}
      {preview.risks.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-300">
          {preview.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors (if something imported the old `onResolved` prop elsewhere, fix those call sites).

---

## Task 16: Create `components/chat/batch-preview-group.tsx`

**Files:**
- Create: `components/chat/batch-preview-group.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { useState } from "react";
import { ActionPreviewCard } from "@/components/chat/action-preview-card";

interface ActionPreviewData {
  summary: string;
  diff?: string;
  risks: string[];
  targets?: Array<{ orgId: string; entity: string; label?: string }>;
}

interface PreviewItem {
  previewId: string;
  batchIndex: number;
  preview: ActionPreviewData;
}

interface BatchStepResult {
  previewId: string;
  status: "executed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

interface BatchPreviewGroupProps {
  previews: PreviewItem[];
  messageId: string;
  onResolved?: (outcome: "executed" | "rejected", steps?: BatchStepResult[]) => void;
}

export function BatchPreviewGroup({ previews, messageId, onResolved }: BatchPreviewGroupProps) {
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<BatchStepResult[] | null>(null);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...previews].sort((a, b) => a.batchIndex - b.batchIndex);

  async function confirmAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions/execute-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const body = (await res.json()) as { steps?: BatchStepResult[]; error?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      const resultSteps = body.steps ?? [];
      setSteps(resultSteps);
      setResolved(true);
      onResolved?.("executed", resultSteps);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rejectAll() {
    setBusy(true);
    setError(null);
    try {
      for (const item of sorted) {
        await fetch("/api/actions/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewId: item.previewId }),
        });
      }
      setResolved(true);
      onResolved?.("rejected");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {sorted.map((item, i) => {
        const stepResult = steps?.find((s) => s.previewId === item.previewId);
        return (
          <div key={item.previewId}>
            <ActionPreviewCard preview={item.preview} />
            {stepResult && (
              <div
                className={`mt-1 text-xs ${
                  stepResult.status === "executed"
                    ? "text-green-600 dark:text-green-400"
                    : stepResult.status === "skipped"
                      ? "text-neutral-500"
                      : "text-red-600 dark:text-red-400"
                }`}
              >
                {stepResult.status === "executed" && `✓ Step ${i + 1} complete`}
                {stepResult.status === "failed" && `✗ Step ${i + 1}: ${stepResult.error}`}
                {stepResult.status === "skipped" && `— Step ${i + 1} skipped (prior step failed)`}
              </div>
            )}
          </div>
        );
      })}

      {!resolved && (
        <div className="mt-1 flex gap-2">
          <button
            onClick={confirmAll}
            disabled={busy}
            className="rounded bg-amber-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 hover:bg-amber-800"
          >
            {busy ? "Running…" : `Confirm all (${sorted.length})`}
          </button>
          <button
            onClick={rejectAll}
            disabled={busy}
            className="rounded border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700 disabled:opacity-50"
          >
            Reject all
          </button>
        </div>
      )}

      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 17: Update `components/chat/message-list.tsx` — render `BatchPreviewGroup`

**Files:**
- Modify: `components/chat/message-list.tsx`

- [ ] **Step 1: Add import for `BatchPreviewGroup`**

At the top of message-list.tsx, add:

```tsx
import { BatchPreviewGroup } from "@/components/chat/batch-preview-group";
```

- [ ] **Step 2: Replace the `ToolRows` function**

Replace the entire `ToolRows` function with:

```tsx
interface PreviewToolOutput {
  previewId: string;
  batchIndex: number;
  messageId: string | null;
  preview: {
    summary: string;
    diff?: string;
    risks: string[];
    targets?: Array<{ orgId: string; entity: string; label?: string }>;
  };
}

function isPreviewOutput(output: unknown): output is PreviewToolOutput {
  return (
    output !== null &&
    typeof output === "object" &&
    "previewId" in output &&
    typeof (output as any).previewId === "string"
  );
}

function ToolRows({ parts }: { parts: Part[] }) {
  const toolParts = parts.filter(
    (p): p is Extract<Part, { type: `tool-${string}` }> | Extract<Part, { type: "dynamic-tool" }> =>
      p.type === "dynamic-tool" || p.type.startsWith("tool-"),
  );

  if (toolParts.length === 0) return null;

  const previewItems: Array<{ previewId: string; batchIndex: number; preview: PreviewToolOutput["preview"] }> = [];
  let batchMessageId: string | null = null;

  const readOnlyRows: React.ReactNode[] = [];

  for (const part of toolParts) {
    const toolCallId = (part as { toolCallId: string }).toolCallId;
    const rawName = getToolName(part);
    const label = formatToolName(rawName);
    const state = (part as { state: string }).state;

    if (state === "output-available") {
      const output = (part as { output: unknown }).output;

      if (isPreviewOutput(output)) {
        previewItems.push({
          previewId: output.previewId,
          batchIndex: output.batchIndex,
          preview: output.preview,
        });
        if (output.messageId && !batchMessageId) batchMessageId = output.messageId;
        continue;
      }

      const count = countResults(output);
      readOnlyRows.push(
        <div key={toolCallId} className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="text-green-600 dark:text-green-400">✓</span>
          <span>{label}{count !== null ? ` (${count} results)` : ""}</span>
        </div>,
      );
      continue;
    }

    if (state === "output-error") {
      const errorText = (part as { errorText: string }).errorText;
      readOnlyRows.push(
        <div key={toolCallId} className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <span>✗</span>
          <span>{label}: {errorText}</span>
        </div>,
      );
      continue;
    }

    if (state === "output-denied") {
      readOnlyRows.push(
        <div key={toolCallId} className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span>—</span>
          <span>{label}: cancelled</span>
        </div>,
      );
      continue;
    }

    // in-progress states
    readOnlyRows.push(
      <div key={toolCallId} className="flex items-center gap-1.5 text-xs text-neutral-500">
        <span className="animate-spin inline-block">⟳</span>
        <span>{label}…</span>
      </div>,
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {readOnlyRows}
      {previewItems.length > 0 && batchMessageId && (
        <BatchPreviewGroup
          previews={previewItems}
          messageId={batchMessageId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

---

## Task 18: End-to-end smoke test

**No files changed** — this is a manual verification task.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test read-only flow (regression check)**

In the chat, type: `"What objects are in my org?"`
Expected: Claude calls `list_objects`, returns results inline, no preview card appears.

- [ ] **Step 3: Test single mutating action**

In the chat, type: `"Create a record in the Account object with Name = Test Corp"`
Expected:
- Claude calls `describe_object` or `list_objects` to verify Account is createable
- Claude calls `create_record`
- A single `ActionPreviewCard` appears inside `BatchPreviewGroup` with "Confirm all (1)" button
- Click "Confirm all (1)" → execution runs → "✓ Step 1 complete" appears

- [ ] **Step 4: Test batch with `$ref` dependency**

In the chat, type: `"Create a permission set called TestPS and assign it to [a real user name in your org]"`
Expected:
- Claude calls `search_users` (read-only, no card)
- Claude calls `create_permission_set` → preview card 1 appears
- Claude calls `assign_permission_set` with `permissionSetId: "$ref:step[0].id"` → preview card 2 appears
- "Confirm all (2)" button appears
- Click confirm → step 0 executes (PS created in SF), step 1 resolves `$ref`, assigns PS → "✓ Step 1 complete, ✓ Step 2 complete"

- [ ] **Step 5: Test reject**

Repeat step 4 but click "Reject all" → cards disappear, no changes in Salesforce.

- [ ] **Step 6: Test stop-on-failure**

Trigger `create_record` on a non-createable object (e.g., type an invalid `objectApiName`) and confirm. Expected: step 1 shows error, subsequent steps show "skipped".

- [ ] **Step 7: Final typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: no errors.
