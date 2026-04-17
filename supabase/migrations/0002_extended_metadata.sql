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
  drop constraint if exists metadata_sync_jobs_kind_check;

alter table public.metadata_sync_jobs
  add constraint metadata_sync_jobs_kind_check
    check (kind in ('objects','fields','classes','triggers','flows','workflows','full'));
