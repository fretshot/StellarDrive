import { EmptyState } from "@/components/ui/empty-state";

export default function OverviewPage() {
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
