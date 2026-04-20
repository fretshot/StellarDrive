# StellarDrive — AI Action Architecture

The AI assistant is the primary interaction surface. Every user turn flows through the same pipeline:

```
user message
   │
   ▼
intent classifier  ──────►  informational → run read-only tools, answer
   │
   ▼
Claude (Opus) with full tool registry
   │
   ├── read-only tool_use  ──► execute immediately, pass result back as tool_result
   │
   └── mutating tool_use   ──► buildPreview()  ──► persist action_previews (status=pending)
                                  returns { previewId, batchIndex, messageId, preview }
                                  (Claude may call multiple mutating tools → batch)
                                                   │
                                                   ▼
                              UI detects previewId in tool outputs
                              BatchPreviewGroup renders all cards + buttons
                                                   │
                                      ┌────────────┴────────────┐
                                  "Reject all"             "Confirm all (N)"
                                    │                          │
                                    ▼                          ▼
                    POST /api/actions/reject         POST /api/actions/execute-batch
                    (once per previewId,              body: { messageId }
                     sequential loop)                         │
                    status=rejected                            ▼
                                                    load all pending previews
                                                    ordered by batch_index
                                                              │
                                                    for each step in order:
                                                      resolve $ref tokens
                                                      validate + execute
                                                      stop on first failure
                                                              │
                                                              ▼
                                              action_executions + audit_logs written
                                              remaining pending previews → failed
```

Mutations are **never** fired from inside Claude's tool loop. Mutating tools return previews; only the user (via the UI) can fire execution. A single `messageId` ties all previews in a turn into one batch.

### $ref dependency resolution

When a later step depends on the output of an earlier step, Claude uses `$ref:step[N].fieldPath` tokens as field values in the tool input. The token is stored verbatim in `action_previews.payload` and resolved server-side at execute time using prior step results. The client never sees resolved IDs.

Example: `assign_permission_set` with `permissionSetId: "$ref:step[0].id"` — resolved to the actual Salesforce ID returned by the preceding `create_permission_set` step.

## Models

- **Chat / tool use**: `claude-opus-4-7` (1M context). Temperature 0 for determinism.
- **Intent classifier**: `claude-haiku-4-5`. A single cheap call per user turn to tag intent and route.
- **Prompt caching**: the system prompt and tool-definitions block carry `cache_control: { type: "ephemeral" }`. These are stable across turns, so cache hit rate should be high.

## System prompt shape

A single static system prompt ends with a fixed contract:

- "You may only call tools that exist. The registry exposes exactly the listed tools — no guessing."
- "For mutating actions, always return a `tool_use` that produces a preview. Do not claim an action has succeeded until the user confirms and the system returns a success `tool_result`."
- "CREATE operations only. Update and delete do not exist in this system."
- "When uncertain about an org, object, or field, call a read-only tool first instead of guessing."
- "When you call a mutating tool you will receive `{ previewId, batchIndex, preview }` — not a Salesforce result. The action has not executed yet; it is pending user confirmation. To reference the output of a prior step in the same batch, use `$ref:step[N].fieldPath` as a field value where N is the zero-based step index."

## Intent classification

The classifier looks at the latest user message plus recent context and returns:

```ts
{ intent: "informational" | "mutating" | "ambiguous", rationale: string }
```

- `informational`: proceed with the main Opus turn, allowing read-only tools only.
- `mutating`: proceed with the full registry available. Opus is still free to first call read-only tools for context.
- `ambiguous`: proceed with the full registry; the UI shows a small "the assistant may be about to change your org" hint.

Classification is advisory — the action layer is the authoritative gate on what actually executes.

## Action registry

Defined in `lib/actions/registry.ts`. Each entry:

```ts
interface ActionDefinition<I, P, R> {
  name: string;              // stable id, used in DB and tool_use blocks
  label: string;             // human-readable
  description: string;       // used as the Claude tool description
  readOnly: boolean;
  input: z.ZodType<I>;       // validated before preview/execute
  preview?: (input: I, ctx: ActionContext) => Promise<ActionPreview<P>>;
  validate?: (input: I, ctx: ActionContext) => Promise<ValidationResult>;
  execute: (input: I, ctx: ActionContext) => Promise<R>;
}
```

`ActionContext` contains the authenticated `user_id`, the active Supabase client, a `getSalesforceConnection` closure, and the current chat session/message ids.

### Phase 1 read-only tools

