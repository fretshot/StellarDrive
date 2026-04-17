import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { encryptToken } from "@/lib/crypto/tokens";
import { byteaForInsert } from "@/lib/crypto/bytea";
import { exchangeAuthorizationCode, type OAuthStateCookie } from "@/lib/salesforce/oauth";
import { normalizeOrgType } from "@/lib/salesforce/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const STATE_COOKIE = "sf_oauth_state";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const sfError = url.searchParams.get("error");
  const sfErrorDescription = url.searchParams.get("error_description");
  if (sfError) {
    // Clear the state cookie on the way out so retries start clean.
    const res = NextResponse.redirect(
      new URL(
        `/dashboard/orgs?sf_error=${encodeURIComponent(sfError)}&sf_error_description=${encodeURIComponent(sfErrorDescription ?? "")}`,
        request.url,
      ),
    );
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  const cookie = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "missing state cookie" }, { status: 400 });
  let parsed: OAuthStateCookie;
  try {
    parsed = JSON.parse(cookie) as OAuthStateCookie;
  } catch {
    return NextResponse.json({ error: "malformed state cookie" }, { status: 400 });
  }
  if (parsed.state !== state) {
    return NextResponse.json({ error: "state mismatch" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== parsed.user_id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let token;
  try {
    token = await exchangeAuthorizationCode({
      loginHost: parsed.login_host,
      code,
      codeVerifier: parsed.code_verifier,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "token exchange failed", detail: (err as Error).message },
      { status: 502 },
    );
  }

  // Fetch org identity + type from Salesforce itself.
  const orgInfo = await fetchOrgIdentity(token.instance_url, token.access_token);

  const access = encryptToken(token.access_token);
  const refresh = encryptToken(token.refresh_token ?? "");

  const admin = createSupabaseAdminClient();
  const { data: upserted, error } = await admin
    .from("connected_salesforce_orgs")
    .upsert(
      {
        user_id: user.id,
        sf_org_id: orgInfo.sf_org_id,
        org_type: orgInfo.org_type,
        sf_created_at: orgInfo.sf_created_at,
        instance_url: token.instance_url,
        login_host: parsed.login_host,
        display_name: orgInfo.display_name,
        status: "active",
        access_token_ct: byteaForInsert(access.ct),
        access_token_iv: byteaForInsert(access.iv),
        refresh_token_ct: byteaForInsert(refresh.ct),
        refresh_token_iv: byteaForInsert(refresh.iv),
        scopes: (token.scope ?? "").split(" ").filter(Boolean),
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "user_id,sf_org_id" },
    )
    .select("id")
    .single();
  if (error || !upserted) {
    return NextResponse.json({ error: "failed to persist org", detail: error?.message }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    org_id: upserted.id,
    action_type: "org.connected",
    entity_type: "SalesforceOrg",
    entity_ref: orgInfo.sf_org_id,
    outcome: "success",
    metadata: { org_type: orgInfo.org_type, display_name: orgInfo.display_name },
  });

  const redirect = NextResponse.redirect(new URL(`/dashboard/orgs/${upserted.id}`, request.url));
  redirect.cookies.delete(STATE_COOKIE);
  return redirect;
}

async function fetchOrgIdentity(instanceUrl: string, accessToken: string) {
  const version = env().SALESFORCE_API_VERSION;
  // Identity URL tells us the 18-char org id.
  const userInfoRes = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) throw new Error(`userinfo failed: ${userInfoRes.status}`);
  const userInfo = (await userInfoRes.json()) as { organization_id: string };
  const orgId = userInfo.organization_id;

  const orgRes = await fetch(
    `${instanceUrl}/services/data/v${version}/sobjects/Organization/${orgId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!orgRes.ok) throw new Error(`organization fetch failed: ${orgRes.status}`);
  const org = (await orgRes.json()) as {
    Id: string;
    Name: string;
    OrganizationType: string;
    IsSandbox: boolean;
    CreatedDate: string;
  };

  return {
    sf_org_id: org.Id,
    display_name: org.Name,
    org_type: normalizeOrgType(org.OrganizationType, org.IsSandbox),
    sf_created_at: org.CreatedDate,
  };
}
