"use client";

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from "react";
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
import { ChatInput } from "@/components/chat/chat-input";
import { EmptyState } from "@/components/ui/empty-state";

// ── v6 AbstractChat concrete implementation ───────────────────────────────────
//
// AI SDK v6 removed the useChat React hook from the `ai` package.
// The `@ai-sdk/react` package (which provides useChat) is not installed.
// Instead we subclass AbstractChat ourselves and drive React renders via
// useSyncExternalStore. AbstractChat.state must be provided by the caller.

type Listener = () => void;

/** Minimal reactive ChatState implementation for React */
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
  /** Subscription listeners (useSyncExternalStore). */
  private listeners = new Set<Listener>();
  /** Cached snapshot — same reference until notify() fires. */
  private _snapshot!: { messages: UIMessage[]; status: ChatStatus; error: Error | undefined };

  constructor(
    messages: UIMessage[],
    transport: DefaultChatTransport<UIMessage>,
  ) {
    // Use a ref-box so the notify closure can update _snapshot after super()
    // sets `this` (notify is defined before super(), so `this` isn't yet available).
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

    // Wire up after super() so chatRef.instance is valid when notify fires.
    chatRef.instance = this;
    this.listeners = listeners;
    // Initialize snapshot with the post-construction values.
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
}

// ── component ─────────────────────────────────────────────────────────────────

export function ChatPanel({
  sessions: initialSessions,
  initialSessionId,
  initialMessages,
  activeOrgId,
}: ChatPanelProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [input, setInput] = useState("");

  // Keep a ref to the current input so the onFinish closure can read it without
  // capturing a stale value.
  const inputRef = useRef(input);
  inputRef.current = input;

  // sessionId ref so the fetch interceptor closure always reads the latest value.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Build the chat instance. We recreate it when initialSessionId changes so
  // the message history is reset for a different session.
  const [chat, setChat] = useState<ReactChat>(() => buildChat());

  function buildChat(msgs: UIMessage[] = initialMessages): ReactChat {
    // Custom fetch intercepts the response to capture X-Session-Id before
    // the stream is consumed by the transport.
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
        router.push(`/dashboard/chat?session=${newId}`, { scroll: false });
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

  // Sync when the server navigates to a different session.
  useEffect(() => {
    setSessionId(initialSessionId);
    sessionIdRef.current = initialSessionId;
    setChat(buildChat(initialMessages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const { messages, status, error } = useReactChat(chat);
  const isLoading = status === "submitted" || status === "streaming";

  function handleNew() {
    setSessionId(null);
    sessionIdRef.current = null;
    setChat(buildChat([]));
    router.push("/dashboard/chat", { scroll: false });
  }

  function handleSubmit() {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    chat.sendMessage({ text });
  }

  return (
    <div className="flex h-full">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNew={handleNew}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {sessionId === null && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              title="Start a conversation"
              description="Ask anything about your connected Salesforce org — objects, fields, Apex classes, and more."
            />
          </div>
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            error={error ?? undefined}
          />
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