| name                  | purpose                                                 |
|-----------------------|---------------------------------------------------------|
| `list_connected_orgs` | List the user's orgs.                                   |
| `describe_object`     | Return the persisted describe summary for an SObject.   |
| `list_objects`        | List persisted objects, filtered by query.              |
| `list_fields`         | List persisted fields for an object.                    |
| `list_apex_classes`   | List persisted Apex classes, filtered.                  |
| `search_metadata`     | Full-text-ish search across persisted metadata.         |
| `search_users`        | Query live Salesforce for User records by name. Returns Salesforce User IDs for use in mutating tools (e.g. `assign_permission_set`). This is the only read-only tool that hits Salesforce directly rather than the local DB. |

### Phase 1 mutating tools

| name                     | target                                                 |
|--------------------------|--------------------------------------------------------|
| `create_custom_field`    | Metadata API deploy: `CustomField`                     |
| `create_custom_object`   | Metadata API deploy: `CustomObject`                    |
| `create_permission_set`  | Metadata API deploy: `PermissionSet`                   |
| `assign_permission_set`  | SObject insert: `PermissionSetAssignment`              |
| `create_record`          | SObject insert on any createable SObject               |

## Preview shape

```ts
interface ActionPreview<P = unknown> {
  actionType: string;
  summary: string;          // one-sentence human summary
  diff?: string;            // human-readable diff, e.g. "+ CustomField Contact.Nickname__c (Text(40))"
  targets: Array<{ orgId: string; entity: string; label?: string }>;
  risks: string[];          // e.g. "Adds a new required field to every page layout"
  payload: P;               // validated input
}
```

Previews are stored verbatim in `action_previews.preview`, and the validated tool input is stored in `action_previews.payload`. The `preview.created_at` row starts `pending`; it auto-expires at 15 min via an application-layer check on confirmation.

## Validation

Each mutating action exposes `validate(input, ctx)`. It runs:

1. **Schema validation** — already done by Zod before `preview`; repeated as a belt-and-suspenders check before execute.
2. **Semantic validation** — e.g. for `create_custom_field`: object exists and is customizable; field name is valid API name; length limits respected.
3. **Authorization** — the org still belongs to the caller; status is `active`.

Results:

```ts
type ValidationResult = { ok: true } | { ok: false; issues: Array<{ path: string; message: string }> };
```

A failed validation blocks execution and writes an `audit_logs` row with outcome `failure` and `action_type = 'action.validation_failed'`.

## Execution

### Batch execution

`POST /api/actions/execute-batch` body: `{ messageId: string (UUID) }`.

Server behavior:

1. Load all `pending` previews for `messageId` where `user_id = ctx.userId`, ordered by `batch_index`.
2. For each step in order:
   a. Ownership + TTL check. Mark `failed` on violation.
   b. Resolve `$ref:step[N].fieldPath` tokens using prior step results.
   c. Re-run `validate`. Mark `failed` on failure, write audit row.
   d. Mark preview `confirmed`, insert `action_executions (status=running)`.
   e. Run `execute`. On success: mark `executed`, write audit. On failure: mark `failed`, write audit.
   f. **Stop-on-failure**: remaining `pending` previews are marked `failed` and returned as `"skipped"`.
3. Return `{ steps: BatchStepResult[] }` where each step has `status: "executed" | "failed" | "skipped"`.

### Single-preview execution (legacy path)

`POST /api/actions/execute` body: `{ previewId: string }` — retained for non-batch flows. Follows the same validate → confirm → execute → audit sequence for a single preview.

## Error handling

A single typed error surface:

```ts
class ActionError extends Error {
  constructor(
    public category: "validation" | "auth" | "salesforce" | "internal",
    public code: string,
    message: string,
    public details?: unknown,
  ) { super(message); }
}
```

Callers translate `ActionError` into:
- A user-facing message in the chat.
- An `audit_logs` row with `outcome=failure` and `metadata={category, code, details}`.

## Audit trail

`audit_logs` is append-only and carries one row for every meaningful state transition:

| `action_type`              | when                               |
|----------------------------|------------------------------------|
| `org.connected`            | OAuth callback completes.          |
| `metadata.sync_started`    | A sync job begins.                 |
| `metadata.sync_completed`  | A sync job ends.                   |
| `preview.created`          | A mutating preview is persisted.   |
| `preview.rejected`         | User rejects a preview.            |
| `action.validation_failed` | Execute-time validation fails.     |
| `action.executed`          | Execute completes (success or fail in `outcome`). |

Audit writes use the service-role Supabase client so they succeed even when the calling user session is in a weird state.

## Safety rails

- The tool registry is the single source of truth for what the AI can do. The AI is not allowed to free-text its way into an action: every action is typed input.
- Update/delete tools **do not exist in the registry** — the AI cannot invent them.
- Read-only tools may not be composed inside a mutating preview. Previews are built from validated input only.
- Rate limits: max 20 tool calls per user message; max 4 mutating previews per chat session. (Enforced in the orchestrator.)
