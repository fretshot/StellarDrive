import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AuditPage() {
  const supabase = await createSupabaseServerClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action_type, entity_type, entity_ref, outcome, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Audit</h1>
      {!logs || logs.length === 0 ? (
        <EmptyState
          title="No audit events"
          description="Every action you take — connecting an org, syncing metadata, creating records — will be logged here."
        />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-4">When</th>
              <th className="py-1 pr-4">Action</th>
              <th className="py-1 pr-4">Entity</th>
              <th className="py-1 pr-4">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-4">{new Date(l.created_at).toLocaleString()}</td>
                <td className="py-1 pr-4 font-mono text-xs">{l.action_type}</td>
                <td className="py-1 pr-4">
                  {l.entity_type ? `${l.entity_type} ${l.entity_ref ?? ""}` : "-"}
                </td>
                <td className="py-1 pr-4">{l.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
