# StellarDrive — Architecture Overview

StellarDrive is a multi-tenant SaaS that helps individual Salesforce administrators analyze and manage their Salesforce orgs through an AI-assisted chat interface. This document is the top-level architecture reference. Code scaffolding is aligned with it — if they disagree, this document wins until reconciled in a PR.

## Product one-liner

Connect a Salesforce org, let an AI assistant answer questions about its metadata, and let the assistant create new metadata (custom fields, objects, permission sets) and records through a guarded preview → confirm → execute pipeline.

## Guiding principles

- **Docs are the source of truth.** Every meaningful architectural decision lives in `/docs` first and is then reflected in code.
- **Individual ownership.** Every row belongs to exactly one user. No shared workspaces in Phase 1. Multi-tenancy is enforced at the database with Supabase RLS.
- **Secrets never leave the server.** Salesforce tokens, the Anthropic API key, and the service-role Supabase key are only ever handled by server code.
- **Mutations are never silent.** Any action that changes Salesforce state must flow through preview → validation → confirmation → execution → audit. Read-only actions execute immediately.
- **Phase 1 is CREATE-only.** No updates or deletes — neither in the action registry nor in the UI. The AI is instructed that these actions do not exist.
- **Provider-pluggable auth.** Email/password today; the auth surface is shaped so Microsoft SSO can be added later without touching the data layer.

## Layered architecture

```
┌───────────────────────────────────────────────────────────────┐
│ UI Layer (React Server Components + client components)        │
│   app/(dashboard)/*, components/*                             │
└───────────────┬───────────────────────────────────────────────┘
                │ server actions + fetch /api
┌───────────────▼───────────────────────────────────────────────┐
│ Orchestration Layer (Next.js route handlers + server actions) │
│   app/api/*                                                   │
└──┬─────────────────┬──────────────────┬──────────────────┬────┘
   │                 │                  │                  │
   ▼                 ▼                  ▼                  ▼
┌──────────┐  ┌─────────────┐  ┌───────────────┐  ┌──────────────┐
│ Auth     │  │ AI Chat     │  │ Salesforce    │  │ Persistence  │
│ lib/     │  │ lib/ai/*    │  │ lib/salesforce│  │ Supabase     │
│ supabase │  │ lib/actions │  │               │  │ (Postgres+   │
│          │  │             │  │               │  │  Auth+RLS)   │
└──────────┘  └─────────────┘  └───────────────┘  └──────────────┘
```

Each arrow is a one-way call. The UI layer never reaches around orchestration to touch Salesforce or Claude directly. The AI layer calls into the action registry, and the action registry calls into the Salesforce layer; the AI layer never imports `jsforce`.

### UI layer

- **Framework**: Next.js 15 App Router, React Server Components by default, client components only where interactivity demands it (chat input, dialogs, forms).
- **Styling**: Tailwind CSS v4.
- **Dashboard shell**: a persistent two-pane layout — left `Sidebar`, top `Topbar`, content area. The sidebar has the sections:
  - **Overview** — summary of connected orgs, recent actions, recent chats.
  - **Orgs** — list of connected Salesforce orgs, connect-new-org flow.
  - **Metadata** — browse persisted metadata (objects, fields, Apex classes).
  - **Chat** — the AI assistant.
  - **Audit** — history of action previews, executions, and outcomes.
  - **Settings** — account + app preferences.
- The topbar carries the **active-org switcher**, user menu, and global status (e.g. "metadata sync running").

### Orchestration layer

- All mutating or Salesforce-touching work is in server code — either server actions or route handlers under `app/api`.
- Route handlers that talk to Salesforce or Claude use `export const runtime = "nodejs"` because `jsforce` relies on Node-only APIs.
- The orchestration layer is thin: it authenticates the caller, validates input with Zod, calls into `lib/*`, and returns a typed response.

### AI chat layer (`lib/ai/*`)

