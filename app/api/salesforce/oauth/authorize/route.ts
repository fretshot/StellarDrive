import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
  type OAuthStateCookie,
} from "@/lib/salesforce/oauth";

export const runtime = "nodejs";

const STATE_COOKIE = "sf_oauth_state";
const ALLOWED_DEFAULT_HOSTS = new Set(["login.salesforce.com", "test.salesforce.com"]);

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const loginHost = request.nextUrl.searchParams.get("loginHost") || "login.salesforce.com";
  // Accept the two standard hosts and any My Domain under *.my.salesforce.com.
  if (!ALLOWED_DEFAULT_HOSTS.has(loginHost) && !/^[a-z0-9-]+\.my\.salesforce\.com$/i.test(loginHost)) {
    return NextResponse.json({ error: "invalid loginHost" }, { status: 400 });
  }

  const pkce = generatePkce();
  const state = generateState();
  const stateCookie: OAuthStateCookie = {
    state,
    code_verifier: pkce.verifier,
    login_host: loginHost,
    user_id: user.id,
  };

  const res = NextResponse.redirect(
    buildAuthorizeUrl({ loginHost, state, codeChallenge: pkce.challenge }),
  );
  res.cookies.set(STATE_COOKIE, JSON.stringify(stateCookie), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/api/salesforce/oauth",
  });
  return res;
}
