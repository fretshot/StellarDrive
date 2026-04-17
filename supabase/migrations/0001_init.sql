-- StellarDrive — initial schema
-- See /docs/database-schema.md for the authoritative description.

create extension if not exists "pgcrypto";

-- =========================================================================
-- profiles
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- connected_salesforce_orgs
-- =========================================================================
create table public.connected_salesforce_orgs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sf_org_id text not null,
  org_type text not null check (org_type in ('production','sandbox','developer','scratch','custom')),
  instance_url text not null,
  login_host text not null,
  alias text,
  display_name text,
  status text not null default 'active' check (status in ('active','expired','revoked','error')),
  access_token_ct bytea not null,
  access_token_iv bytea not null,
  refresh_token_ct bytea not null,
  refresh_token_iv bytea not null,
  scopes text[] not null default '{}',
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, sf_org_id)
);

create index on public.connected_salesforce_orgs (user_id);

alter table public.connected_salesforce_orgs enable row level security;

create policy "orgs_all_own"
  on public.connected_salesforce_orgs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- salesforce_metadata_objects
-- =========================================================================
create table public.salesforce_metadata_objects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  api_name text not null,
  label text,
  is_custom boolean not null default false,
  key_prefix text,
  createable boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  unique (org_id, api_name)
);

create index on public.salesforce_metadata_objects (org_id);

alter table public.salesforce_metadata_objects enable row level security;

create policy "meta_objects_all_own"
  on public.salesforce_metadata_objects for all
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
-- salesforce_metadata_fields
-- =========================================================================
create table public.salesforce_metadata_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  object_id uuid not null references public.salesforce_metadata_objects(id) on delete cascade,
  api_name text not null,
  label text,
  data_type text,
  is_required boolean not null default false,
  is_custom boolean not null default false,
  reference_to text[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  unique (object_id, api_name)
);

create index on public.salesforce_metadata_fields (object_id);

alter table public.salesforce_metadata_fields enable row level security;

create policy "meta_fields_all_own"
  on public.salesforce_metadata_fields for all
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
-- salesforce_metadata_classes
-- =========================================================================
create table public.salesforce_metadata_classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  api_name text not null,
  api_version text,
  status text,
  body_hash text,
  summary jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  unique (org_id, api_name)
);

create index on public.salesforce_metadata_classes (org_id);

alter table public.salesforce_metadata_classes enable row level security;

create policy "meta_classes_all_own"
  on public.salesforce_metadata_classes for all
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
-- metadata_sync_jobs
-- =========================================================================
create table public.metadata_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete cascade,
  kind text not null check (kind in ('objects','fields','classes','full')),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed')),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index on public.metadata_sync_jobs (org_id, created_at desc);

alter table public.metadata_sync_jobs enable row level security;

create policy "sync_jobs_all_own"
  on public.metadata_sync_jobs for all
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
-- chat_sessions
-- =========================================================================
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  active_org_id uuid references public.connected_salesforce_orgs(id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default now()
);

create index on public.chat_sessions (user_id, created_at desc);

alter table public.chat_sessions enable row level security;

create policy "chat_sessions_all_own"
  on public.chat_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- chat_messages
-- =========================================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index on public.chat_messages (session_id, created_at);

alter table public.chat_messages enable row level security;

create policy "chat_messages_all_own"
  on public.chat_messages for all
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- =========================================================================
-- action_previews
-- =========================================================================
create table public.action_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete cascade,
  org_id uuid not null references public.connected_salesforce_orgs(id) on delete restrict,
  action_type text not null,
  payload jsonb not null,
  preview jsonb not null,
  validation jsonb not null default '{"ok": true}'::jsonb,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','expired','executed','failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index on public.action_previews (user_id, created_at desc);
create index on public.action_previews (session_id);

alter table public.action_previews enable row level security;

create policy "previews_all_own"
  on public.action_previews for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- action_executions
-- =========================================================================
create table public.action_executions (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid not null unique references public.action_previews(id) on delete cascade,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  result jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.action_executions enable row level security;

create policy "executions_all_own"
  on public.action_executions for all
  using (
    exists (
      select 1 from public.action_previews p
      where p.id = preview_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.action_previews p
      where p.id = preview_id and p.user_id = auth.uid()
    )
  );

-- =========================================================================
-- audit_logs
-- =========================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.connected_salesforce_orgs(id) on delete set null,
  action_type text not null,
  entity_type text,
  entity_ref text,
  outcome text not null check (outcome in ('success','failure','warning')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.audit_logs (user_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_select_own"
  on public.audit_logs for select
  using (user_id = auth.uid());
-- Inserts happen via the service-role key from server code, so no insert policy is needed.
