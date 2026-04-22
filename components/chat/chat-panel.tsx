"use client";

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { deleteSession } from "@/app/dashboard/chat/actions";
import { useRouter } from "next/navigation";
import {
  AbstractChat,
  DefaultChatTransport,
  type ChatState,
  type ChatStatus,
} from "ai";
import type { UIMessage } from "ai";
import { SessionSidebar, type ChatSession } from "@/components/chat/session-sidebar";
import { MessageList } from "@/components/chat/message-list";
import type { StepResult } from "@/components/chat/batch-preview-group";
import { ChatInput } from "@/components/chat/chat-input";
import { EmptyState } from "@/components/ui/empty-state";

const STARTER_PROMPTS = [
  "Summarize the most important custom objects in this org.",
  "List the fields on Account that are required for create.",
  "Show me Apex classes related to integrations.",
  "Create a preview for a custom field called Renewal_Date__c on Opportunity.",
] as const;

// ── v6 AbstractChat concrete implementation ───────────────────────────────────

type Listener = () => void;

function createReactChatState<M extends UIMessage>(
  initialMessages: M[],
  notify: () => void,
): ChatState<M> {
  let messages: M[] = [...initialMessages];
  let status: ChatStatus = "ready";
  let error: Error | undefined = undefined;

  return {
    get status() { return status; },
    set status(v) { status = v; notify(); },
    get error() { return error; },
    set error(v) { error = v; notify(); },
    get messages() { return messages; },
    set messages(v) { messages = v; notify(); },
    pushMessage(msg) { messages = [...messages, msg]; notify(); },
    popMessage() { messages = messages.slice(0, -1); notify(); },
    replaceMessage(index, msg) {
      messages = messages.map((m, i) => (i === index ? msg : m));
      notify();
    },
    snapshot: (<T,>(thing: T) => thing) as ChatState<M>["snapshot"],
  };
}

class ReactChat extends AbstractChat<UIMessage> {
  private listeners = new Set<Listener>();
  private _snapshot!: { messages: UIMessage[]; status: ChatStatus; error: Error | undefined };

  constructor(
    messages: UIMessage[],
    transport: DefaultChatTransport<UIMessage>,
  ) {
    const chatRef: { instance: ReactChat | null } = { instance: null };
    const listeners = new Set<Listener>();

    const notify = () => {
      if (chatRef.instance) {
        chatRef.instance._snapshot = {
          messages: chatRef.instance.messages,
          status: chatRef.instance.status,
          error: chatRef.instance.error,
        };
      }
      for (const l of listeners) l();
    };

    const state = createReactChatState<UIMessage>(messages, notify);

    super({ transport, state });

    chatRef.instance = this;
    this.listeners = listeners;
    this._snapshot = { messages: this.messages, status: this.status, error: this.error };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this._snapshot;
  }
}

// ── hook ──────────────────────────────────────────────────────────────────────

function useReactChat(chat: ReactChat) {
  return useSyncExternalStore(
    useCallback((cb) => chat.subscribe(cb), [chat]),
    () => chat.getSnapshot(),
    () => chat.getSnapshot(),
  );
}

// ── props ─────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  sessions: ChatSession[];
  initialSessionId: string | null;
  initialMessages: UIMessage[];
  activeOrgId: string | null;
  activeOrg: ChatOrgSummary | null;
  mcpStatus?: { enabled: boolean; connected?: boolean; url?: string };
}

export interface ChatOrgSummary {
  id: string;
  name: string;
  status: string | null;
  orgType: string | null;
  instanceUrl: string | null;
  lastSyncAt: string | null;
}

// ── component ─────────────────────────────────────────────────────────────────

