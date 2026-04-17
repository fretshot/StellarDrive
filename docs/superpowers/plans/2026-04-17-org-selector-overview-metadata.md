# Org Selector, Overview Stats & Extended Metadata Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global active-org switcher to the topbar, populate the Overview page with live org stats, and extend the metadata sync + browser to cover Triggers, Flows, Process Builders, and Workflow Rules.

**Architecture:** Cookie-based active-org state (`active_org_id`) written by a server action and read by a `lib/active-org.ts` helper used in all dashboard pages. New Salesforce metadata types are fetched via the Tooling API, stored in three new tables, and rendered as new tabs in the Metadata page. No tests exist in this project — use `npm run typecheck` as the verification step after each task.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgREST), jsforce Tooling API, Tailwind CSS, `next/headers` cookies, `useRouter` for `router.refresh()`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/0002_extended_metadata.sql` | Create | DB migration: new column + 3 new tables + updated CHECK constraint |
| `types/database.ts` | Regenerate | Auto-generated Supabase types |
| `lib/active-org.ts` | Create | `ACTIVE_ORG_COOKIE` constant + `getActiveOrgId(userId)` helper |
| `app/dashboard/actions.ts` | Create | `setActiveOrg(orgId)` server action |
| `components/layout/org-switcher.tsx` | Create | Client `<select>` dropdown; calls server action then `router.refresh()` |
| `components/layout/topbar.tsx` | Modify | Fetch orgs + active org, render `OrgSwitcher` |
| `lib/salesforce/metadata.ts` | Modify | Add `listApexTriggers`, `listFlows`, `listWorkflowRules`; extend `readOrganization` |
| `lib/salesforce/sync.ts` | Modify | Extend `SyncKind`, add upsert helpers, write `sf_created_at` |
| `app/api/salesforce/oauth/callback/route.ts` | Modify | Write `sf_created_at` on first connect |
| `app/dashboard/page.tsx` | Modify | Replace empty state with parallel count queries + stat grid |
| `app/dashboard/metadata/page.tsx` | Modify | Remove inline org switcher; add 4 new tabs |
| `docs/database-schema.md` | Modify | Document new column and tables |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0002_extended_metadata.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0002_extended_metadata.sql
-- Extended metadata: triggers, flows, workflows + org creation date

-- =========================================================================
-- Add sf_created_at to connected_salesforce_orgs
-- =========================================================================
alter table public.connected_salesforce_orgs
  add column sf_created_at timestamptz;

-- =========================================================================
-- salesforce_metadata_triggers
-- =========================================================================
create table public.salesforce_metadata_triggers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  api_name text not null,
  object_name text,
  status text,
  events text[] not null default '{}',
  last_synced_at timestamptz,
  unique (org_id, api_name)
);

create index on public.salesforce_metadata_triggers (org_id);

alter table public.salesforce_metadata_triggers enable row level security;

create policy "meta_triggers_all_own"
  on public.salesforce_metadata_triggers for all
  using (
    exists (
      select 1 from public.connected_salesforce_orgs o
      where o.id = org_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.connected_salesforce_orgs o
      where o.id = org_id and o.user_id = auth.uid()
    )
  );

-- =========================================================================
-- salesforce_metadata_flows
-- (covers both Flows and Process Builders — distinguished by process_type)
-- =========================================================================
create table public.salesforce_metadata_flows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  api_name text not null,
  label text,
  process_type text,
  status text,
  last_synced_at timestamptz,
  unique (org_id, api_name)
);

create index on public.salesforce_metadata_flows (org_id);

alter table public.salesforce_metadata_flows enable row level security;

create policy "meta_flows_all_own"
  on public.salesforce_metadata_flows for all
  using (
    exists (
      select 1 from public.connected_salesforce_orgs o
      where o.id = org_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.connected_salesforce_orgs o
      where o.id = org_id and o.user_id = auth.uid()
    )
  );

-- =========================================================================
-- salesforce_metadata_workflows
-- =========================================================================
create table public.salesforce_metadata_workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  api_name text not null,
  object_name text,
  active boolean not null default false,
  last_synced_at timestamptz,
  unique (org_id, api_name)
);

create index on public.salesforce_metadata_workflows (org_id);

alter table public.salesforce_metadata_workflows enable row level security;

create policy "meta_workflows_all_own"
  on public.salesforce_metadata_workflows for all
  using (
    exists (
      select 1 from public.connected_salesforce_orgs o
      where o.id = org_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.connected_salesforce_orgs o
      where o.id = org_id and o.user_id = auth.uid()
    )
  );

-- =========================================================================
-- Update metadata_sync_jobs.kind CHECK constraint to include new kinds
-- =========================================================================
alter table public.metadata_sync_jobs
  drop constraint metadata_sync_jobs_kind_check;

alter table public.metadata_sync_jobs
  add constraint metadata_sync_jobs_kind_check
    check (kind in ('objects','fields','classes','triggers','flows','workflows','full'));
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
npx supabase db push
```

