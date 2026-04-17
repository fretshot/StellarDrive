import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env, requireEnv } from "@/lib/env";
import type { SalesforceTokenResponse } from "@/lib/salesforce/types";

const SCOPES = ["api", "refresh_token", "offline_access", "id"];

export interface OAuthStateCookie {
  state: string;
  code_verifier: string;
  login_host: string;
  user_id: string;
}

export function generatePkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState() {
  return base64url(randomBytes(16));
}

export function buildAuthorizeUrl(opts: {
  loginHost: string;
  state: string;
  codeChallenge: string;
}) {
  const { APP_URL } = env();
  const url = new URL(`https://${opts.loginHost}/services/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requireEnv("SALESFORCE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", `${APP_URL}/api/salesforce/oauth/callback`);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeAuthorizationCode(opts: {
  loginHost: string;
  code: string;
  codeVerifier: string;
}): Promise<SalesforceTokenResponse> {
  const { APP_URL } = env();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: requireEnv("SALESFORCE_CLIENT_ID"),
    client_secret: requireEnv("SALESFORCE_CLIENT_SECRET"),
    redirect_uri: `${APP_URL}/api/salesforce/oauth/callback`,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(`https://${opts.loginHost}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SalesforceTokenResponse;
}

export async function refreshAccessToken(opts: {
  loginHost: string;
  refreshToken: string;
}): Promise<Pick<SalesforceTokenResponse, "access_token" | "issued_at" | "scope">> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requireEnv("SALESFORCE_CLIENT_ID"),
    client_secret: requireEnv("SALESFORCE_CLIENT_SECRET"),
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(`https://${opts.loginHost}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SalesforceTokenResponse;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
