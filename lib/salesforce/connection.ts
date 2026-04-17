import "server-only";
import { Connection } from "jsforce";
import { env } from "@/lib/env";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { byteaForInsert, byteaFromSelect } from "@/lib/crypto/bytea";
import { refreshAccessToken } from "@/lib/salesforce/oauth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SKEW_MS = 60_000;

/**
 * Returns a ready-to-use jsforce Connection for an org owned by `userId`.
 * Handles transparent access-token refresh and re-persists the new token.
 */
export async function getSalesforceConnection(orgId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: org, error } = await admin
    .from("connected_salesforce_orgs")
    .select(
      "id, user_id, instance_url, login_host, access_token_ct, access_token_iv, refresh_token_ct, refresh_token_iv, expires_at, status",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!org) throw new Error(`Org ${orgId} not found`);
  if (org.user_id !== userId) throw new Error(`Org ${orgId} does not belong to user ${userId}`);
  if (org.status !== "active") throw new Error(`Org ${orgId} is ${org.status}`);

  let accessToken = decryptToken(
    byteaFromSelect(org.access_token_ct),
    byteaFromSelect(org.access_token_iv),
  );
  const refreshToken = decryptToken(
    byteaFromSelect(org.refresh_token_ct),
    byteaFromSelect(org.refresh_token_iv),
  );

  const expiresAt = org.expires_at ? new Date(org.expires_at).getTime() : 0;
  if (!expiresAt || Date.now() + SKEW_MS >= expiresAt) {
    const refreshed = await refreshAccessToken({
      loginHost: org.login_host,
      refreshToken,
    });
    accessToken = refreshed.access_token;
    const newCt = encryptToken(accessToken);
    await admin
      .from("connected_salesforce_orgs")
      .update({
        access_token_ct: byteaForInsert(newCt.ct),
        access_token_iv: byteaForInsert(newCt.iv),
        issued_at: new Date().toISOString(),
        // Salesforce session length is set per-org; default to 2h.
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", org.id);
  }

  return new Connection({
    instanceUrl: org.instance_url,
    accessToken,
    version: env().SALESFORCE_API_VERSION,
  });
}
