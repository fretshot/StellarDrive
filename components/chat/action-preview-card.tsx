import type { ActionPreview } from "@/lib/actions/types";

interface ActionPreviewCardProps {
  preview: ActionPreview;
  batchIndex: number;
}

export function ActionPreviewCard({ preview, batchIndex }: ActionPreviewCardProps) {
  return (
    <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm dark:border-amber-600 dark:bg-amber-950/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Step {batchIndex + 1}
      </div>
      <div className="mt-1 font-medium">{preview.summary}</div>
      {preview.diff ? (
        <pre className="mt-2 overflow-x-auto rounded bg-white/70 p-2 text-xs dark:bg-neutral-900/50">
          {preview.diff}
        </pre>
      ) : null}
      {preview.risks.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-900 dark:text-amber-200">
          {preview.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
