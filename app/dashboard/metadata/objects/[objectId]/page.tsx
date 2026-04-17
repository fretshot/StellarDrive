import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ObjectDetailPage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: object } = await supabase
    .from("salesforce_metadata_objects")
    .select("id, org_id, api_name, label, is_custom, key_prefix, createable, summary, last_synced_at")
    .eq("id", objectId)
    .maybeSingle();
  if (!object) notFound();

  const { data: fields } = await supabase
    .from("salesforce_metadata_fields")
    .select("api_name, label, data_type, is_required, is_custom, reference_to, summary")
    .eq("object_id", objectId)
    .order("api_name", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-neutral-500">
          <Link href="/dashboard/metadata" className="hover:underline">
            ← Metadata
          </Link>
        </div>
        <h1 className="mt-1 font-mono text-lg font-semibold">{object.api_name}</h1>
        {object.label ? (
          <div className="text-sm text-neutral-500">{object.label}</div>
        ) : null}
      </div>

      <dl className="grid max-w-md grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Custom</dt>
        <dd>{object.is_custom ? "yes" : "no"}</dd>
        <dt className="text-neutral-500">Createable</dt>
        <dd>{object.createable ? "yes" : "no"}</dd>
        <dt className="text-neutral-500">Key prefix</dt>
        <dd className="font-mono">{object.key_prefix ?? "—"}</dd>
        <dt className="text-neutral-500">Last synced</dt>
        <dd>
          {object.last_synced_at ? new Date(object.last_synced_at).toLocaleString() : "never"}
        </dd>
      </dl>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Fields ({fields?.length ?? 0})</h2>
        {!fields || fields.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
            No field metadata persisted. This object may not have been included in the last sync —
            only custom objects and core standard objects are synced in Phase 1.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-4">API name</th>
                <th className="py-1 pr-4">Label</th>
                <th className="py-1 pr-4">Type</th>
                <th className="py-1 pr-4">Required</th>
                <th className="py-1 pr-4">References</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.api_name} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1 pr-4 font-mono text-xs">
                    {f.api_name}
                    {f.is_custom ? (
                      <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-300">
                        custom
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-4">{f.label}</td>
                  <td className="py-1 pr-4 font-mono text-xs">{f.data_type}</td>
                  <td className="py-1 pr-4">{f.is_required ? "yes" : ""}</td>
                  <td className="py-1 pr-4 font-mono text-xs">
                    {Array.isArray(f.reference_to) && f.reference_to.length > 0
                      ? f.reference_to.join(", ")
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
