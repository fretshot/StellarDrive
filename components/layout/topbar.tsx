import { logout } from "@/app/(auth)/logout/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";

export async function Topbar() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id, alias, display_name, instance_url")
    .order("created_at", { ascending: true });

  const orgList = orgs ?? [];
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrgId =
    cookieValue && orgList.some((o) => o.id === cookieValue)
      ? cookieValue
      : (orgList[0]?.id ?? null);

  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <OrgSwitcher orgs={orgList} activeOrgId={activeOrgId} />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-500">{user?.email}</span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
