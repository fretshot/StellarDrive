# M8 — Action Framework + Mutating Tools Design

**Date:** 2026-04-20  
**Milestone:** M8 (depends on M7)  
**Status:** Approved, pending implementation

---

## Overview

M8 wires up the full preview → confirm → execute pipeline for mutating Salesforce actions initiated through the AI chat. Claude proposes CREATE actions (custom fields, custom objects, permission sets, record inserts, permission set assignments); the user reviews a batch preview and confirms with one click; the server executes in sequence with `$ref` dependency resolution between steps.

---

## Decisions

| Question | Decision |
|---|---|
| Preview model | Batch — Claude generates all previews for a turn upfront |
| Confirmation UX | One "Confirm all (N)" button per batch |
| Dependency resolution | `$ref:step[N].fieldPath` tokens in payload, resolved server-side at execute time |
| Partial failure | Stop-on-failure — halt at first error, report what succeeded and what failed |

---

## Data Flow

```
user: "Create a PS and assign to John Smith"
  │
  ▼
intent classifier → "mutating"
  │
  ▼
streamText (full registry including mutating tools)
  │
  ├── tool_use: search_users("John Smith")   → execute inline (read-only) → { id: "005...", name: "John Smith" }
  ├── tool_use: create_permission_set        → buildPreview() → { previewId, batchIndex:0, preview }
  └── tool_use: assign_permission_set        → buildPreview() → { previewId, batchIndex:1, preview }
        payload: { permissionSetId: "$ref:step[0].id", assigneeId: "005..." }
  │
  ▼
Claude final text: "I've prepared 2 actions. Please review and confirm."
  │
  ▼
message-list detects previewId in tool outputs
renders BatchPreviewGroup: 2 ActionPreviewCards + "Confirm all (2)" button
  │
  ▼ user clicks confirm
POST /api/actions/execute-batch { messageId }
  │
  ├── step 0: create_permission_set → { id: "0PS00001", success: true }
  ├── step 1: resolve $ref:step[0].id → "0PS00001" → assign_permission_set
  └── stop-on-failure: step 1 error → mark failed, return partial results
  │
  ▼
audit_logs rows for each step
chat UI appends execution result as assistant message
```

---

## DB Schema Changes

Single migration (`supabase/migrations/0002_m8_batch_index.sql`):

```sql
ALTER TABLE action_previews ADD COLUMN batch_index integer NOT NULL DEFAULT 0;
```

- Previews sharing `message_id` ordered by `batch_index` define a batch. No new table needed.
- `$ref` tokens stored verbatim in `action_previews.payload` (JSONB). Resolved at execute time, never written back.
- Existing `status` flow (`pending → confirmed → executed | failed | expired`) unchanged.
- `POST /api/actions/execute` (single-preview route) stays for future single-action flows.

---

## Salesforce Implementations

### `lib/salesforce/metadata-deploy.ts`

All three functions implemented via `conn.metadata.create()`:

**`createCustomField`**
```ts
await conn.metadata.create("CustomField", {
  fullName: `${input.objectApiName}.${input.fieldApiName}`,
  label: input.label,
  type: input.type,
  length: input.length,       // Text/TextArea only
  required: input.required ?? false,
  description: input.description,
});
```

**`createCustomObject`**
```ts
await conn.metadata.create("CustomObject", {
  fullName: input.apiName,
  label: input.label,
  pluralLabel: input.pluralLabel,
  nameField: { type: "Text", label: input.nameFieldLabel ?? "Name" },
  deploymentStatus: "Deployed",
  sharingModel: "ReadWrite",
});
```

**`createPermissionSet`**
```ts
const result = await conn.metadata.create("PermissionSet", {
  fullName: input.apiName,
  label: input.label,
  description: input.description,
});
// Returns { id: string, success: boolean, fullName: string }
// id exposed so $ref:step[N].id works for assign_permission_set
```

### `lib/salesforce/records.ts`

**`createRecord`**
```ts
const result = await conn.sobject(input.objectApiName).create(input.fields);
// Returns { id: string, success: boolean }
```

**`assignPermissionSet`**
```ts
const result = await conn.sobject("PermissionSetAssignment").create({
  PermissionSetId: input.permissionSetId,   // resolved from $ref at execute time
  AssigneeId: input.assigneeId,
});
```

---

## Action Registry (`lib/actions/registry.ts`)

### New read-only tool

**`search_users`** — resolves user names to Salesforce User IDs before building assign previews.

```ts
input: z.object({ orgId: z.string().uuid(), query: z.string().min(1) })
// Queries live Salesforce (not persisted metadata):
// SELECT Id, Name, Username FROM User WHERE Name LIKE '%{query}%' LIMIT 10
// via ctx.getConnection(orgId).query(...)
// This is the only read-only tool that hits Salesforce directly instead of the local DB.
```

### New mutating tools

**`create_custom_field`** — wraps `metadata-deploy.createCustomField`. Preview diff shows `+ ObjectName.FieldName__c (Type)`. Risks include page layout impact if `required: true`.

**`create_custom_object`** — wraps `metadata-deploy.createCustomObject`. Preview diff shows `+ ObjectName__c`.

**`create_permission_set`** — wraps `metadata-deploy.createPermissionSet`. Preview diff shows `+ PermissionSetApiName`.

