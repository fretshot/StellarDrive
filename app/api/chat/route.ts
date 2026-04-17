import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { UIMessage } from "ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";
import { classifyIntent } from "@/lib/ai/intent";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
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
  const { data: userMsgRow } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      role: "user",
      content: [{ type: "text", text: userText }],
    })
    .select("id")
    .single();

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
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: buildAiSdkTools(isReadOnly, ctx),
    stopWhen: stepCountIs(10),
    onFinish: async ({ text, steps }) => {
      // In AI SDK v6, tool calls use `input` not `args`
      const toolCallsForDb = steps
        .flatMap((s) => s.toolCalls ?? [])
        .map((tc) => ({ toolName: tc.toolName, args: tc.input }));

      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: [{ type: "text", text }],
        tool_calls: toolCallsForDb.length > 0 ? toolCallsForDb : null,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "X-Session-Id": sessionId! },
  });
}
