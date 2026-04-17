import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MetadataPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; q?: string; tab?: "objects" | "classes" }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "classes" ? "classes" : "objects";
  const q = sp.q?.trim() || "";

  const supabase = await createSupabaseServerClient();

  const { data: orgs } = await supabase
    .from("connected_salesforce_orgs")
    .select("id, alias, display_name")
    .order("created_at", { ascending: true });

  if (!orgs || orgs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Metadata</h1>
        <EmptyState
          title="No orgs connected"
          description="Connect a Salesforce org first, then sync its metadata."
        />
      </div>
    );
  }

  const activeOrgId = sp.org && orgs.some((o) => o.id === sp.org) ? sp.org : orgs[0].id;

  let objects: Array<{ id: string; api_name: string; label: string | null; is_custom: boolean }> =
    [];
  let classes: Array<{
    id: string;
    api_name: string;
    api_version: string | null;
    status: string | null;
  }> = [];

  if (tab === "objects") {
    let query = supabase
      .from("salesforce_metadata_objects")
      .select("id, api_name, label, is_custom")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.or(`api_name.ilike.%${q}%,label.ilike.%${q}%`);
    const { data } = await query;
    objects = data ?? [];
  } else {
    let query = supabase
      .from("salesforce_metadata_classes")
      .select("id, api_name, api_version, status")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    classes = data ?? [];
  }

  const tabHref = (which: "objects" | "classes") => {
    const params = new URLSearchParams();
    params.set("org", activeOrgId);
    params.set("tab", which);
    if (q) params.set("q", q);
    return `/dashboard/metadata?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Metadata</h1>

      <div className="flex flex-wrap items-center gap-2">
        <form>
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="q" value={q} />
          <select
            name="org"
            defaultValue={activeOrgId}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.alias || o.display_name || o.id}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ml-2 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
          >
            Switch
          </button>
        </form>

        <nav className="ml-4 flex gap-1 text-sm">
          <Link
            href={tabHref("objects")}
            className={`rounded px-2 py-1 ${
              tab === "objects"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
            }`}
          >
            Objects
          </Link>
          <Link
            href={tabHref("classes")}
            className={`rounded px-2 py-1 ${
              tab === "classes"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
            }`}
          >
            Apex classes
          </Link>
        </nav>

        <form className="ml-auto">
          <input type="hidden" name="org" value={activeOrgId} />
          <input type="hidden" name="tab" value={tab} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={tab === "objects" ? "Search objects…" : "Search classes…"}
            className="w-64 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </form>
      </div>

      {tab === "objects" ? (
        objects.length === 0 ? (
          <EmptyState
            title="No objects yet"
            description='Click "Refresh metadata" on the org page to sync.'
          />
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {objects.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/dashboard/metadata/objects/${o.id}`}
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div>
                    <div className="font-mono">{o.api_name}</div>
                    {o.label ? (
                      <div className="text-xs text-neutral-500">{o.label}</div>
                    ) : null}
                  </div>
                  {o.is_custom ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                      custom
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : classes.length === 0 ? (
        <EmptyState
          title="No Apex classes yet"
          description='Click "Refresh metadata" on the org page to sync.'
        />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="font-mono">{c.api_name}</div>
              <div className="text-xs text-neutral-500">
                {c.status ?? ""}
                {c.api_version ? ` · v${c.api_version}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