If your local Supabase instance is not running, start it first:
```bash
npx supabase start
npx supabase db push
```

Expected: migration applies with no errors.

---

## Task 2: Regenerate TypeScript Types

**Files:**
- Modify: `types/database.ts`

- [ ] **Step 1: Regenerate**

```bash
npx supabase gen types typescript --local > types/database.ts
```

Expected: `types/database.ts` now includes `salesforce_metadata_triggers`, `salesforce_metadata_flows`, `salesforce_metadata_workflows` table types, and the `sf_created_at` column on `connected_salesforce_orgs`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes (or only pre-existing errors — there are currently none).

---

## Task 3: Active-Org Cookie Helper

**Files:**
- Create: `lib/active-org.ts`

- [ ] **Step 1: Create the helper**

```typescript
import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "active_org_id";

/**
 * Returns the validated active org ID for the given user.
 * Reads from the active_org_id cookie; validates it belongs to the user;
 * falls back to their first connected org. Returns null if the user has none.
 */
export async function getActiveOrgId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const supabase = await createSupabaseServerClient();
  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id")
    .order("created_at", { ascending: true });

  if (!orgs || orgs.length === 0) return null;

  if (cookieValue && orgs.some((o) => o.id === cookieValue)) {
    return cookieValue;
  }

  return orgs[0].id;
}
```

Note: `userId` is accepted so callers make it explicit that they've authenticated the request, even though RLS enforces it at the DB level.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 4: setActiveOrg Server Action

**Files:**
- Create: `app/dashboard/actions.ts`

- [ ] **Step 1: Create the server action**

```typescript
"use server";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";

export async function setActiveOrg(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/dashboard",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 5: OrgSwitcher Client Component

**Files:**
- Create: `components/layout/org-switcher.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";
import { useRouter } from "next/navigation";
import { setActiveOrg } from "@/app/dashboard/actions";

interface Org {
  id: string;
  alias: string | null;
  display_name: string | null;
}

interface OrgSwitcherProps {
  orgs: Org[];
  activeOrgId: string | null;
}

