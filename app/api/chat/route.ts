import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { UIMessage } from "ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";
import { classifyIntent } from "@/lib/ai/intent";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { buildAiSdkTools } from "@/lib/ai/tool-definitions";
import { getSalesforceConnection } from "@/lib/salesforce/connection";
import type { ActionContext } from "@/lib/actions/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as {
    messages: UIMessage[];
    sessionId: string | null;
    activeOrgId: string | null;
  };

  const { messages, activeOrgId } = body;
  let { sessionId } = body;

  // Fix 1 — IDOR: Validate sessionId ownership
  if (sessionId) {
    const { data: owned } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();
    if (!owned) return new Response("Session not found", { status: 404 });
  }

  // Fix 2 — IDOR: Validate activeOrgId ownership, and fetch details for system prompt
  let activeOrg: { id: string; name: string; instanceUrl: string | null } | null = null;
  if (activeOrgId) {
    const { data: ownedOrg } = await supabase
      .from("connected_salesforce_orgs")
      .select("id, display_name, alias, sf_org_id, instance_url")
      .eq("id", activeOrgId)
      .eq("user_id", user.id)
      .single();
    if (!ownedOrg) return new Response("Org not found", { status: 404 });
    activeOrg = {
      id: ownedOrg.id,
      name: ownedOrg.display_name ?? ownedOrg.alias ?? ownedOrg.sf_org_id,
      instanceUrl: ownedOrg.instance_url,
    };
  }

  // Rate limit: 20 user messages per 60 seconds.
  // chat_messages has no user_id column — scope explicitly via session_id to
  // avoid relying solely on RLS for correctness.
  const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: userSessions } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("user_id", user.id);
  const userSessionIds = (userSessions ?? []).map((s) => s.id);
  const { count: recentMessageCount } =
    userSessionIds.length > 0
      ? await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .in("session_id", userSessionIds)
          .eq("role", "user")
          .gte("created_at", sixtySecondsAgo)
      : { count: 0 };
  if ((recentMessageCount ?? 0) >= 20) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfter: 60 }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  // Extract last user message text from parts array (AI SDK v6 UIMessage shape)
  const lastMsg = messages.at(-1);
  const userText = lastMsg?.parts
    ? lastMsg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
    : "";

  // Create session on first message
  if (!sessionId) {
    const title = userText.slice(0, 60).trim() || "New chat";
    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        active_org_id: activeOrgId ?? null,
        title,
      })
      .select("id")
      .single();
    if (error || !session) {
      return new Response("Failed to create session", { status: 500 });
    }
    sessionId = session.id;
  }

  // Persist user message
  const { data: userMsgRow, error: msgError } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      role: "user",
      content: [{ type: "text", text: userText }],
    })
    .select("id")
    .single();
  if (msgError) return new Response("Failed to persist message", { status: 500 });

  const intent = await classifyIntent(userText);
  const isReadOnly = intent === "informational";

  const ctx: ActionContext = {
    userId: user.id,
    sessionId,
    messageId: userMsgRow?.id ?? null,
    orgId: activeOrgId ?? null,
    supabase,
    getConnection: (orgId: string) => getSalesforceConnection(orgId, user.id),
  };

  const anthropic = createAnthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

  // convertToModelMessages is async in AI SDK v6
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic("claude-opus-4-7"),
    system: buildSystemPrompt(activeOrg),
    messages: modelMessages,
    tools: buildAiSdkTools(isReadOnly, ctx),
    stopWhen: stepCountIs(10),
    onFinish: async ({ text, steps }) => {
      // In AI SDK v6, tool calls use `input` not `args`
      const toolCallsForDb = steps
        .flatMap((s) => s.toolCalls ?? [])
        .map((tc) => ({ toolName: tc.toolName, args: tc.input }));

      const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: [{ type: "text", text }],
        tool_calls: toolCallsForDb.length > 0 ? toolCallsForDb : null,
      });
      if (assistantMsgError) {
        console.error("[chat/route] failed to persist assistant message:", assistantMsgError.message);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "X-Session-Id": sessionId! },
  });
}
