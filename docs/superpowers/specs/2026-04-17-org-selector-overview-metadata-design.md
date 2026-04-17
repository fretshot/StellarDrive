# Org Selector, Overview Stats & Extended Metadata Sync

**Date:** 2026-04-17
**Status:** Approved

## Summary

Three connected features delivered together:

1. **Active-org switcher** in the topbar — a client-side dropdown that sets the active org for the entire dashboard without a browser reload.
2. **Overview page** — replaces the empty state with a stat grid showing 10 org-level counts plus the org's Salesforce creation date.
3. **Extended metadata sync** — adds Apex Triggers, Flows, Process Builders, and Workflow Rules to the sync pipeline and makes them browsable in the Metadata page.

---

## 1. Active-Org Switcher

### Mechanism

The topbar uses a **cookie + `router.refresh()`** pattern:

- `Topbar` (server component) fetches the user's org list and reads the `active_org_id` cookie from the request. It passes both to `OrgSwitcher`.
- `OrgSwitcher` (client component) renders a `<select>`. On change it calls the server action `setActiveOrg(orgId)`, which writes the `active_org_id` cookie; once the action resolves, the client component calls `router.refresh()`.
- `router.refresh()` re-renders all server components in the layout with the new cookie in the request — no browser reload, no URL change.

### Cookie spec

| Property  | Value |
|-----------|-------|
| Name      | `active_org_id` |
| HttpOnly  | true |
| SameSite  | Lax |
| Path      | `/dashboard` |
| Max-Age   | 1 year |

### `lib/active-org.ts`

Server-only helper. Exports `getActiveOrgId(userId: string): Promise<string | null>`.

- Reads the cookie via `cookies()`.
- Validates the cookie value is a UUID that belongs to one of the authenticated user's orgs (query against `connected_salesforce_orgs`).
- Falls back to the user's first org (ordered by `created_at asc`) if the cookie is absent or invalid.
- Returns `null` if the user has no connected orgs.

### Topbar removal of existing org-selector in Metadata page

The `<select>` + "Switch" button inside `app/dashboard/metadata/page.tsx` is removed. All pages use `getActiveOrgId()` as the single source of truth for the active org. The `?org=` search param is removed from the Metadata page; `?tab=` and `?q=` remain.

---

## 2. Database Changes

All changes live in a new migration file `supabase/migrations/0002_extended_metadata.sql`.

### New column on `connected_salesforce_orgs`

```sql
ALTER TABLE connected_salesforce_orgs
  ADD COLUMN sf_created_at timestamptz;
```

Populated during OAuth callback (immediately on connect) and kept accurate on every sync.

### `salesforce_metadata_triggers`

| Column          | Type        | Notes |
|-----------------|-------------|-------|
| `id`            | uuid PK     | `gen_random_uuid()` |
| `org_id`        | uuid        | FK → `connected_salesforce_orgs`, cascade delete |
| `api_name`      | text        | Trigger name |
| `object_name`   | text        | SObject the trigger fires on |
| `status`        | text        | `Active \| Inactive` |
| `events`        | text[]      | e.g. `['before insert', 'after update']` |
| `last_synced_at`| timestamptz | |

Unique: `(org_id, api_name)`. Index: `(org_id)`. RLS: joined through org's `user_id = auth.uid()`.

### `salesforce_metadata_flows`

Stores both Flows and Process Builders. `process_type` distinguishes them.

| Column          | Type        | Notes |
|-----------------|-------------|-------|
| `id`            | uuid PK     | |
| `org_id`        | uuid        | FK → `connected_salesforce_orgs`, cascade delete |
| `api_name`      | text        | `FlowDefinition.ApiName` |
| `label`         | text        | Human-readable name |
| `process_type`  | text        | `Flow \| AutoLaunchedFlow \| Workflow \| ...` |
| `status`        | text        | `Active \| Inactive \| Draft \| Obsolete` |
| `last_synced_at`| timestamptz | |

Unique: `(org_id, api_name)`. Process Builders are rows where `process_type = 'Workflow'`; regular Flows where `process_type = 'Flow'`.

### `salesforce_metadata_workflows`

| Column          | Type        | Notes |
|-----------------|-------------|-------|
| `id`            | uuid PK     | |
| `org_id`        | uuid        | FK → `connected_salesforce_orgs`, cascade delete |
| `api_name`      | text        | `WorkflowRule.Name` |
| `object_name`   | text        | SObject the rule belongs to (`TableEnumOrId`) |
| `active`        | boolean     | |
| `last_synced_at`| timestamptz | |

Unique: `(org_id, api_name)`.

---

## 3. Sync Changes

### `lib/salesforce/metadata.ts` — new functions

**`listApexTriggers(conn)`**

Tooling API query:
```
SELECT Id, Name, TableEnumOrId, Status, Body FROM ApexTrigger
```
Parses `events` from the trigger body using a regex on `trigger X on Y (events)`. Returns `{ api_name, object_name, status, events }[]`.

**`listFlows(conn)`**

Tooling API query:
```
SELECT Id, ApiName, Label, ProcessType, Status FROM FlowDefinition
```
Returns `{ api_name, label, process_type, status }[]`. Covers both Flows and Process Builders.

**`listWorkflowRules(conn)`**

