import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChatPanel, type ChatOrgSummary } from "@/components/chat/chat-panel";
import type { ChatSession } from "@/components/chat/session-sidebar";
import type { UIMessage } from "ai";
import { getActiveOrgId } from "@/lib/active-org";
import { getMcpStatus } from "@/lib/mcp/client";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

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
  let activeOrg: ChatOrgSummary | null = null;

  if (activeOrgId) {
    const { data: orgRow } = await supabase
      .from("connected_salesforce_orgs")
      .select("id, alias, display_name, status, org_type, instance_url, last_sync_at")
      .eq("id", activeOrgId)
      .maybeSingle();

    if (orgRow) {
      activeOrg = {
        id: orgRow.id,
        name: orgRow.alias || orgRow.display_name || "Connected Org",
        status: orgRow.status,
        orgType: orgRow.org_type,
        instanceUrl: orgRow.instance_url,
        lastSyncAt: orgRow.last_sync_at,
      };
    }
  }

  // Fetch sessions
  const { data: sessionRows } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const sessions: ChatSession[] = sessionRows ?? [];
  const mcpStatus = await getMcpStatus();

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
      const [{ data: msgRows }, { data: previewRows }] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("id, role, content")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
        supabase
          .from("action_previews")
          .select("id, message_id, action_type, preview, batch_index, created_at")
          .eq("session_id", sessionId)
          .eq("status", "pending")
          .order("batch_index", { ascending: true }),
      ]);

      // Group pending previews by message_id for O(1) lookup below
      const previewsByMsgId = new Map<string, typeof previewRows>();
      for (const p of previewRows ?? []) {
        if (!p.message_id) continue;
        if (!previewsByMsgId.has(p.message_id)) previewsByMsgId.set(p.message_id, []);
        previewsByMsgId.get(p.message_id)!.push(p);
      }

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

          // Inject pending preview parts so BatchPreviewGroup renders on reload
          const pendingPreviews = previewsByMsgId.get(m.id) ?? [];
          const toolParts = pendingPreviews.map((p) => ({
            type: "tool-invocation" as const,
            toolCallId: `db-${p.id}`,
            toolName: p.action_type,
            state: "output-available" as const,
            output: {
              previewId: p.id,
              batchIndex: p.batch_index,
              messageId: m.id,
              preview: p.preview,
              expiresAt: new Date(p.created_at).getTime() + PREVIEW_TTL_MS,
            },
          }));

          return {
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...(toolParts as any[]),
              { type: "text" as const, text },
            ],
          } as UIMessage;
        });
    }
  }

  return (
    <section className="flex h-[calc(100dvh-6rem)] min-h-0 flex-1 flex-col overflow-hidden">
      <ChatPanel
        sessions={sessions}
        initialSessionId={sessionId}
        initialMessages={initialMessages}
        activeOrgId={activeOrgId}
        activeOrg={activeOrg}
        mcpStatus={mcpStatus}
      />
    </section>
  );
}