export function ChatPanel({
  sessions: initialSessions,
  initialSessionId,
  initialMessages,
  activeOrgId,
  activeOrg,
  mcpStatus: _mcpStatus,
}: ChatPanelProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [input, setInput] = useState("");
  // Bug 1: mobile sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Bug 3: toast notification
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef(input);
  inputRef.current = input;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Bug 4: track last submitted text for retry
  const lastSubmittedRef = useRef<string>("");

  // Bug 5: per-session draft persistence
  const draftMapRef = useRef<Map<string | null, string>>(new Map());

  const [chat, setChat] = useState<ReactChat>(() => buildChat());

  function buildChat(msgs: UIMessage[] = initialMessages): ReactChat {
    const interceptingFetch: typeof fetch = async (input, init) => {
      const response = await globalThis.fetch(input, init);
      const newId = response.headers.get("X-Session-Id");
      if (newId && !sessionIdRef.current) {
        setSessionId(newId);
        sessionIdRef.current = newId;
        setSessions((prev) => [
          {
            id: newId,
            title: inputRef.current.slice(0, 60).trim() || "New chat",
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        window.history.pushState(null, "", `/dashboard/chat?session=${newId}`);
      }
      return response;
    };

    const transport = new DefaultChatTransport<UIMessage>({
      api: "/api/chat",
      body: () => ({ sessionId: sessionIdRef.current, activeOrgId }),
      fetch: interceptingFetch,
    });

    return new ReactChat(msgs, transport);
  }

  // Sync when server navigates to a different session — preserve / restore drafts.
  useEffect(() => {
    // Bug 5: save current draft before leaving this session
    const currentDraft = inputRef.current;
    if (currentDraft) draftMapRef.current.set(sessionIdRef.current, currentDraft);

    setSessionId(initialSessionId);
    sessionIdRef.current = initialSessionId;
    setChat(buildChat(initialMessages));

    // Bug 5: restore draft for the session we're switching to
    const savedDraft = draftMapRef.current.get(initialSessionId) ?? "";
    setInput(savedDraft);
    inputRef.current = savedDraft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const { messages, status, error } = useReactChat(chat);
  const isLoading = status === "submitted" || status === "streaming";

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function handleDelete() {
    if (!sessionId) return;
    const deletedId = sessionId;
    await deleteSession(deletedId);
    setSessions((prev) => prev.filter((s) => s.id !== deletedId));
    handleNew();
    // Bug 3: confirm deletion with toast
    showToast("Conversation deleted");
  }

  function handleNew() {
    setSessionId(null);
    sessionIdRef.current = null;
    setChat(buildChat([]));
    setInput("");
    inputRef.current = "";
    router.push("/dashboard/chat", { scroll: false });
  }

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    inputRef.current = trimmed;
    lastSubmittedRef.current = trimmed; // Bug 4: track for retry
    setInput("");
    chat.sendMessage({ text: trimmed });
  }

  function handleSubmit() {
    submitText(input);
  }

  // Bug 4: retry last failed message
  function handleRetry() {
    const text = lastSubmittedRef.current;
    if (!text || isLoading) return;
    chat.sendMessage({ text });
  }

  function handleBatchResolved(outcome: "executed" | "rejected", steps?: StepResult[]) {
    if (outcome !== "executed") return;
    const allOk = steps?.every((s) => s.status === "executed") ?? false;
    const failCount = steps?.filter((s) => s.status === "failed").length ?? 0;
    const text = allOk
      ? "Confirmed — all actions executed successfully. Please briefly summarize what was done."
      : `Batch completed with ${failCount} failure(s): ${steps?.filter((s) => s.status !== "executed").map((s) => s.error ?? "unknown error").join("; ")}. Please explain the outcome.`;
    chat.sendMessage({ text });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden overscroll-none rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* Bug 1: mobile backdrop — tap to close sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNew={handleNew}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          sessionId={sessionId}
          onReset={handleNew}
          onDelete={handleDelete}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        {sessionId === null && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <ChatWelcomeState
              hasActiveOrg={Boolean(activeOrgId)}
              onPromptSelect={submitText}
            />
          </div>
        ) : (
          <MessageList
            key={initialSessionId ?? "new"}
            messages={messages}
            isLoading={isLoading}
            error={error ?? undefined}
            onBatchResolved={handleBatchResolved}
            onRetry={error ? handleRetry : undefined}
          />
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          activeOrgName={activeOrg?.name ?? null}
        />
      </div>

      {/* Bug 3: toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ChatHeader({
  sessionId,
  onReset,
  onDelete,
  onToggleSidebar,
}: {
  sessionId: string | null;
  onReset: () => void;
  onDelete: () => void;
  onToggleSidebar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // Bug 2: ESC closes menu
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90 md:px-6">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
        {/* Bug 1: hamburger — mobile only */}
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 md:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="2" y="3.5" width="12" height="1.25" rx="0.625" />
            <rect x="2" y="7.375" width="12" height="1.25" rx="0.625" />
            <rect x="2" y="11.25" width="12" height="1.25" rx="0.625" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
            StellarDrive Assistant
          </h1>
          <p className="truncate text-xs text-neutral-500">
            Read metadata, inspect org structure, and prepare action previews.
          </p>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="More options"
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.25" />
              <circle cx="8" cy="8" r="1.25" />
              <circle cx="13" cy="8" r="1.25" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
              <button
                onClick={() => { setOpen(false); onReset(); }}
                className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Reset chat
              </button>
              <button
                onClick={() => { setOpen(false); onDelete(); }}
                disabled={!sessionId}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Delete conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatWelcomeState({
  hasActiveOrg,
  onPromptSelect,
}: {
  hasActiveOrg: boolean;
  onPromptSelect: (prompt: string) => void;
}) {
  if (!hasActiveOrg) {
    return (
      <div className="w-full max-w-3xl">
        <EmptyState
          title="Connect a Salesforce org first"
          description="The assistant can still explain capabilities, but most useful answers and action previews need an active org."
          action={(
            <a
              href="/dashboard/orgs"
              className="inline-flex rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Open connected orgs
            </a>
          )}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl">
      <div className="rounded-[28px] border border-neutral-200 bg-[linear-gradient(135deg,rgba(245,245,244,0.95),rgba(255,255,255,1))] p-10 shadow-sm dark:border-neutral-800 dark:bg-[linear-gradient(135deg,rgba(24,24,27,0.92),rgba(10,10,10,1))]">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Desktop Workspace
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
            Start with a concrete question.
          </h2>
          <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            Use the assistant to inspect metadata, find gaps, or prepare guarded create actions.
            Every write operation is previewed first and requires confirmation.
          </p>
        </div>

        <div className="mt-8 grid gap-3 xl:grid-cols-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPromptSelect(prompt)}
              className="group rounded-2xl border border-neutral-200 bg-white/90 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-950/80 dark:hover:border-neutral-600"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Starter
              </div>
              <div className="mt-2 text-sm font-medium leading-6 text-neutral-900 dark:text-neutral-100">
                {prompt}
              </div>
              <div className="mt-3 text-xs text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-300">
                Send prompt
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
