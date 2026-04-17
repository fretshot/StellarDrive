# StellarDrive — Database Schema (Phase 1)

Implemented in `supabase/migrations/0001_init.sql`. Every table has RLS on and a policy that resolves to `user_id = auth.uid()` (directly or through a parent).

## Conventions

- Primary keys are `uuid` with `default gen_random_uuid()`.
- Timestamps are `timestamptz` with `default now()`.
- Enumerations are Postgres `text` columns with `CHECK` constraints (easier to migrate than true enum types).
- Foreign keys cascade on delete where the child row is meaningless without the parent (e.g. metadata rows cascade from an org row), and restrict otherwise.
- Encrypted blobs are `bytea` columns with the suffix `_ct` (ciphertext). The matching `_iv` column holds the 12-byte GCM nonce.

## Tables

### `profiles`

Mirror row for `auth.users`. Created by a trigger (`handle_new_user`) on signup.

| column       | type         | notes                                    |
|--------------|--------------|------------------------------------------|
| `id`         | uuid PK      | `references auth.users(id) on delete cascade` |
| `email`      | text         | copied from `auth.users.email`           |
| `full_name`  | text         | nullable                                 |
| `created_at` | timestamptz  |                                          |

RLS: `id = auth.uid()` for select/update.

### `connected_salesforce_orgs`

One row per connected Salesforce org owned by one user.

| column              | type        | notes                                              |
|---------------------|-------------|----------------------------------------------------|
| `id`                | uuid PK     |                                                    |
| `user_id`           | uuid        | `references auth.users(id) on delete cascade`      |
| `sf_org_id`         | text        | Salesforce 18-char org id                          |
| `org_type`          | text        | `production | sandbox | developer | scratch | custom` |
| `instance_url`      | text        |                                                    |
| `login_host`        | text        | `login.salesforce.com | test.salesforce.com | <my domain>` |
| `alias`             | text        | nullable — user-chosen                             |
| `display_name`      | text        | from `Organization.Name`                           |
| `status`            | text        | `active | expired | revoked | error`              |
| `access_token_ct`   | bytea       | encrypted access token                             |
| `access_token_iv`   | bytea       |                                                    |
| `refresh_token_ct`  | bytea       | encrypted refresh token                            |
| `refresh_token_iv`  | bytea       |                                                    |
| `scopes`            | text[]      |                                                    |
| `issued_at`         | timestamptz |                                                    |
| `expires_at`        | timestamptz | access-token expiry                                |
| `last_sync_at`      | timestamptz | nullable                                           |
| `sf_created_at`     | timestamptz | nullable — org creation date fetched from `Organization.CreatedDate` |
| `last_error`        | text        | nullable                                           |
| `created_at`        | timestamptz |                                                    |

Indexes: `(user_id)`; unique `(user_id, sf_org_id)`.
RLS: `user_id = auth.uid()` for all ops.

### `salesforce_metadata_objects`

Normalized summary of one SObject in one org.

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `org_id`       | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `api_name`     | text        |                                                      |
| `label`        | text        |                                                      |
| `is_custom`    | boolean     |                                                      |
| `key_prefix`   | text        | nullable                                             |
| `createable`   | boolean     |                                                      |
| `summary`      | jsonb       | subset of the raw describe                           |
| `last_synced_at` | timestamptz |                                                    |

Indexes: `(org_id)`; unique `(org_id, api_name)`.
RLS: joined on `connected_salesforce_orgs.user_id = auth.uid()`.

### `salesforce_metadata_fields`

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `org_id`       | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `object_id`    | uuid        | `references salesforce_metadata_objects(id) on delete cascade` |
| `api_name`     | text        |                                                      |
| `label`        | text        |                                                      |
| `data_type`    | text        |                                                      |
| `is_required`  | boolean     |                                                      |
| `is_custom`    | boolean     |                                                      |
| `reference_to` | text[]      | for lookup/MD fields                                 |
| `summary`      | jsonb       |                                                      |

Indexes: `(object_id)`; unique `(object_id, api_name)`.
RLS: joined through `salesforce_metadata_objects` to `connected_salesforce_orgs.user_id`.

### `salesforce_metadata_classes`

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `org_id`       | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `api_name`     | text        | `Name` of the ApexClass                              |
| `api_version`  | text        | e.g. `62.0`                                          |
| `status`       | text        | `Active | Deleted | Inactive`                        |
| `body_hash`    | text        | sha256 of the class body — lets us detect changes cheaply |
| `summary`      | jsonb       | method/interface hints for AI context                |
| `last_synced_at` | timestamptz |                                                    |

