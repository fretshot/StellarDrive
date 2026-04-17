import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/active-org";

type Tab = "objects" | "classes" | "triggers" | "flows" | "process-builders" | "workflows";

const TABS: { value: Tab; label: string }[] = [
  { value: "objects", label: "Objects" },
  { value: "classes", label: "Apex Classes" },
  { value: "triggers", label: "Triggers" },
  { value: "flows", label: "Flows" },
  { value: "process-builders", label: "Process Builders" },
  { value: "workflows", label: "Workflows" },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.value));

export default async function MetadataPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = VALID_TABS.has(sp.tab ?? "") ? (sp.tab as Tab) : "objects";
  const q = sp.q?.trim() || "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const activeOrgId = await getActiveOrgId(user.id);

  if (!activeOrgId) {
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

  const tabHref = (which: Tab) => {
    const params = new URLSearchParams();
    params.set("tab", which);
    if (q) params.set("q", q);
    return `/dashboard/metadata?${params.toString()}`;
  };

  // ── Data fetch ──────────────────────────────────────────────────────────

  let rows: React.ReactNode = null;

  if (tab === "objects") {
    let query = supabase
      .from("salesforce_metadata_objects")
      .select("id, api_name, label, is_custom")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.or(`api_name.ilike.%${q}%,label.ilike.%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No objects yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/dashboard/metadata/objects/${o.id}`}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <div className="font-mono">{o.api_name}</div>
                  {o.label ? <div className="text-xs text-neutral-500">{o.label}</div> : null}
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
      );
  } else if (tab === "classes") {
    let query = supabase
      .from("salesforce_metadata_classes")
      .select("id, api_name, api_version, status")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No Apex classes yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="font-mono">{c.api_name}</div>
              <div className="text-xs text-neutral-500">
                {c.status ?? ""}
                {c.api_version ? ` · v${c.api_version}` : ""}
              </div>
            </li>
          ))}
        </ul>
      );
  } else if (tab === "triggers") {
    let query = supabase
      .from("salesforce_metadata_triggers")
      .select("id, api_name, object_name, status")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No triggers yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-mono">{t.api_name}</div>
                {t.object_name ? <div className="text-xs text-neutral-500">{t.object_name}</div> : null}
              </div>
              {t.status ? (
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    t.status === "Active"
                      ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {t.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
  } else if (tab === "flows" || tab === "process-builders") {
    const processType = tab === "flows" ? "Flow" : "Workflow";
    let query = supabase
      .from("salesforce_metadata_flows")
      .select("id, api_name, label, status")
      .eq("org_id", activeOrgId)
      .eq("process_type", processType)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.or(`api_name.ilike.%${q}%,label.ilike.%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    const emptyLabel = tab === "flows" ? "No flows yet" : "No process builders yet";
    rows =
      items.length === 0 ? (
        <EmptyState title={emptyLabel} description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-mono">{f.api_name}</div>
                {f.label ? <div className="text-xs text-neutral-500">{f.label}</div> : null}
              </div>
              {f.status ? (
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    f.status === "Active"
                      ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {f.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
  } else {
    // workflows
    let query = supabase
      .from("salesforce_metadata_workflows")
      .select("id, api_name, object_name, active")
      .eq("org_id", activeOrgId)
      .order("api_name", { ascending: true })
      .limit(500);
    if (q) query = query.ilike("api_name", `%${q}%`);
    const { data } = await query;
    const items = data ?? [];
    rows =
      items.length === 0 ? (
        <EmptyState title="No workflows yet" description='Click "Refresh metadata" on the org page to sync.' />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-mono">{w.api_name}</div>
                {w.object_name ? <div className="text-xs text-neutral-500">{w.object_name}</div> : null}
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  w.active
                    ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                {w.active ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Metadata</h1>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={tabHref(t.value)}
              className={`rounded px-2 py-1 ${
                tab === t.value
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <form className="ml-auto">
          <input type="hidden" name="tab" value={tab} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="w-64 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </form>
      </div>

      {rows}
    </div>
  );
}