- Wraps the Anthropic SDK. Prompt caching is on by default for the system prompt and the tool-definitions block.
- Classifies intent with a cheap Haiku call (`informational | mutating | ambiguous`) before running the main tool-using turn.
- Surfaces tools to the main Opus model from the action registry (`lib/actions/registry.ts`). The AI layer does not know how tools execute; it only forwards tool-use requests and tool results.

### Action layer (`lib/actions/*`)

- A typed registry of actions. Each action declares:
  - `name` and human-readable label,
  - `readOnly: boolean`,
  - `zodInput` — input schema,
  - `preview(input, ctx)` — returns a structured preview (for mutating actions),
  - `validate(input, ctx)` — returns validation errors,
  - `execute(input, ctx)` — performs the action.
- Read-only actions run inline during a chat turn.
- Mutating actions persist a row in `action_previews`, render a confirmation card in chat, and only execute after the user confirms via `POST /api/actions/execute`.
- Every preview, confirmation, execution, and outcome writes an `audit_logs` row.

### Salesforce integration layer (`lib/salesforce/*`)

- OAuth (authorize URL + state/PKCE + token exchange).
- A `getSalesforceConnection(orgId)` helper returns a ready-to-use `jsforce` Connection, transparently refreshing tokens when needed and re-encrypting them.
- Three strictly separated submodules:
  - `metadata.ts` — describes and lists (read-only).
  - `metadata-deploy.ts` — Metadata API deploys for custom fields / objects / permission sets (CREATE only in Phase 1).
  - `records.ts` — SObject DML (CREATE only in Phase 1).

### Persistence layer

- Supabase Postgres. All tables have RLS on. Every row either has a `user_id` column directly or is reachable through a join that does.
- Two Supabase client flavors:
  - Anon-key SSR client, scoped to the current user, for normal request handling.
  - Service-role client (`lib/supabase/admin.ts`), used only by server code for internal jobs (e.g. writing audit logs when the user context is already established server-side and RLS would otherwise require additional hops).
- Schema is managed via SQL migrations in `/supabase/migrations`.

### Auth layer

- Supabase Auth, email/password to start.
- Session is a cookie managed by `@supabase/ssr`. Middleware (`middleware.ts`) refreshes it on every request and redirects unauthenticated users off dashboard routes.
- A database trigger creates a `profiles` row the first time a user signs up.
- **Future SSO**: Microsoft SSO will be added via Supabase's external providers. The app only depends on `auth.uid()` and `auth.users.email`, which remain stable across providers, so no app-layer changes are expected beyond copy in the login page.

## Multi-tenancy model

- **Unit of ownership**: a single user.
- **Isolation mechanism**: Postgres RLS. Every table has a policy like `USING (user_id = auth.uid())` (or the join equivalent).
- **Cross-user leaks**: impossible at the database level as long as RLS is enforced — the anon-key client carries the user's JWT, so even a bug in application code can't return another user's row.
- **Service-role usage**: intentionally narrow. It is only used where the caller has already authenticated the user server-side and we need to write audit or system rows that RLS would otherwise block.
- **Salesforce-org ownership**: each `connected_salesforce_orgs` row has a `user_id`. A user can have N orgs. The active-org switcher in the topbar controls which org context the chat and metadata views use.

## Inspirations (not clones)

- **Gearset** — informs the metadata-visibility UX: clean lists, searchable, with a strong sense of "what's in my org".
- **MeshMesh** — informs the AI-chat UX: the assistant can propose concrete Salesforce actions and the user confirms them.

These shape the product direction; no copied designs or workflows.

## Secrets and environment

- `.env.local` (gitignored) holds:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`
  - `TOKEN_ENCRYPTION_KEY` (32-byte base64) — used for AES-GCM of SF tokens at rest
  - `APP_URL` (e.g. `http://localhost:3000`) — used to build the OAuth redirect URI
- `lib/env.ts` validates these at startup so misconfiguration is a build-time/boot-time failure rather than a runtime surprise.
