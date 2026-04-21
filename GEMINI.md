# StellarDrive - AI Project Context

StellarDrive is a multi-tenant SaaS platform that empowers Salesforce administrators to manage and analyze their orgs through an AI-assisted chat interface.

## 🚀 Quick Start
- **Development**: `npm run dev`
- **Type Check**: `npm run typecheck`
- **Linting**: `npm run lint`
- **Build**: `npm run build`

## 🏗️ Architecture & Stack
- **Framework**: Next.js 15 (App Router, Server Components).
- **Language**: TypeScript (Strict mode).
- **Styling**: Tailwind CSS v4.
- **Database & Auth**: Supabase (PostgreSQL with RLS, Auth).
- **AI Models**: 
  - **Claude Opus (4.7)**: Main chat and tool execution.
  - **Claude Haiku (4.5)**: Intent classification (Informational vs. Mutating).
- **Salesforce Integration**: JSForce via Node.js runtime.

## 📂 Core Directory Structure
- `app/`: Next.js App Router (UI & API Route Handlers).
- `components/`: React components (UI, Chat, Org management).
- `lib/`: Core logic modules.
  - `actions/`: The Action Framework (Registry, Executor, Validators).
  - `ai/`: AI-specific logic (Claude client, Intent classification, System prompt).
  - `salesforce/`: Salesforce API wrappers (Connection, Metadata, Records).
  - `supabase/`: Database client and middleware.
  - `crypto/`: Token encryption/decryption utilities.
- `docs/`: Architectural source of truth (Read these first for deep context).
- `supabase/migrations/`: SQL schema and RLS policies.
- `types/`: Shared domain and database types.

## 🤖 AI & Action Framework
The assistant uses a **Preview → Confirm → Execute** flow for all mutating actions.
1. **Intent Classification**: Every user message is first classified by a cheap model (Haiku) to determine if it needs mutating tools.
2. **Tool Registry**: Defined in `lib/actions/registry.ts`. Actions can be `readOnly` (immediate) or mutating (require preview).
3. **Batch Execution**: Multiple mutating actions can be batched. Dependencies between actions are handled via `$ref:step[N].fieldPath` tokens.
4. **Safety Rails**: CREATE-only in Phase 1. No Update/Delete tools are exposed to the AI.

## 🔒 Security & Multi-tenancy
- **RLS (Row Level Security)**: Enforced in Postgres for all tables based on `auth.uid()`.
- **Secrets**: Salesforce tokens and API keys never leave the server.
- **IDOR Prevention**: All API routes validate ownership of `sessionId` and `activeOrgId` against the current user.
- **Audit Logs**: Every meaningful action is logged in the `audit_logs` table via the service-role client.

## 🛠 Development Conventions
- **Server-Only**: Heavy use of `"server-only"` to prevent leakage of server logic to the client.
- **Zod Validation**: All AI tool inputs and API request bodies are validated with Zod.
- **JSForce Runtime**: Routes interacting with Salesforce must use `export const runtime = "nodejs"`.
- **Documentation First**: Significant architectural changes should be updated in `/docs` before implementation.
