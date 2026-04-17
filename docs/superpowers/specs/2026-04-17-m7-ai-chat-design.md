# M7 — AI Chat (Read-Only) Design Spec

**Date:** 2026-04-17
**Milestone:** M7
**Scope:** Streaming AI chat with read-only Salesforce tools, session management, tool progress UI.

---

## Overview

A chat tab where Salesforce admins can ask questions about their connected orgs. The assistant answers using persisted metadata via read-only tools. Mutating tools are stubbed (M8). Streaming via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`); Anthropic remains the model provider.

---

## Layout & Navigation

`/dashboard/chat` is a two-panel layout:

- **Left sidebar (~240px):** "New Chat" button at top; scrollable session list grouped by date (Today, Yesterday, Older). Each row: auto-generated title + relative timestamp. Active session highlighted. Sessions fetched server-side and passed as props.
- **Right panel:** Active chat thread + fixed input at bottom. Empty state shown when no session is selected.

Session title: set server-side on first message — first 60 characters of user text, trimmed. No editing in M7.

"New Chat" does **not** create a DB row on click. The session is created on the first message send to avoid empty sessions.

---

## API: `POST /api/chat`

```
export const runtime = "nodejs"
```

### Request

```ts
{
  sessionId: string | null;  // null = create new session
  message: string;
  activeOrgId: string;
}
```

### Server flow

1. Authenticate user via Supabase server client. Return 401 if unauthenticated.
2. If `sessionId` is null → insert `chat_sessions` row: `user_id`, `active_org_id`, `title` = first 60 chars of `message`.
3. Classify intent via `classifyIntent(message)` (existing Haiku classifier, `lib/ai/intent.ts`).
4. Persist user message to `chat_messages`: `role: "user"`, `content: [{ type: "text", text: message }]`.
5. Load last 20 `chat_messages` for the session (ordered `created_at asc`) and reconstruct into Anthropic message format.
6. Call `streamText` from `ai` with `@ai-sdk/anthropic` provider:
   - Model: `claude-opus-4-7`
   - System prompt from `lib/ai/system-prompt.ts` with `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }`
   - Tools from updated `buildToolDefinitions()` (AI SDK format, see below)
   - Tool definitions block also carries cache control
   - Max tool call rounds: 10
7. Return `streamText` result as streaming response.
8. On `onFinish`: persist assistant message to `chat_messages` (`role: "assistant"`, full content blocks, tool calls mirrored to `tool_calls` jsonb). Persist each tool result as a `role: "tool"` row.

### Intent routing

- `informational`: `streamText` with read-only tools only (filter registry by `readOnly: true`).
- `mutating` / `ambiguous`: full tool registry (mutating tools throw "not implemented" in M7 — surfaced gracefully to user).

---

## Tool Definitions: AI SDK Format

`lib/ai/tool-definitions.ts` updated to emit AI SDK-compatible objects:

```ts
import { tool } from "ai";
import { ACTIONS } from "@/lib/actions/registry";
import type { ActionContext } from "@/lib/actions/types";

export function buildAiSdkTools(readOnly: boolean, ctx: ActionContext) {
  return Object.fromEntries(
    ACTIONS
      .filter((a) => !readOnly || a.readOnly)
      .map((action) => [
        action.name,
        tool({
          description: action.description,
          parameters: action.input,
          execute: async (input) => action.execute(input, ctx),
        }),
      ])
  );
}
```

`ActionContext` is constructed in the route handler and passed into `buildAiSdkTools`. Context carries: `userId`, `sessionId`, `orgId` (from `activeOrgId`), Supabase server client, `getConnection` closure.

---

## Components

All under `components/chat/`. All client components (`"use client"`).

### `chat-panel.tsx`

Top-level client component. Uses `useChat` from `ai/react`:
- `api: "/api/chat"`
- `body: { sessionId, activeOrgId }` passed as extra body fields
- Renders `SessionSidebar` + message thread + `ChatInput`
- Tracks `sessionId` in state (null until first send)
- Server includes `sessionId` in the stream's first data chunk; client updates state on receipt so subsequent messages use the correct session

### `message-list.tsx`

Renders message thread. Message types:

| Role | Rendering |
|------|-----------|
| `user` | Right-aligned bubble, plain text |
| `assistant` | Left-aligned, basic markdown (bold, inline code, code blocks, unordered lists) |
| tool in-progress | Inline row: `⟳ <tool label>…` |
| tool complete | Inline row: `✓ <tool label> (<n> results)` |
| tool error | Inline red row: `✗ <tool label>: <error message>` |
| stream error | Full-width red banner: "Response interrupted — try again" |

Auto-scrolls to bottom on new messages.

### `chat-input.tsx`

- `<textarea>` that grows up to 5 lines
- `Enter` submits, `Shift+Enter` newlines
- Disabled + spinner while `isLoading`
- Warning shown if input > 2000 chars (not blocked)
- Submit button right-aligned below textarea

### `session-sidebar.tsx`

Props: `sessions: Session[]`, `activeSessionId: string | null`, `onSelect: (id: string) => void`, `onNew: () => void`.

- "New Chat" button at top
- Sessions grouped: Today / Yesterday / Older
- Active session highlighted with neutral background
- Truncates title at ~40 chars in the sidebar

---

## Page: `app/dashboard/chat/page.tsx`

Server component:
1. Get authenticated user
2. Fetch `chat_sessions` for user (ordered `created_at desc`, limit 50)
3. If `sessionId` search param present: fetch its `chat_messages`
4. Pass sessions + initial messages as props to `<ChatPanel>`

URL shape: `/dashboard/chat?session=<uuid>` — selecting a session updates the URL via `router.push`.

---

## Dependencies

Add to `package.json`:
- `ai` (Vercel AI SDK core)
- `@ai-sdk/anthropic` (Anthropic provider for AI SDK)

The existing `@anthropic-ai/sdk` stays for the intent classifier (`classifyIntent` in `lib/ai/intent.ts`).

---

## File Map

| File | Action |
|------|--------|
| `package.json` | Add `ai`, `@ai-sdk/anthropic` |
| `app/api/chat/route.ts` | Create — streaming chat handler |
| `lib/ai/tool-definitions.ts` | Modify — AI SDK tool format, `buildAiSdkTools(readOnly, ctx)` |
| `components/chat/chat-panel.tsx` | Create — top-level client component |
| `components/chat/message-list.tsx` | Create — message thread renderer |
| `components/chat/chat-input.tsx` | Create — textarea + submit |
| `components/chat/session-sidebar.tsx` | Create — session list |
| `app/dashboard/chat/page.tsx` | Modify — replace empty state, fetch sessions/messages |

---

## Out of Scope (M7)

- Mutating action previews + confirm flow (M8)
- Rate limiting (M9)
- Session title editing
- Message search
- Session deletion
- `search_metadata` read-only tool (can be added as a registry entry in a later task)
