# Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark mode toggle button in the topbar next to the org switcher, persisting user preference to localStorage and defaulting to OS setting.

**Architecture:** Tailwind v4 class-based dark mode via `@custom-variant dark` in CSS. An inline script in `<body>` runs before paint to apply the `dark` class from localStorage (or OS preference), preventing FOUC. A client component `ThemeToggle` reads/writes the class and localStorage on click.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, localStorage

---

## File Map

| Action | File |
|--------|------|
| Modify | `app/globals.css` |
| Modify | `app/layout.tsx` |
| Create | `components/layout/theme-toggle.tsx` |
| Modify | `components/layout/topbar.tsx` |

---

### Task 1: Configure Tailwind v4 class-based dark mode

**Files:**
- Modify: `app/globals.css`

In Tailwind v4, class-based dark mode is declared in CSS via `@custom-variant`, not in `tailwind.config.ts`. The existing `@media (prefers-color-scheme: dark)` block must be removed — `dark:` utilities take over that role.

- [ ] **Step 1: Update `app/globals.css`**

Replace the entire file with:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  color-scheme: light dark;
}

html, body {
  height: 100%;
}

body {
  @apply bg-neutral-50 text-neutral-900 antialiased;
}

.dark body {
  @apply bg-neutral-950 text-neutral-100;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat(theme): switch to Tailwind v4 class-based dark mode"
```

---

### Task 2: Add FOUC-prevention inline script

**Files:**
- Modify: `app/layout.tsx`

Without this script, users who prefer dark mode or have a saved preference see a white flash before JS hydrates. The script runs synchronously before any paint.

- [ ] **Step 1: Update `app/layout.tsx`**

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StellarDrive",
  description: "AI-assisted Salesforce org analysis and management.",
};

const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s===null&&d)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(theme): add FOUC-prevention inline script"
```

---

### Task 3: Create ThemeToggle client component

**Files:**
- Create: `components/layout/theme-toggle.tsx`

`isDark` is initialized in `useEffect` (not during render) to avoid SSR hydration mismatch. While `isDark` is `null` (server render + before mount), the button renders nothing — prevents showing a wrong icon briefly.

- [ ] **Step 1: Create `components/layout/theme-toggle.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  if (isDark === null) return null;

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded border border-neutral-300 p-1 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/theme-toggle.tsx
git commit -m "feat(theme): add ThemeToggle client component"
```

---

### Task 4: Wire ThemeToggle into Topbar

**Files:**
- Modify: `components/layout/topbar.tsx`

`ThemeToggle` is a client leaf inside the server `Topbar`. Wrap `OrgSwitcher` and `ThemeToggle` in a flex container so they sit next to each other on the left.

- [ ] **Step 1: Update `components/layout/topbar.tsx`**

Replace the entire file with:

```tsx
import { logout } from "@/app/(auth)/logout/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";

export async function Topbar() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id, alias, display_name, instance_url")
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
      <div className="flex items-center gap-2">
        <OrgSwitcher orgs={orgList} activeOrgId={activeOrgId} />
        <ThemeToggle />
      </div>
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

- [ ] **Step 2: Commit**

```bash
git add components/layout/topbar.tsx
git commit -m "feat(theme): add ThemeToggle to Topbar"
```

---

### Task 5: Verify and final commit

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

Check:
1. Open http://localhost:3000 — theme matches OS preference (no white flash on dark OS).
2. Click the toggle — theme switches immediately.
3. Reload the page — chosen theme persists.
4. Open DevTools → Application → Local Storage → confirm `theme` key is `'dark'` or `'light'`.
5. Delete the `theme` key from localStorage, reload — falls back to OS preference.
