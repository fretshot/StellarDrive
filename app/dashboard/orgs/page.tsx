import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ sf_error?: string; sf_error_description?: string }>;
}) {
  const { sf_error, sf_error_description } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id, alias, display_name, org_type, status, instance_url, last_sync_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Connected orgs</h1>
        <a
          href="/api/salesforce/oauth/authorize?loginHost=login.salesforce.com"
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Connect org
        </a>
      </div>
      {sf_error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          <div className="font-medium">Salesforce rejected the connection: {sf_error}</div>
          {sf_error_description ? (
            <div className="mt-1 text-xs">{sf_error_description}</div>
          ) : null}
        </div>
      ) : null}
      {!orgs || orgs.length === 0 ? (
        <EmptyState
          title="No orgs connected"
          description="Connect a Salesforce org to start analyzing its metadata."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                href={`/dashboard/orgs/${o.id}`}
                className="block rounded border border-neutral-200 bg-white p-4 text-sm hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{o.alias || o.display_name || "Unnamed"}</div>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                    {o.org_type}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">{o.instance_url}</div>
                <div className="mt-2 text-xs">
                  Status: <span className="font-medium">{o.status}</span>
                  {o.last_sync_at ? (
                    <span className="ml-3 text-neutral-500">
                      Last sync: {new Date(o.last_sync_at).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
