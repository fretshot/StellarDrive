"use client";

import { useState } from "react";
import { ActionPreviewCard } from "@/components/chat/action-preview-card";
import type { ActionPreview } from "@/lib/actions/types";

// ── types ─────────────────────────────────────────────────────────────────────

export interface StepResult {
  previewId: string;
  status: "executed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

interface PreviewItem {
  previewId: string;
  batchIndex: number;
  preview: ActionPreview;
}

interface BatchPreviewGroupProps {
  previews: PreviewItem[];
  messageId: string;
  onResolved: (outcome: "executed" | "rejected", steps?: StepResult[]) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function StepStatusLine({ index, step }: { index: number; step: StepResult }) {
  if (step.status === "executed") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
        <span className="shrink-0">✓</span>
        <span>Step {index + 1} — executed</span>
      </div>
    );
  }

  if (step.status === "failed") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
        <span className="shrink-0">✗</span>
        <span>
          Step {index + 1} — failed{step.error ? `: ${step.error}` : ""}
        </span>
      </div>
    );
  }

  // skipped
  return (
    <div className="flex items-start gap-1.5 text-xs text-neutral-500">
      <span className="shrink-0">—</span>
      <span>Step {index + 1} — skipped</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function BatchPreviewGroup({
  previews,
  messageId,
  onResolved,
}: BatchPreviewGroupProps) {
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [stepResults, setStepResults] = useState<StepResult[] | null>(null);

  // Sort previews ascending by batchIndex for stable render order.
  const sorted = [...previews].sort((a, b) => a.batchIndex - b.batchIndex);

  async function handleConfirmAll() {
    if (loading || resolved) return;
    setLoading(true);
    try {
      const res = await fetch("/api/actions/execute-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });

      let steps: StepResult[] = [];
      if (res.ok) {
        const data = (await res.json()) as { steps?: StepResult[] };
        steps = data.steps ?? [];
      } else {
        // Surface a generic failure for each step so the UI is not silent.
        steps = sorted.map((p) => ({
          previewId: p.previewId,
          status: "failed",
          error: `HTTP ${res.status}`,
        }));
      }

      setStepResults(steps);
      setResolved(true);
      onResolved("executed", steps);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const steps: StepResult[] = sorted.map((p) => ({
        previewId: p.previewId,
        status: "failed",
        error: message,
      }));
      setStepResults(steps);
      setResolved(true);
      onResolved("executed", steps);
    } finally {
      setLoading(false);
    }
  }

  async function handleRejectAll() {
    if (loading || resolved) return;
    setLoading(true);
    try {
      for (const item of sorted) {
        await fetch("/api/actions/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewId: item.previewId }),
        });
      }
      setResolved(true);
      onResolved("rejected");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Preview cards */}
      {sorted.map((item) => (
        <ActionPreviewCard
          key={item.previewId}
          preview={item.preview}
          batchIndex={item.batchIndex}
        />
      ))}

      {/* Per-step status lines (shown after confirmation) */}
      {stepResults && stepResults.length > 0 && (
        <div className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/40">
          {stepResults.map((step, i) => (
            <StepStatusLine key={step.previewId} index={i} step={step} />
          ))}
        </div>
      )}

      {/* Action buttons — hidden once resolved */}
      {!resolved && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirmAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-600"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin text-xs">⟳</span>
                <span>Working…</span>
              </>
            ) : (
              <span>Confirm all ({sorted.length})</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleRejectAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-red-950/40 dark:hover:border-red-700 dark:hover:text-red-300"
          >
            Reject all
          </button>
        </div>
      )}
    </div>
  );
}
