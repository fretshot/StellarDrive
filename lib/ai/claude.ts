import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

export const CHAT_MODEL = "claude-opus-4-7";
export const INTENT_MODEL = "claude-haiku-4-5";
