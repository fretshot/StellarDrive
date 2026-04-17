import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 text-neutral-500">Email</dt>
          <dd>{user?.email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 text-neutral-500">User id</dt>
          <dd className="font-mono text-xs">{user?.id}</dd>
        </div>
      </dl>
    </div>
  );
}
