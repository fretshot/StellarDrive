import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/active-org";
import { EmptyState } from "@/components/ui/empty-state";

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const activeOrgId = await getActiveOrgId(user.id);

  if (!activeOrgId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Overview</h1>
        <EmptyState
          title="Nothing here yet"
          description="Connect a Salesforce org and sync its metadata to see a summary on this page."
        />
      </div>
    );
  }

  // Fetch org info + all counts in parallel.
  const [
    orgResult,
    standardObjResult,
    customObjResult,
    customMetaResult,
    customSettingsResult,
    workflowsResult,
    processBuilderResult,
    flowsResult,
    triggersResult,
    classesResult,
  ] = await Promise.all([
    supabase
      .from("connected_salesforce_orgs")
      .select("display_name, alias, sf_created_at")
      .eq("id", activeOrgId)
      .single(),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("is_custom", false),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("is_custom", true)
      .not("api_name", "ilike", "%__mdt")
      .filter("summary->>custom_setting", "eq", "false"),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .ilike("api_name", "%__mdt"),
    supabase
      .from("salesforce_metadata_objects")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .filter("summary->>custom_setting", "eq", "true"),
    supabase
      .from("salesforce_metadata_workflows")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId),
    supabase
      .from("salesforce_metadata_flows")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("process_type", "Workflow"),
    supabase
      .from("salesforce_metadata_flows")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId)
      .eq("process_type", "Flow"),
    supabase
      .from("salesforce_metadata_triggers")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId),
    supabase
      .from("salesforce_metadata_classes")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrgId),
  ]);

  const org = orgResult.data;
  const orgName = org?.alias || org?.display_name || "Connected Org";
  const sfCreatedAt = org?.sf_created_at
    ? new Date(org.sf_created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const stats = [
    { label: "Org Creation Date", value: sfCreatedAt },
    { label: "Standard Objects", value: standardObjResult.count ?? 0 },
    { label: "Custom Objects", value: customObjResult.count ?? 0 },
    { label: "Custom Metadata", value: customMetaResult.count ?? 0 },
    { label: "Custom Settings", value: customSettingsResult.count ?? 0 },
    { label: "Workflows", value: workflowsResult.count ?? 0 },
    { label: "Process Builders", value: processBuilderResult.count ?? 0 },
    { label: "Flows", value: flowsResult.count ?? 0 },
    { label: "Triggers", value: triggersResult.count ?? 0 },
    { label: "Apex Classes", value: classesResult.count ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{orgName}</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <dt className="text-xs text-neutral-500">{s.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