export function OrgSwitcher({ orgs, activeOrgId }: OrgSwitcherProps) {
  const router = useRouter();

  if (orgs.length === 0) {
    return <span className="text-sm text-neutral-500">No orgs connected</span>;
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await setActiveOrg(e.target.value);
    router.refresh();
  }

  return (
    <select
      value={activeOrgId ?? orgs[0].id}
      onChange={handleChange}
      className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.alias || org.display_name || org.id}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 6: Update Topbar

**Files:**
- Modify: `components/layout/topbar.tsx`

- [ ] **Step 1: Replace the file**

```typescript
import { logout } from "@/app/(auth)/logout/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";

export async function Topbar() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id, alias, display_name")
    .order("created_at", { ascending: true });

  const orgList = orgs ?? [];
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrgId =
    cookieValue && orgList.some((o) => o.id === cookieValue)
      ? cookieValue
      : (orgList[0]?.id ?? null);

  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <OrgSwitcher orgs={orgList} activeOrgId={activeOrgId} />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-500">{user?.email}</span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 7: New Salesforce Metadata Functions

**Files:**
- Modify: `lib/salesforce/metadata.ts`

- [ ] **Step 1: Add new interfaces and extend `readOrganization`**

Add these exports after the existing `ApexClassSummary` interface and before `listObjects`:

```typescript
export interface TriggerSummary {
  api_name: string;
  object_name: string;
  status: string;
  events: string[];
}

export interface FlowSummary {
  api_name: string;
  label: string;
  process_type: string;
  status: string;
}

export interface WorkflowRuleSummary {
  api_name: string;
  object_name: string;
  active: boolean;
}
```

- [ ] **Step 2: Update `readOrganization` to include `CreatedDate`**

Replace the existing `readOrganization` function:

```typescript
export async function readOrganization(conn: Connection) {
  type Org = {
    Id: string;
    Name: string;
    OrganizationType: string;
    IsSandbox: boolean;
    TrialExpirationDate: string | null;
    CreatedDate: string;
  };
  const res = await conn.query<Org>(
    "SELECT Id, Name, OrganizationType, IsSandbox, TrialExpirationDate, CreatedDate FROM Organization LIMIT 1",
  );
  const row = res.records[0];
  if (!row) throw new Error("Organization record not returned");
  return row;
}
```

- [ ] **Step 3: Add `listApexTriggers`**

Append after `readOrganization`:

```typescript
/**
 * Apex trigger list via the Tooling API.
 * Parses the trigger events from the body header line:
 *   trigger TriggerName on ObjectName (before insert, after update, ...)
 */
export async function listApexTriggers(conn: Connection): Promise<TriggerSummary[]> {
  type Row = {
    Id: string;
    Name: string;
    TableEnumOrId: string;
    Status: string;
    Body: string | null;
  };
  const res = await conn.tooling.query<Row>(
    "SELECT Id, Name, TableEnumOrId, Status, Body FROM ApexTrigger",
  );

  return (res.records as Row[]).map((r) => {
    const body = r.Body ?? "";
    // Extract events from: trigger Name on Object (event1, event2)
    const match = /trigger\s+\w+\s+on\s+\w+\s*\(([^)]+)\)/i.exec(body);
    const events = match
      ? match[1].split(",").map((e) => e.trim().toLowerCase())
      : [];
    return {
      api_name: r.Name,
      object_name: r.TableEnumOrId,
      status: r.Status,
      events,
    };
  });
}
```

- [ ] **Step 4: Add `listFlows`**

Append after `listApexTriggers`:

```typescript
/**
 * Flow and Process Builder list via the Tooling API.
 * process_type = 'Flow' → Flow
 * process_type = 'Workflow' → Process Builder
 * Other process_type values (AutoLaunchedFlow, etc.) are also stored.
 */
export async function listFlows(conn: Connection): Promise<FlowSummary[]> {
  type Row = {
    Id: string;
    ApiName: string;
    Label: string;
    ProcessType: string;
    Status: string;
  };
  const res = await conn.tooling.query<Row>(
    "SELECT Id, ApiName, Label, ProcessType, Status FROM FlowDefinition",
  );

  const byKey = new Map<string, FlowSummary>();
  for (const r of res.records as Row[]) {
    byKey.set(r.ApiName, {
      api_name: r.ApiName,
      label: r.Label,
      process_type: r.ProcessType,
      status: r.Status,
    });
  }
  return Array.from(byKey.values());
}
```

- [ ] **Step 5: Add `listWorkflowRules`**

Append after `listFlows`:

```typescript
/**
 * Workflow rule list via the Tooling API.
 */
