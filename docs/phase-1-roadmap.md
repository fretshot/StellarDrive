# StellarDrive — Phase 1 Roadmap

Phase 1 delivers: OAuth-connected Salesforce orgs, persisted metadata browsing, AI chat that can answer questions and propose/execute CREATE actions for metadata and records, with a preview/confirm/audit pipeline.

Milestones are ordered. Each one is a standalone deliverable — merge, verify, move on. "Done" means the exit criteria are green; if they aren't, the milestone stays open.

---

## M1 — Foundations

**Objective.** A Next.js + TypeScript + Tailwind app that boots, with Supabase wiring stubbed in and `/docs` committed as the source of truth.

**Tasks.**
- `package.json`, `tsconfig.json` (strict), Tailwind, Next config.
- `.env.example` + `lib/env.ts` (zod-validated).
- Supabase client/server/middleware helpers.
- Next `middleware.ts` that refreshes the Supabase session.
- Root layout + a redirect page that routes to `/dashboard` or `/login`.
- Check in `/docs/*.md`.

**Dependencies.** None.

**Deliverable.** `npm run dev` boots; `npx tsc --noEmit` passes; visiting `/` redirects sensibly.

---

## M2 — Auth (email/password)

**Objective.** Users can sign up, log in, log out. Protected routes are actually protected.

**Tasks.**
- `/login` and `/signup` pages with server actions calling `supabase.auth.signInWithPassword` / `signUp`.
- `profiles` table + `handle_new_user` trigger (part of M4 migration — stubbed here).
- Middleware redirects unauthenticated users off `/dashboard/**`.
- Logout action.

**Dependencies.** M1.

**Deliverable.** Authenticated dashboard access works end-to-end against a live Supabase project.

---

## M3 — Dashboard shell

**Objective.** The sidebar + topbar layout with empty section pages.

**Tasks.**
- `app/(dashboard)/layout.tsx` with `Sidebar` + `Topbar`.
- Section pages: Overview, Orgs, Metadata, Chat, Audit, Settings — all render an empty state.
- Minimal Tailwind design language (typography, spacing, card, button).

**Dependencies.** M2.

**Deliverable.** Navigation works; every section renders a placeholder consistent with the design language.

---

## M4 — Supabase schema

**Objective.** All Phase 1 tables exist with RLS applied.

**Tasks.**
- Write `supabase/migrations/0001_init.sql` per `/docs/database-schema.md`.
- Apply against the dev project.
- Regenerate `types/database.ts`.
- Smoke-test RLS: querying as user A cannot read user B's rows.

**Dependencies.** M1.

**Deliverable.** Migration applies cleanly; types compile; RLS smoke test passes.

---

## M5 — Salesforce OAuth

**Objective.** A user can connect a Salesforce org from the dashboard and see it listed.

**Tasks.**
- Connect-org dialog: pick org type → submit.
- `/api/salesforce/oauth/authorize` — PKCE + state cookie + redirect.
- `/api/salesforce/oauth/callback` — token exchange, org-type detection, encrypted persistence.
- `lib/crypto/tokens.ts` (AES-256-GCM).
- `lib/salesforce/connection.ts` with refresh support.
- Orgs list page shows connected orgs + status.

**Dependencies.** M2, M4.

**Deliverable.** Production, sandbox, and developer orgs can all be connected. Tokens are encrypted in the DB. Disconnect is out of scope for Phase 1.

---

## M6 — Metadata sync

**Objective.** After connecting an org, a user can sync and browse its metadata (objects, fields, Apex classes).

**Tasks.**
- `lib/salesforce/metadata.ts` — global describe, per-object describe, Tooling API for Apex.
- `POST /api/salesforce/metadata/sync` — creates a sync job and runs it inline.
- Metadata browser UI with search and filters.
- "Refresh metadata" button on the org page.

**Dependencies.** M5.

**Deliverable.** Newly connected orgs populate the metadata tables; browser UI can search objects, view fields, and list Apex classes.

---

## M7 — AI chat (read-only)

**Objective.** A chat tab where the user can ask questions about connected orgs and metadata.

**Tasks.**
- `lib/ai/claude.ts` with prompt caching.
- `lib/ai/system-prompt.ts`, `lib/ai/tool-definitions.ts`.
- Intent classifier (Haiku).
- Read-only tools registered in `lib/actions/registry.ts` (list orgs, describe object, list fields, etc.).
- `POST /api/chat` streaming handler.
- `chat_sessions` + `chat_messages` persistence.
- `components/chat/chat-panel.tsx` — streaming UI.

**Dependencies.** M6.

**Deliverable.** A user can ask "How many custom fields are on Contact?" and get an accurate answer sourced from the persisted metadata.

---

## M8 — Action framework + mutating tools

**Objective.** The assistant can propose `create_custom_field`, `create_custom_object`, `create_permission_set`, `assign_permission_set`, and `create_record`; the user can confirm and execute them.

**Tasks.**
- `lib/actions/executor.ts` — preview → validate → confirm → execute pipeline.
- `lib/salesforce/metadata-deploy.ts` — CREATE deploys via Metadata API.
- `lib/salesforce/records.ts` — SObject insert via jsforce.
- `components/chat/action-preview-card.tsx` — confirm / reject UI.
- `POST /api/actions/preview`, `POST /api/actions/execute`.
- Full `audit_logs` coverage for each pipeline step.

**Dependencies.** M7.

**Deliverable.** End-to-end: "Create a Contact named Oscar Aleman" produces a preview, the user confirms, the record is created in Salesforce, and the audit log shows success.

---

## M9 — Polish

**Objective.** Make the Phase 1 flows feel solid.

**Tasks.**
- Empty states on every list page.
- Loading and error states on all async boundaries.
- Rate limiting on `/api/chat` (per user) and on Salesforce calls (per org, via the connection module).
- Session/preview expiry handling in the UI.
- Logout button in topbar.

**Dependencies.** M8.

**Deliverable.** Phase 1 is ready for first users. Future milestones (SSO, update/delete, background jobs) are tracked separately.
