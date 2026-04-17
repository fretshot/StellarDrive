# StellarDrive

Multi-tenant SaaS that helps Salesforce administrators analyze and manage their orgs through an AI-assisted chat interface.

**Stack**: Next.js (App Router) · TypeScript · Tailwind · Supabase · Claude (Anthropic).

## Status

Phase 1 scaffold. See `/docs` for the architecture, database schema, Salesforce integration design, AI action architecture, and roadmap — these are the source of truth for the implementation.

## Getting started

```bash
cp .env.example ..env.local
# fill in Supabase, Anthropic, Salesforce values
npm install
npm run dev
```

## Layout

- `app/` — routes, UI, API route handlers.
- `components/` — UI components.
- `lib/` — server-side modules: `supabase/`, `salesforce/`, `ai/`, `actions/`, `crypto/`.
- `supabase/migrations/` — SQL migrations.
- `docs/` — architectural documentation (read first).

## Scripts

- `npm run dev` — dev server.
- `npm run build` — production build.
- `npm run typecheck` — TypeScript with no emit.
- `npm run lint` — ESLint.
