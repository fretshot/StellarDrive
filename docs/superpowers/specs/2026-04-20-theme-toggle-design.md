# Theme Toggle — Design Spec

**Date:** 2026-04-20

## Problem

App theme follows OS `prefers-color-scheme` via a CSS media query. Users have no in-app way to override it, causing confusion when the same deployment looks different on different machines.

## Goal

Add a light/dark mode toggle in the topbar, next to the org switcher. User preference persists across sessions. Default (no saved preference) follows OS setting.

## Approach

Client-side class toggling with localStorage persistence. No new dependencies.

## Changes

### 1. `tailwind.config.ts`
Add `darkMode: "class"`. Existing `dark:` utility classes already applied throughout components are unaffected.

### 2. `app/globals.css`
- Remove the `@media (prefers-color-scheme: dark)` block — Tailwind `dark:` utilities replace it.
- Keep `color-scheme: light dark` on `:root` (browser chrome awareness).
- Keep `body` base styles (`bg-neutral-50 text-neutral-900`).

### 3. `app/layout.tsx`
Add an inline `<script>` as the first child of `<body>`, running synchronously before paint to prevent FOUC:

```js
(function () {
  try {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (_) {}
})();
```

Wrapped in IIFE + try/catch to guard against localStorage being unavailable (e.g. private browsing with strict settings).

### 4. `components/layout/theme-toggle.tsx` (new file)

`"use client"` component. SSR-safe: initializes theme state inside `useEffect` (not during render) to avoid hydration mismatch.

```
State: isDark (boolean) — initialized from document.documentElement.classList on mount.

On toggle:
  1. Flip isDark.
  2. Add/remove 'dark' class on document.documentElement.
  3. Write 'dark' | 'light' to localStorage.

UI: icon button, sun icon when dark (click → light), moon icon when light (click → dark).
   Uses existing button/border styles matching the "Log out" button in the topbar.
```

### 5. `components/layout/topbar.tsx`
Add `<ThemeToggle />` between `<OrgSwitcher />` and the right-side user block. `Topbar` is a server component; `ThemeToggle` is a client leaf — no structural changes needed.

## What does NOT change

- All existing `dark:` Tailwind classes throughout the codebase remain unchanged.
- No new npm dependencies.
- No server actions, cookies, or database involvement.

## Failure modes

- **localStorage unavailable**: IIFE try/catch suppresses the error; app falls back to OS preference (media query still works for initial render before JS runs — but only until Tailwind class mode takes effect). Acceptable edge case.
- **SSR hydration**: `ThemeToggle` initializes state in `useEffect`, rendering `null` or a neutral placeholder on the server, so no hydration mismatch.
