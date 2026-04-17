import "server-only";
import { getAnthropic, INTENT_MODEL } from "@/lib/ai/claude";

export type Intent = "informational" | "mutating" | "ambiguous";

const CLASSIFIER_SYSTEM = `Classify the user's latest message for a Salesforce admin assistant.
Return exactly one of these strings on a line by itself: informational | mutating | ambiguous.
- "informational": the user is asking questions or wants data; nothing will change in Salesforce.
- "mutating": the user is asking to create a record, custom field, custom object, or permission set, or assign one.
- "ambiguous": unclear which category.`;

export async function classifyIntent(userMessage: string): Promise<Intent> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: INTENT_MODEL,
    max_tokens: 10,
    system: CLASSIFIER_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .toLowerCase();
  if (text.startsWith("mutating")) return "mutating";
  if (text.startsWith("informational")) return "informational";
  return "ambiguous";
}
