/**
 * App-wide domain types. Generated database types live in types/database.ts
 * (regenerate with `npx supabase gen types typescript --local > types/database.ts`).
 */

export type OrgStatus = "active" | "expired" | "revoked" | "error";
export type PreviewStatus = "pending" | "confirmed" | "rejected" | "expired" | "executed" | "failed";
export type AuditOutcome = "success" | "failure" | "warning";
