import type { ActionPreview } from "@/lib/actions/types";

interface ActionPreviewCardProps {
  preview: ActionPreview;
  batchIndex: number;
}

export function ActionPreviewCard({ preview, batchIndex }: ActionPreviewCardProps) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-sm shadow-sm dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
          Step {batchIndex + 1}
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-amber-700/80 dark:text-amber-300/80">
          Preview only
        </div>
      </div>
      <div className="mt-2 font-medium text-amber-950 dark:text-amber-100">{preview.summary}</div>
      {preview.targets.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {preview.targets.map((target, index) => (
            <span
              key={`${target.orgId}:${target.entity}:${index}`}
              className="rounded-full border border-amber-300 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:border-amber-700 dark:bg-neutral-900/60 dark:text-amber-200"
            >
              {target.label || target.entity}
            </span>
          ))}
        </div>
      ) : null}
      {preview.diff ? (
        <pre className="mt-3 overflow-x-auto rounded-xl bg-white/80 p-3 text-xs dark:bg-neutral-900/60">
          {preview.diff}
        </pre>
      ) : null}
      {preview.risks.length > 0 ? (
        <ul className="mt-3 list-disc pl-5 text-xs leading-5 text-amber-900 dark:text-amber-200">
          {preview.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
