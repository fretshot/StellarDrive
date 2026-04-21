import "server-only";
import { tool } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ACTIONS } from "@/lib/actions/registry";
import type { ActionContext } from "@/lib/actions/types";
import { buildPreview } from "@/lib/actions/executor";

import { fetchMcpTools, callMcpTool } from "@/lib/mcp/client";
import { z } from "zod";

/**
 * Legacy format for direct Anthropic SDK usage (kept for reference).
 */
export function buildToolDefinitions() {
  return ACTIONS.map((action) => ({
    name: action.name,
    description: action.description,
    input_schema: zodToJsonSchema(action.input) as Record<string, unknown>,
  }));
}

import { writeAudit } from "@/lib/audit";

/**
 * AI SDK format: returns a tools record for use with streamText.
 */
export async function buildAiSdkTools(readOnly: boolean, ctx: ActionContext) {
  let batchIndex = 0;

  const tools: Record<string, any> = Object.fromEntries(
    ACTIONS
      .filter((a) => !readOnly || a.readOnly)
      .map((action) => [
        action.name,
        tool({
          description: action.description,
          inputSchema: action.input,
          execute: async (input: unknown) => {
            if (action.readOnly) {
              try {
                const result = await action.execute(input, ctx);
                // Optional: Audit read-only tools if needed. StellarDrive currently logs them in chat_messages.
                return result;
              } catch (err) {
                return { error: err instanceof Error ? err.message : String(err) };
              }
            }
            // Mutating: persist preview, return preview metadata to Claude
            try {
              const index = batchIndex++;
              const { previewId, preview, expiresAt } = await buildPreview(action, input as any, ctx, index);
              return { previewId, batchIndex: index, messageId: ctx.messageId, preview, expiresAt };
            } catch (err) {
              return { error: err instanceof Error ? err.message : String(err) };
            }
          },
        }),
      ]),
  );

  // Integrate MCP tools (treated as read-only for now)
  const mcpTools = await fetchMcpTools();
  for (const mcpTool of mcpTools) {
    // Avoid name collisions with native tools
    const toolName = tools[mcpTool.name] ? `mcp_${mcpTool.name}` : mcpTool.name;
    
    tools[toolName] = tool({
      description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
      // For MCP tools, we use a permissive schema as the server will validate.
      inputSchema: z.record(z.any()),
      execute: async (input: any) => {
        try {
          if (ctx.orgId && input && typeof input === "object" && !input.orgId) {
            input.orgId = ctx.orgId;
          }
          const result = await callMcpTool(mcpTool.name, input);
          
          await writeAudit({
            user_id: ctx.userId,
            org_id: ctx.orgId,
            action_type: "mcp.tool_executed",
            entity_type: "mcp_tool",
            entity_ref: mcpTool.name,
            outcome: "success",
            metadata: { toolName: mcpTool.name, input },
          });

          return result;
        } catch (err) {
          await writeAudit({
            user_id: ctx.userId,
            org_id: ctx.orgId,
            action_type: "mcp.tool_executed",
            entity_type: "mcp_tool",
            entity_ref: mcpTool.name,
            outcome: "failure",
            metadata: { toolName: mcpTool.name, input, error: err instanceof Error ? err.message : String(err) },
          });
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });
  }

  return tools;
}