export async function listWorkflowRules(conn: Connection): Promise<WorkflowRuleSummary[]> {
  type Row = {
    Id: string;
    Name: string;
    TableEnumOrId: string;
    Active: boolean;
  };
  const res = await conn.tooling.query<Row>(
    "SELECT Id, Name, TableEnumOrId, Active FROM WorkflowRule",
  );

  return (res.records as Row[]).map((r) => ({
    api_name: r.Name,
    object_name: r.TableEnumOrId,
    active: r.Active,
  }));
}
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 8: Extend Sync

**Files:**
- Modify: `lib/salesforce/sync.ts`

- [ ] **Step 1: Update imports and `SyncKind`**

Replace the import block and `SyncKind` type at the top of the file:

```typescript
import "server-only";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import {
  describeObject,
  listApexClasses,
  listApexTriggers,
  listFlows,
  listObjects,
  listWorkflowRules,
  readOrganization,
  type FieldSummary,
  type FlowSummary,
  type ObjectSummary,
  type TriggerSummary,
  type WorkflowRuleSummary,
} from "@/lib/salesforce/metadata";
import { normalizeOrgType } from "@/lib/salesforce/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

export type SyncKind = "objects" | "fields" | "classes" | "triggers" | "flows" | "workflows" | "full";
```

- [ ] **Step 2: Update `SyncResult` and the org-type update block**

Replace the `SyncResult` interface:

```typescript
export interface SyncResult {
  job_id: string;
  objects: number;
  fields: number;
  classes: number;
  triggers: number;
  flows: number;
  workflows: number;
}
```

Inside `runMetadataSync`, update the counts initializer and the org-type update block. Find this section:

```typescript
const counts = { objects: 0, fields: 0, classes: 0 };

  try {
    const conn = await getSalesforceConnection(orgId, userId);

    // Keep org_type accurate on every sync (cheap).
    try {
      const org = await readOrganization(conn);
      await admin
        .from("connected_salesforce_orgs")
        .update({ org_type: normalizeOrgType(org.OrganizationType, org.IsSandbox) })
        .eq("id", orgId);
    } catch {
      // Non-fatal — sync can proceed without re-classifying.
    }
```

Replace it with:

```typescript
const counts = { objects: 0, fields: 0, classes: 0, triggers: 0, flows: 0, workflows: 0 };

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
```

- [ ] **Step 3: Add new sync kinds to the main try block**

Inside the `try` block, after the existing `if (kind === "classes" || kind === "full")` block, add:

```typescript
    if (kind === "triggers" || kind === "full") {
      const triggers = await listApexTriggers(conn);
      await upsertTriggers(admin, orgId, triggers);
      counts.triggers = triggers.length;
    }

    if (kind === "flows" || kind === "full") {
      const flows = await listFlows(conn);
      await upsertFlows(admin, orgId, flows);
      counts.flows = flows.length;
    }

    if (kind === "workflows" || kind === "full") {
      const workflows = await listWorkflowRules(conn);
      await upsertWorkflows(admin, orgId, workflows);
      counts.workflows = workflows.length;
    }
```

- [ ] **Step 4: Add the three new upsert helpers**

Append these after the existing `syncFields` function:

```typescript
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

async function upsertFlows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  flows: FlowSummary[],
) {
  if (flows.length === 0) return;
  const now = new Date().toISOString();
  const rows = flows.map((f) => ({
    org_id: orgId,
    api_name: f.api_name,
    label: f.label,
    process_type: f.process_type,
    status: f.status,
    last_synced_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("salesforce_metadata_flows")
      .upsert(rows.slice(i, i + 500), { onConflict: "org_id,api_name" });
    if (error) throw new Error(`upsert flows: ${error.message}`);
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
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 9: Write sf_created_at in OAuth Callback

**Files:**
- Modify: `app/api/salesforce/oauth/callback/route.ts`

- [ ] **Step 1: Extend the `fetchOrgIdentity` return type and fetch**

In `fetchOrgIdentity`, replace the type cast for `org`:

```typescript
  const org = (await orgRes.json()) as {
    Id: string;
    Name: string;
    OrganizationType: string;
    IsSandbox: boolean;
    CreatedDate: string;
  };

  return {
    sf_org_id: org.Id,
    display_name: org.Name,
    org_type: normalizeOrgType(org.OrganizationType, org.IsSandbox),
    sf_created_at: org.CreatedDate,
  };