**`assign_permission_set`** — wraps `records.assignPermissionSet`. Accepts `permissionSetId` (may be `$ref` token) and `assigneeId`. Preview diff shows `+ PermissionSetAssignment: PSName → UserName`.

### Completed stub

**`create_record`** — existing stub wired to `records.createRecord`. Validate checks object exists and is createable.

---

## Tool Wiring (`lib/ai/tool-definitions.ts`)

`buildAiSdkTools` uses a per-request `batchIndex` counter (closure variable). Mutating tool `execute` closures call `buildPreview()` and return the preview data instead of executing:

```ts
let batchIndex = 0;

// mutating tool execute closure:
execute: async (input) => {
  const { previewId, preview } = await buildPreview(action, input, ctx);
  // messageId is ctx.messageId — the DB UUID from chat_messages, NOT the AI SDK UIMessage.id.
  // The client uses this to call execute-batch; it reads it from the first preview tool output.
  return { previewId, batchIndex: batchIndex++, messageId: ctx.messageId, preview };
}

// read-only tool execute closure: unchanged
```

The counter increments each time a mutating tool fires in a single streaming turn, producing ordered `batch_index` values. The client reads `messageId` from any preview tool output (all share the same value) and passes it to `POST /api/actions/execute-batch`.

---

## $ref Resolution

Utility in `lib/actions/executor.ts`:

```ts
function resolveRefs(payload: unknown, results: unknown[]): unknown {
  if (typeof payload === "string") {
    const m = payload.match(/^\$ref:step\[(\d+)\]\.(.+)$/);
    if (m) {
      const stepResult = results[Number(m[1])];
      return m[2].split(".").reduce((o: any, k) => o?.[k], stepResult);
    }
  }
  if (Array.isArray(payload)) return payload.map(v => resolveRefs(v, results));
  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).map(([k, v]) => [k, resolveRefs(v, results)])
    );
  }
  return payload;
}
```

---

## Execute-Batch Endpoint (`POST /api/actions/execute-batch`)

**Request:** `{ messageId: string }`

**Server steps:**
1. Auth check — verify user owns the session that owns `messageId`.
2. Load all `pending` previews for `messageId` ordered by `batch_index`.
3. For each preview in order:
   - Resolve `$ref` tokens in payload using prior step `results[]`.
   - Re-run `validate(resolvedInput, ctx)`.
   - Call `action.execute(resolvedInput, ctx)`.
   - On success: push result to `results[]`, mark preview `executed`, write audit row.
   - On failure: mark preview `failed`, write audit row, **stop loop**.
4. Mark all remaining `pending` previews as `expired` (they will never run).
5. Return `{ steps: [{ previewId, status: "executed"|"failed"|"skipped", result?, error? }] }`.

**Runtime:** `nodejs` (uses jsforce + crypto).

---

## System Prompt Addition

Two sentences appended to `lib/ai/system-prompt.ts`:

> "When you call a mutating tool you will receive `{ previewId, batchIndex, preview }` — not a Salesforce result. The action has not executed yet; it is pending user confirmation. To reference the output of a prior step in the same batch, use `$ref:step[N].fieldPath` as a field value where N is the zero-based step index."

---

## UI Changes

### `components/chat/message-list.tsx`

`ToolRows` separates tool outputs into two buckets:
- **Read-only results** (no `previewId`) → existing "✓ tool ran" badge rendering, unchanged.
- **Preview results** (has `previewId`) → collected per assistant message, passed to `BatchPreviewGroup`.

`BatchPreviewGroup` is rendered once per assistant message after all tool rows, if there are any previews.

### `components/chat/batch-preview-group.tsx` (new)

Props:
```ts
interface BatchPreviewGroupProps {
  previews: Array<{ previewId: string; batchIndex: number; preview: ActionPreview }>;
  messageId: string;
  onResolved: (outcome: "executed" | "rejected", steps?: StepResult[]) => void;
}
```

Renders:
- One `ActionPreviewCard` (display-only) per preview, in `batchIndex` order.
- **"Confirm all (N)"** button → `POST /api/actions/execute-batch { messageId }` → shows per-step status inline as results arrive.
- **"Reject all"** button → client loops over `previewId`s in `batchIndex` order, calling `POST /api/actions/reject { previewId }` for each (new thin endpoint: marks preview `rejected`, writes `preview.rejected` audit row). No server-side batch reject endpoint — the loop is fast and previews are cheap to reject.
- After resolution: calls `onResolved`.

### `components/chat/action-preview-card.tsx`

Becomes a pure display component — no confirm/reject buttons. `BatchPreviewGroup` owns all action logic.

### `components/chat/chat-panel.tsx`

No changes needed.

---

## Audit Coverage

Every meaningful state transition writes an `audit_logs` row (existing `writeAudit` helper):

| `action_type` | when |
|---|---|
| `preview.created` | Each `buildPreview()` call (already implemented) |
| `preview.rejected` | User rejects batch |
| `action.validation_failed` | Validate fails at execute time |
| `action.executed` | Each step completes (success or failure in `outcome`) |

---

## Safety Rails (unchanged)

- No update/delete tools in registry — Phase 1 CREATE only.
- `$ref` tokens resolved server-side only — client never sends resolved payloads.
- Max 4 mutating previews per chat session enforced in orchestrator (existing limit covers batches).
- Rate limits on `/api/actions/execute-batch` same as single execute (per-user).
- All execution paths go through `validate()` at execute time, not just preview time.
