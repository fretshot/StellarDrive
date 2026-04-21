# Repository Guidelines

## Project Structure & Module Organization
`app/` contains Next.js App Router routes, server actions, and API handlers. `components/` holds UI pieces grouped by feature (`chat/`, `layout/`, `orgs/`, `ui/`). `lib/` contains shared server logic, especially `ai/`, `actions/`, `salesforce/`, `supabase/`, and `crypto/`. Database SQL lives in `supabase/migrations/`, generated database types in `types/database.ts`, and broader product and architecture decisions in `docs/`.

Treat `docs/` as the source of truth for non-trivial changes. If code and docs diverge, update the docs first.

## Build, Test, and Development Commands
Use `npm install` to install dependencies. Main workflows:

- `npm run dev` — start the local app at `http://localhost:3000`.
- `npm run build` — create the production build.
- `npm run start` — serve the production build locally.
- `npm run lint` — run Next.js ESLint checks.
- `npm run typecheck` — run strict TypeScript checks with no emit.
- `npx supabase gen types typescript --local > types/database.ts` — regenerate DB types after schema changes.

## Coding Style & Naming Conventions
This codebase uses TypeScript with `strict` mode, React 19, and Next.js App Router. Follow the existing style:

- Use 2-space indentation and double quotes.
- Prefer `@/` imports over deep relative paths.
- Name React components in PascalCase (`ThemeToggle.tsx`), helpers in camelCase, and route files with Next.js defaults (`page.tsx`, `layout.tsx`, `route.ts`).
- Keep secrets and privileged code in server-only modules; use `lib/env.ts` for validated environment access.

## Testing Guidelines
There is no automated test runner configured yet. Until one is added, run `npm run lint` and `npm run typecheck` before opening a PR, then manually verify affected flows in `npm run dev`.

If you introduce tests, prefer `*.test.ts` or `*.test.tsx` placed next to the code they cover or in a nearby `__tests__/` folder.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commits with scopes, for example `feat(theme): add ThemeToggle to Topbar` and `fix(theme): robust initial state`. Keep that format: `<type>(<scope>): <summary>`.

PRs should include a short description, linked issue or plan doc when relevant, screenshots for UI changes, and notes for any env, migration, or docs updates. For schema or architecture changes, update `docs/` in the same PR.
