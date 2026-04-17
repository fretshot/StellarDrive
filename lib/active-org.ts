import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "active_org_id";

/**
 * Returns the validated active org ID for the given user.
 * Reads from the active_org_id cookie; validates it belongs to the user;
 * falls back to their first connected org. Returns null if the user has none.
 */
export async function getActiveOrgId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const supabase = await createSupabaseServerClient();
  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id")
    .order("created_at", { ascending: true });

  if (!orgs || orgs.length === 0) return null;

  if (cookieValue && orgs.some((o) => o.id === cookieValue)) {
    return cookieValue;
  }

  return orgs[0].id;
}