Indexes: `(org_id)`; unique `(org_id, api_name)`.
RLS: joined through org.

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

### `metadata_sync_jobs`

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `org_id`       | uuid        | `references connected_salesforce_orgs(id) on delete cascade` |
| `kind`         | text        | `objects | fields | classes | triggers | flows | workflows | full` |
| `status`       | text        | `pending | running | succeeded | failed`             |
| `started_at`   | timestamptz | nullable                                             |
| `finished_at`  | timestamptz | nullable                                             |
| `error`        | text        | nullable                                             |
| `created_at`   | timestamptz |                                                      |

Indexes: `(org_id, created_at desc)`.
RLS: joined through org.

### `chat_sessions`

| column          | type        | notes                                                |
|-----------------|-------------|------------------------------------------------------|
| `id`            | uuid PK     |                                                      |
| `user_id`       | uuid        | `references auth.users(id) on delete cascade`        |
| `active_org_id` | uuid        | `references connected_salesforce_orgs(id) on delete set null`, nullable |
| `title`         | text        |                                                      |
| `created_at`    | timestamptz |                                                      |

Indexes: `(user_id, created_at desc)`.
RLS: `user_id = auth.uid()`.

### `chat_messages`

| column          | type        | notes                                                |
|-----------------|-------------|------------------------------------------------------|
| `id`            | uuid PK     |                                                      |
| `session_id`    | uuid        | `references chat_sessions(id) on delete cascade`     |
| `role`          | text        | `user | assistant | tool`                            |
| `content`       | jsonb       | Anthropic-style content blocks                       |
| `tool_calls`    | jsonb       | nullable — captured tool_use blocks for easier UI    |
| `created_at`    | timestamptz |                                                      |

Indexes: `(session_id, created_at)`.
RLS: joined through `chat_sessions`.

### `action_previews`

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `user_id`      | uuid        | `references auth.users(id) on delete cascade`        |
| `session_id`   | uuid        | `references chat_sessions(id) on delete cascade`     |
| `message_id`   | uuid        | `references chat_messages(id) on delete cascade`, nullable |
| `org_id`       | uuid        | `references connected_salesforce_orgs(id) on delete restrict` |
| `action_type`  | text        | e.g. `create_custom_field`                           |
| `payload`      | jsonb       | the raw tool input                                   |
| `preview`      | jsonb       | `{ summary, diff, targets, risks }`                  |
| `validation`   | jsonb       | `{ ok: bool, issues: [...] }`                        |
| `status`       | text        | `pending | confirmed | rejected | expired | executed | failed` |
| `created_at`   | timestamptz |                                                      |
| `confirmed_at` | timestamptz | nullable                                             |

Indexes: `(user_id, created_at desc)`, `(session_id)`.
RLS: `user_id = auth.uid()`.

### `action_executions`

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `preview_id`   | uuid UNIQUE | `references action_previews(id) on delete cascade`   |
| `status`       | text        | `running | succeeded | failed`                       |
| `result`       | jsonb       | structured result (new record id, deploy id, …)      |
| `error`        | text        | nullable                                             |
| `started_at`   | timestamptz |                                                      |
| `finished_at`  | timestamptz | nullable                                             |

RLS: joined through `action_previews.user_id`.

### `audit_logs`

Append-only. The source of truth for "what did the system do on this user's behalf?"

| column         | type        | notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | uuid PK     |                                                      |
| `user_id`      | uuid        | `references auth.users(id) on delete cascade`        |
| `org_id`       | uuid        | `references connected_salesforce_orgs(id) on delete set null`, nullable |
| `action_type`  | text        | e.g. `preview.created`, `action.executed`            |
| `entity_type`  | text        | e.g. `CustomField`, `Contact`                        |
| `entity_ref`   | text        | identifier of the affected SF entity, when known     |
| `outcome`      | text        | `success | failure | warning`                        |
| `metadata`     | jsonb       | free-form                                            |
| `created_at`   | timestamptz |                                                      |

Indexes: `(user_id, created_at desc)`.
RLS: `user_id = auth.uid()` — select only. Writes happen via server code using the service-role client so we can record outcomes even when the user session has already started to unwind.

## Triggers

- `handle_new_user()` fires `after insert on auth.users`, inserting the corresponding `profiles` row.

## Regeneration of TypeScript types

Run `npx supabase gen types typescript --local > types/database.ts` after applying migrations. This file is not hand-edited.
