import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Connection } from "jsforce";

export interface ActionContext {
  userId: string;
  sessionId: string | null;
  messageId: string | null;
  orgId: string | null;
  supabase: SupabaseClient;
  getConnection: (orgId: string) => Promise<Connection>;
}

export interface ActionPreview<P = unknown> {
  actionType: string;
  summary: string;
  diff?: string;
  targets: Array<{ orgId: string; entity: string; label?: string }>;
  risks: string[];
  payload: P;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: Array<{ path: string; message: string }> };

export interface ActionDefinition<I, P = I, R = unknown> {
  name: string;
  label: string;
  description: string;
  readOnly: boolean;
  input: z.ZodType<I>;
  preview?: (input: I, ctx: ActionContext) => Promise<ActionPreview<P>>;
  validate?: (input: I, ctx: ActionContext) => Promise<ValidationResult>;
  execute: (input: I, ctx: ActionContext) => Promise<R>;
}

export class ActionError extends Error {
  constructor(
    public category: "validation" | "auth" | "salesforce" | "internal",
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ActionError";
  }
}
