import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional until their milestones land (M7 chat / M5 Salesforce).
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  SALESFORCE_CLIENT_ID: z.string().optional().transform((v) => v || undefined),
  SALESFORCE_CLIENT_SECRET: z.string().optional().transform((v) => v || undefined),
  SALESFORCE_API_VERSION: z.string().default("62.0"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded",
    }),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Fetch an env var that is optional in the schema but required by the
 * caller's feature. Throws with a clear message if unset.
 */
export function requireEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = env()[name];
  if (value === undefined || value === null || value === "") {
    throw new Error(`${String(name)} is required but not set. Add it to .env.local.`);
  }
  return value as NonNullable<Env[K]>;
}
