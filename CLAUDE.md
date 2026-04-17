# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**StellarDrive** — multi-tenant SaaS that helps Salesforce admins analyze and manage their orgs through an AI-assisted chatbot. Individual-user ownership (no shared workspaces). Phase 1 is CREATE-only for metadata and records; update/delete are out of scope.

## Source of truth

`/docs` is authoritative. Read these before making non-trivial changes:

- `docs/architecture-overview.md` — layered architecture, dashboard shell, multi-tenancy model.
- `docs/database-schema.md` — every table, column, FK, RLS policy.
- `docs/salesforce-integration.md` — OAuth flow, token lifecycle, metadata sync strategy.
- `docs/ai-action-architecture.md` — tool registry, preview → confirm → execute pipeline, audit trail.
- `docs/phase-1-roadmap.md` — milestones and exit criteria.

If code disagrees with the docs, update the docs first, then change the code.

## Commands

```bash
npm install               # install deps
npm run dev               # Next dev server (http://localhost:3000)
npm run build             # production build
npm run typecheck         # tsc --noEmit
npm run lint              # next lint
```

Regenerate Supabase types after migrations: `npx supabase gen types typescript --local > types/database.ts`.

There is no test suite yet — do not hunt for a test runner or script.

## Architecture quick map

- `app/(auth)/**` — login/signup/logout server actions.
- `app/dashboard/**` — sidebar-shelled dashboard: Overview, Orgs, Metadata, Chat, Audit, Settings.
- `app/api/**` — route handlers. Anything touching Salesforce or Claude uses `export const runtime = "nodejs"`.
- `proxy.ts` — the Next.js middleware entry point; thin re-export of `lib/supabase/middleware.ts` session refresh.
- `lib/env.ts` — zod-validated env; call `requireEnv()` at boot time.
- `lib/supabase/{server,client,middleware,admin}.ts` — Supabase client flavors.
  - `admin.ts` uses the service-role key and **bypasses RLS** — use only from server-authenticated paths.
- `lib/crypto/tokens.ts` — AES-256-GCM for Salesforce tokens at rest. Use `lib/crypto/bytea.ts` helpers (`byteaForInsert` / `byteaFromSelect`) whenever reading or writing `bytea` columns through PostgREST.
- `lib/salesforce/*` — three strict submodules: read-only `metadata.ts`, metadata-deploy `metadata-deploy.ts`, SObject DML `records.ts`. `connection.ts` refreshes tokens transparently.
- `lib/actions/*` — the action registry (`registry.ts`), typed `ActionDefinition`, and the preview/execute pipeline in `executor.ts`. **The AI never calls Salesforce directly — only through actions.**
- `lib/ai/*` — Anthropic client with prompt caching (`claude.ts`), intent classifier, tool-definition builder.
- `lib/audit.ts` — `writeAudit(event)` server-only helper; writes to `audit_logs` via the service-role client.
- `types/domain.ts` — app-wide enums (`OrgStatus`, `PreviewStatus`, `AuditOutcome`). Generated DB types live in `types/database.ts`.
- `supabase/migrations/0001_init.sql` — schema + RLS + `handle_new_user` trigger.

## Hard rules

- **No update or delete actions** anywhere in Phase 1 — not in the registry, not in UI, not in docs. The system is intentionally CREATE-only.
- **Every mutating action goes through preview → validate → confirm → execute → audit.** Never add a fast-path that skips the preview.
- **Secrets stay server-side.** `TOKEN_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `SALESFORCE_CLIENT_SECRET` must not be imported from any client component or file without a `"server-only"` import.
- **RLS is enforced by default.** Use the service-role client only when you have already authenticated the caller server-side.
- **Token encryption is non-negotiable.** Access and refresh tokens persist only as `bytea` ciphertext with per-row IVs.
- **`runtime = "nodejs"`** on any route handler that uses `jsforce`, the Anthropic SDK with tool-use, or `node:crypto`.

## Extending

Add a new AI-callable action by:

1. Defining an `ActionDefinition` in `lib/actions/registry.ts` with a Zod input schema.
2. Pointing its `execute` at the correct `lib/salesforce/*` module (never skip this indirection).
3. For mutating actions, implementing `preview` and `validate`.
4. Updating `docs/ai-action-architecture.md` if the set of tools changes.

Add a new DB table by: writing a new numbered migration in `supabase/migrations/`, updating `docs/database-schema.md`, then regenerating `types/database.ts`.
