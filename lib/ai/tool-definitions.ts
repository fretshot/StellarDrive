import "server-only";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ACTIONS } from "@/lib/actions/registry";

/**
 * Transforms our ActionDefinition[] into the shape Anthropic's Messages API
 * expects for `tools`. Prompt caching is applied to the whole block.
 */
export function buildToolDefinitions() {
  return ACTIONS.map((action) => ({
    name: action.name,
    description: action.description,
    input_schema: zodToJsonSchema(action.input) as Record<string, unknown>,
  }));
}
