import "server-only";
import { tool } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ACTIONS } from "@/lib/actions/registry";
import type { ActionContext } from "@/lib/actions/types";

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
 */
export function buildAiSdkTools(readOnly: boolean, ctx: ActionContext) {
  return Object.fromEntries(
    ACTIONS
      .filter((a) => !readOnly || a.readOnly)
      .map((action) => [
        action.name,
        tool({
          description: action.description,
          inputSchema: action.input,
          execute: async (input: unknown) => {
            try {
              return await action.execute(input, ctx);
            } catch (err) {
              return { error: err instanceof Error ? err.message : String(err) };
            }
          },
        }),
      ]),
  );
}
