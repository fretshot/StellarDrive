import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatSession } from "@/components/chat/session-sidebar";
import type { UIMessage } from "ai";
import { getActiveOrgId } from "@/lib/active-org";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const activeOrgId = await getActiveOrgId(user.id);

  // Fetch sessions
  const { data: sessionRows } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const sessions: ChatSession[] = sessionRows ?? [];

  // Fetch messages for active session
  let initialMessages: UIMessage[] = [];
  const sessionId = sp.session ?? null;

  if (sessionId) {
    // Verify session belongs to this user before loading messages
    const { data: sessionRow } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionRow) {
      const { data: msgRows } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      initialMessages = (msgRows ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const contentArr = Array.isArray(m.content)
            ? m.content
            : typeof m.content === "string"
              ? [{ type: "text", text: m.content }]
              : [];
          const text = contentArr
            .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
            .map((b: { type: string; text?: string }) => b.text!)
            .join("");
          return {
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [{ type: "text" as const, text }],
          } satisfies UIMessage;
        });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ChatPanel
        sessions={sessions}
        initialSessionId={sessionId}
        initialMessages={initialMessages}
        activeOrgId={activeOrgId}
      />
    </div>
  );
}