Tooling API query:
```
SELECT Id, Name, TableEnumOrId, Active FROM WorkflowRule
```
Returns `{ api_name, object_name, active }[]`.

**`readOrganization(conn)`** gains `CreatedDate` in the SELECT — existing return type extended with `CreatedDate: string`.

### `lib/salesforce/sync.ts` changes

- `SyncKind` becomes `"objects" | "fields" | "classes" | "triggers" | "flows" | "workflows" | "full"`.
- After the org-type update block, `sf_created_at` is written from `org.CreatedDate`.
- `"full"` runs all sync kinds.
- Three new `upsert*` helpers: `upsertTriggers`, `upsertFlows`, `upsertWorkflows` — same chunked upsert pattern as existing helpers.
- `SyncResult` gains `triggers: number`, `flows: number`, `workflows: number`.

### OAuth callback

`app/api/salesforce/oauth/callback/route.ts` already calls `readOrganization`. It is updated to also write `sf_created_at` to the upserted org row so the field is populated immediately on first connect, before any sync runs.

---

## 4. Overview Page

`app/dashboard/page.tsx` becomes an `async` server component. It:

1. Gets the authenticated user.
2. Calls `getActiveOrgId(userId)`.
3. If `getActiveOrgId` returns `null` (no orgs connected at all), renders the existing empty state prompting the user to connect an org.
4. Otherwise runs these counts in parallel via `Promise.all` and renders the stat grid — counts will be 0 if the org is connected but sync has not yet been run:

| Stat                  | Source |
|-----------------------|--------|
| Org Creation Date     | `connected_salesforce_orgs.sf_created_at` |
| Standard Objects      | `salesforce_metadata_objects` where `is_custom = false` AND `api_name NOT ILIKE '%__mdt'` AND `summary->>'custom_setting' != 'true'` |
| Custom Objects        | `salesforce_metadata_objects` where `is_custom = true` AND `api_name NOT ILIKE '%__mdt'` AND `summary->>'custom_setting' != 'true'` |
| Custom Metadata       | `salesforce_metadata_objects` where `api_name ILIKE '%__mdt'` |
| Custom Settings       | `salesforce_metadata_objects` where `summary->>'custom_setting' = 'true'` |
| Workflows             | `salesforce_metadata_workflows` count |
| Process Builders      | `salesforce_metadata_flows` where `process_type = 'Workflow'` count |
| Flows                 | `salesforce_metadata_flows` where `process_type = 'Flow'` count |
| Triggers              | `salesforce_metadata_triggers` count |
| Apex Classes          | `salesforce_metadata_classes` count |

Displayed as a responsive CSS grid of stat cards. Each card shows the label and the count (or formatted date for Org Creation Date). If `sf_created_at` is null (sync not yet run after connecting), shows "—".

---

## 5. Metadata Page

### Org selector removal

The inline `<select>` + "Switch" form is removed. The page reads the active org via `getActiveOrgId()`.

### New tabs

The `tab` search param is extended to accept: `"objects" | "classes" | "triggers" | "flows" | "process-builders" | "workflows"`.

| Tab               | Table                        | Search columns          | Display columns |
|-------------------|------------------------------|-------------------------|-----------------|
| Objects           | `salesforce_metadata_objects`| `api_name`, `label`     | `api_name`, `label`, custom badge |
| Apex Classes      | `salesforce_metadata_classes`| `api_name`              | `api_name`, `status`, `api_version` |
| Triggers          | `salesforce_metadata_triggers`| `api_name`             | `api_name`, `object_name`, `status` |
| Flows             | `salesforce_metadata_flows` (process_type=Flow) | `api_name`, `label` | `api_name`, `label`, `status` |
| Process Builders  | `salesforce_metadata_flows` (process_type=Workflow) | `api_name`, `label` | `api_name`, `label`, `status` |
| Workflows         | `salesforce_metadata_workflows` | `api_name`           | `api_name`, `object_name`, active badge |

All tabs respect the `?q=` search param. Limit 500 rows, ordered by `api_name asc`.

---

## 6. Files Touched

### New files
- `supabase/migrations/0002_extended_metadata.sql`
- `lib/active-org.ts`
- `components/layout/org-switcher.tsx`
- `app/dashboard/actions.ts` — `setActiveOrg(orgId)` server action (writes the cookie)

### Modified files
- `components/layout/topbar.tsx` — add `OrgSwitcher`, pass orgs + active org
- `app/dashboard/page.tsx` — replace empty state with stats grid
- `app/dashboard/metadata/page.tsx` — remove inline org switcher, add 4 new tabs, read org from cookie
- `lib/salesforce/metadata.ts` — add `listApexTriggers`, `listFlows`, `listWorkflowRules`; extend `readOrganization`
- `lib/salesforce/sync.ts` — extend `SyncKind`, add upsert helpers, write `sf_created_at`
- `app/api/salesforce/oauth/callback/route.ts` — write `sf_created_at` on connect
- `types/database.ts` — regenerated after migration
- `docs/database-schema.md` — updated with new column and tables

---

## Out of Scope

- Detail pages for triggers, flows, process builders, or workflows (browse only, no drill-down).
- Syncing flow/trigger/workflow *body* or full metadata (counts and summary fields only).
- Update or delete of any synced metadata (Phase 1 constraint).
