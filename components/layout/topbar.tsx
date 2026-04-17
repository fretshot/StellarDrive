import { logout } from "@/app/(auth)/logout/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function Topbar() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-sm text-neutral-500">
        {/* TODO(milestone-5): active-org switcher goes here. */}
        <span>No org selected</span>
      </div>
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