```

- [ ] **Step 2: Use `sf_created_at` in the upsert**

In the `GET` handler, the `orgInfo` object now has `sf_created_at`. Add it to the upsert payload. Find the `admin.from("connected_salesforce_orgs").upsert(...)` call and add `sf_created_at: orgInfo.sf_created_at` to the object:

```typescript
  const { data: upserted, error } = await admin
    .from("connected_salesforce_orgs")
    .upsert(
      {
        user_id: user.id,
        sf_org_id: orgInfo.sf_org_id,
        org_type: orgInfo.org_type,
        sf_created_at: orgInfo.sf_created_at,
        instance_url: token.instance_url,
        login_host: parsed.login_host,
        display_name: orgInfo.display_name,
        status: "active",
        access_token_ct: byteaForInsert(access.ct),
        access_token_iv: byteaForInsert(access.iv),
        refresh_token_ct: byteaForInsert(refresh.ct),
        refresh_token_iv: byteaForInsert(refresh.iv),
        scopes: (token.scope ?? "").split(" ").filter(Boolean),
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "user_id,sf_org_id" },
    )
    .select("id")
    .single();
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 10: Overview Page — Stats Grid

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/active-org";
import { EmptyState } from "@/components/ui/empty-state";

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const activeOrgId = await getActiveOrgId(user.id);

  if (!activeOrgId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Overview</h1>
        <EmptyState
          title="Nothing here yet"
          description="Connect a Salesforce org and sync its metadata to see a summary on this page."
        />
      </div>
    );
  }

  // Fetch org info + all counts in parallel.
  const [
    orgResult,
    standardObjResult,
    customObjResult,
    customMetaResult,
    customSettingsResult,
    workflowsResult,
    processBuilderResult,
    flowsResult,
    triggersResult,
    classesResult,
  ] = await Promise.all([
    supabase
      .from("connected_salesforce_orgs")
      .select("display_name, alias, sf_created_at")
      .eq("id", activeOrgId)
      .single(),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("is_custom", false),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("is_custom", true)
      .not("api_name", "ilike", "%__mdt")
      .filter("summary->>custom_setting", "eq", "false"),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .ilike("api_name", "%__mdt"),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .filter("summary->>custom_setting", "eq", "true"),
    supabase
      .from("salesforce_metadata_workflows")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId),
    supabase
      .from("salesforce_metadata_flows")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("process_type", "Workflow"),
    supabase
      .from("salesforce_metadata_flows")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("process_type", "Flow"),
    supabase
      .from("salesforce_metadata_triggers")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId),
    supabase
      .from("salesforce_metadata_classes")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId),
  ]);

  const org = orgResult.data;
  const orgName = org?.alias || org?.display_name || "Connected Org";
  const sfCreatedAt = org?.sf_created_at
    ? new Date(org.sf_created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const stats = [
    { label: "Org Creation Date", value: sfCreatedAt },
    { label: "Standard Objects", value: standardObjResult.count ?? 0 },
    { label: "Custom Objects", value: customObjResult.count ?? 0 },
    { label: "Custom Metadata", value: customMetaResult.count ?? 0 },
    { label: "Custom Settings", value: customSettingsResult.count ?? 0 },
    { label: "Workflows", value: workflowsResult.count ?? 0 },
    { label: "Process Builders", value: processBuilderResult.count ?? 0 },
    { label: "Flows", value: flowsResult.count ?? 0 },
    { label: "Triggers", value: triggersResult.count ?? 0 },
    { label: "Apex Classes", value: classesResult.count ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{orgName}</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <dt className="text-xs text-neutral-500">{s.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 11: Metadata Page — New Tabs + Remove Inline Org Switcher

**Files:**
- Modify: `app/dashboard/metadata/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/active-org";

type Tab = "objects" | "classes" | "triggers" | "flows" | "process-builders" | "workflows";

const TABS: { value: Tab; label: string }[] = [
  { value: "objects", label: "Objects" },
  { value: "classes", label: "Apex Classes" },
  { value: "triggers", label: "Triggers" },
  { value: "flows", label: "Flows" },
  { value: "process-builders", label: "Process Builders" },
  { value: "workflows", label: "Workflows" },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.value));

export default async function MetadataPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = VALID_TABS.has(sp.tab ?? "") ? (sp.tab as Tab) : "objects";
  const q = sp.q?.trim() || "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const activeOrgId = await getActiveOrgId(user.id);

  if (!activeOrgId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Metadata</h1>
        <EmptyState
          title="No orgs connected"
          description="Connect a Salesforce org first, then sync its metadata."
        />
      </div>
    );
  }

  const tabHref = (which: Tab) => {
    const params = new URLSearchParams();
    params.set("tab", which);
    if (q) params.set("q", q);
    return `/dashboard/metadata?${params.toString()}`;
  };

  // ── Data fetch ──────────────────────────────────────────────────────────

  let rows: React.ReactNode = null;

  if (tab === "objects") {
    let query = supabase
      .from("salesforce_metadata_objects")
      .select("id, api_name, label, is_custom")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.or(`api_name.ilike.%${q}%,label.ilike.%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No objects yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/dashboard/metadata/objects/${o.id}`}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <div className="font-mono">{o.api_name}</div>
                  {o.label ? <div className="text-xs text-neutral-500">{o.label}</div> : null}
                </div>
                {o.is_custom ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                    custom
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      );
  } else if (tab === "classes") {
    let query = supabase
      .from("salesforce_metadata_classes")
      .select("id, api_name, api_version, status")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No Apex classes yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="font-mono">{c.api_name}</div>
              <div className="text-xs text-neutral-500">
                {c.status ?? ""}
                {c.api_version ? ` · v${c.api_version}` : ""}
              </div>
            </li>
          ))}
        </ul>
      );
  } else if (tab === "triggers") {
    let query = supabase
      .from("salesforce_metadata_triggers")
      .select("id, api_name, object_name, status")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No triggers yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-mono">{t.api_name}</div>
                {t.object_name ? <div className="text-xs text-neutral-500">{t.object_name}</div> : null}
              </div>
              {t.status ? (
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    t.status === "Active"
                      ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {t.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
  } else if (tab === "flows" || tab === "process-builders") {
    const processType = tab === "flows" ? "Flow" : "Workflow";
    let query = supabase
      .from("salesforce_metadata_flows")
      .select("id, api_name, label, status")
      .eq("org_id", activeOrgId)
      .eq("process_type", processType)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.or(`api_name.ilike.%${q}%,label.ilike.%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    const emptyLabel = tab === "flows" ? "No flows yet" : "No process builders yet";
    rows =
      items.length === 0 ? (
        <EmptyState title={emptyLabel} description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-mono">{f.api_name}</div>
                {f.label ? <div className="text-xs text-neutral-500">{f.label}</div> : null}
              </div>
              {f.status ? (
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    f.status === "Active"
                      ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {f.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
  } else {
    // workflows
    let query = supabase
      .from("salesforce_metadata_workflows")
      .select("id, api_name, object_name, active")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No workflows yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-mono">{w.api_name}</div>
                {w.object_name ? <div className="text-xs text-neutral-500">{w.object_name}</div> : null}
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  w.active
                    ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                {w.active ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Metadata</h1>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={tabHref(t.value)}
              className={`rounded px-2 py-1 ${
                tab === t.value
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <form className="ml-auto">
          <input type="hidden" name="tab" value={tab} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="w-64 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </form>
      </div>

      {rows}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

---

## Task 12: Update docs/database-schema.md

**Files:**
- Modify: `docs/database-schema.md`

- [ ] **Step 1: Add `sf_created_at` to the `connected_salesforce_orgs` table**

In the `connected_salesforce_orgs` table, add this row after `last_sync_at`:

```
| `sf_created_at`     | timestamptz | nullable — org creation date fetched from `Organization.CreatedDate` |
```

- [ ] **Step 2: Add the three new tables**

Append after the `salesforce_metadata_classes` section:

```markdown
### `salesforce_metadata_triggers`

| column          | type        | notes                                                |
|-----------------|-------------|------------------------------------------------------|
| `id`            | uuid PK     |                                                      |
| `org_id`        | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `api_name`      | text        | Trigger name                                         |
| `object_name`   | text        | SObject the trigger fires on                         |
| `status`        | text        | `Active \| Inactive`                                 |
| `events`        | text[]      | e.g. `['before insert', 'after update']`             |
| `last_synced_at`| timestamptz |                                                      |

Indexes: `(org_id)`; unique `(org_id, api_name)`.
RLS: joined through org.

### `salesforce_metadata_flows`

Stores both Flows (`process_type = 'Flow'`) and Process Builders (`process_type = 'Workflow'`).

| column          | type        | notes                                                |
|-----------------|-------------|------------------------------------------------------|
| `id`            | uuid PK     |                                                      |
| `org_id`        | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `api_name`      | text        | `FlowDefinition.ApiName`                             |
| `label`         | text        | Human-readable name                                  |
| `process_type`  | text        | `Flow \| AutoLaunchedFlow \| Workflow \| ...`        |
| `status`        | text        | `Active \| Inactive \| Draft \| Obsolete`            |
| `last_synced_at`| timestamptz |                                                      |

Indexes: `(org_id)`; unique `(org_id, api_name)`.
RLS: joined through org.

### `salesforce_metadata_workflows`

| column          | type        | notes                                                |
|-----------------|-------------|------------------------------------------------------|
| `id`            | uuid PK     |                                                      |
| `org_id`        | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `api_name`      | text        | `WorkflowRule.Name`                                  |
| `object_name`   | text        | SObject the rule belongs to (`TableEnumOrId`)        |
| `active`        | boolean     |                                                      |
| `last_synced_at`| timestamptz |                                                      |

Indexes: `(org_id)`; unique `(org_id, api_name)`.
RLS: joined through org.
```

- [ ] **Step 3: Update `metadata_sync_jobs.kind` values**

In the `metadata_sync_jobs` table, update the `kind` row's notes:

```
| `kind`         | text        | `objects | fields | classes | triggers | flows | workflows | full` |
```

---

## Task 13: Final Typecheck & Manual Smoke Test

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke test the org switcher**

1. Navigate to `http://localhost:3000/dashboard`.
2. Confirm the topbar shows a `<select>` with your connected orgs (or "No orgs connected" if none).
3. If you have multiple orgs, switch between them — the page should re-render without a full browser reload.

- [ ] **Step 4: Smoke test the overview page**

1. Navigate to `/dashboard`.
2. If an org is connected and synced, you should see a grid of stat cards with counts.
3. If no sync has been run, counts should show 0.

- [ ] **Step 5: Smoke test the metadata page**

1. Navigate to `/dashboard/metadata`.
2. Confirm there is no org `<select>` inside the page — switching is only via the topbar.
3. Confirm 6 tabs are visible: Objects, Apex Classes, Triggers, Flows, Process Builders, Workflows.
4. Click each tab — it should load the appropriate empty state or data list.
5. Test the search field on the Objects tab.

- [ ] **Step 6: Smoke test the full sync**

Trigger a full sync for a connected org (via the Refresh Metadata button on the org detail page). After sync completes:
1. Revisit `/dashboard` — Triggers, Flows, Process Builders, and Workflows counts should be populated.
2. Check `/dashboard/metadata` Triggers tab — trigger names and target objects should appear.
