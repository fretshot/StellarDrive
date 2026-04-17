import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RefreshMetadataButton } from "@/components/orgs/refresh-metadata-button";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: org } = await supabase
    .from("connected_salesforce_orgs")
    .select("id, alias, display_name, org_type, status, instance_url, last_sync_at, last_error")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) notFound();

  const [{ count: objectCount }, { count: fieldCount }, { count: classCount }, { data: lastJob }] =
    await Promise.all([
      supabase
        .from("salesforce_metadata_objects")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("salesforce_metadata_fields")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("salesforce_metadata_classes")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("metadata_sync_jobs")
        .select("id, kind, status, started_at, finished_at, error")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{org.alias || org.display_name || "Org"}</h1>
        <div className="mt-1 text-xs text-neutral-500">{org.instance_url}</div>
      </div>

      <dl className="grid max-w-md grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Type</dt>
        <dd>{org.org_type}</dd>
        <dt className="text-neutral-500">Status</dt>
        <dd>{org.status}</dd>
        <dt className="text-neutral-500">Last sync</dt>
        <dd>{org.last_sync_at ? new Date(org.last_sync_at).toLocaleString() : "never"}</dd>
        <dt className="text-neutral-500">Objects</dt>
        <dd>{objectCount ?? 0}</dd>
        <dt className="text-neutral-500">Fields</dt>
        <dd>{fieldCount ?? 0}</dd>
        <dt className="text-neutral-500">Apex classes</dt>
        <dd>{classCount ?? 0}</dd>
      </dl>

      {org.last_error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          <div className="font-medium">Last error</div>
          <div className="mt-1 font-mono">{org.last_error}</div>
        </div>
      ) : null}

      <RefreshMetadataButton orgId={org.id} />

      {lastJob ? (
        <div className="text-xs text-neutral-500">
          Latest job: <span className="font-mono">{lastJob.kind}</span> —{" "}
          <span className="font-mono">{lastJob.status}</span>
          {lastJob.finished_at
            ? ` · finished ${new Date(lastJob.finished_at).toLocaleString()}`
            : ""}
          {lastJob.error ? <span className="text-red-600"> · {lastJob.error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
