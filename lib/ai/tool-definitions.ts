import "server-only";
import { tool } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ACTIONS } from "@/lib/actions/registry";
import type { ActionContext } from "@/lib/actions/types";
import { buildPreview } from "@/lib/actions/executor";

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

/**
 * AI SDK format: returns a tools record for use with streamText.
 * readOnly=true filters to read-only tools only.
 * ctx is bound into each tool's execute closure.
 *
 * Mutating tools: execute closure calls buildPreview() and returns
 * { previewId, batchIndex, messageId, preview } — NOT a Salesforce result.
 * The user must confirm via POST /api/actions/execute-batch before anything executes.
 */
export function buildAiSdkTools(readOnly: boolean, ctx: ActionContext) {
  let batchIndex = 0;

  return Object.fromEntries(
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
                return await action.execute(input, ctx);
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
}
