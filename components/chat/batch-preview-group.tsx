"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
  expiresAt?: number;
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
  const [confirmSteps, setConfirmSteps] = useState<StepResult[] | null>(null);
  const [, setExpiredTick] = useState(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const sorted = useMemo(
    () => [...previews].sort((a, b) => a.batchIndex - b.batchIndex),
    [previews],
  );

  // Schedule a re-render at the earliest preview expiry so the expired state
  // appears automatically without requiring user interaction.
  useEffect(() => {
    if (resolved) return;
    const deadlines = sorted
      .map((p) => p.expiresAt)
      .filter((t): t is number => t !== undefined);
    if (deadlines.length === 0) return;
    const nearest = Math.min(...deadlines);
    const ms = nearest - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => setExpiredTick((n) => n + 1), ms);
    return () => clearTimeout(id);
  }, [resolved, sorted]);

  const expired =
    !resolved &&
    sorted.some((p) => p.expiresAt !== undefined && Date.now() > p.expiresAt);

  async function handleConfirmAll() {
    if (loading || resolved) return;
    setLoading(true);
    const controller = new AbortController();
    try {
      const res = await fetch("/api/actions/execute-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
        signal: controller.signal,
      });

      let steps: StepResult[];
      if (res.ok) {
        const data = (await res.json()) as { steps?: StepResult[] };
        steps = data.steps ?? [];
      } else {
        steps = sorted.map((p) => ({
          previewId: p.previewId,
          status: "failed" as const,
          error: `HTTP ${res.status}`,
        }));
      }

      if (!mountedRef.current) return;
      setConfirmSteps(steps);
      setResolved(true);
      onResolved("executed", steps);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      const steps: StepResult[] = sorted.map((p) => ({
        previewId: p.previewId,
        status: "failed" as const,
        error: message,
      }));
      setConfirmSteps(steps);
      setResolved(true);
      onResolved("rejected");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleRejectAll() {
    if (loading || resolved) return;
    setLoading(true);
    try {
      for (const item of sorted) {
        const res = await fetch("/api/actions/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewId: item.previewId }),
        });
        if (!res.ok) {
          throw new Error(`Failed to reject preview ${item.previewId}: HTTP ${res.status}`);
        }
      }
      if (!mountedRef.current) return;
      setResolved(true);
      onResolved("rejected");
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      const steps: StepResult[] = sorted.map((p) => ({
        previewId: p.previewId,
        status: "failed" as const,
        error: message,
      }));
      setConfirmSteps(steps);
      setResolved(true);
      onResolved("rejected");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((item) => (
        <ActionPreviewCard
          key={item.previewId}
          preview={item.preview}
          batchIndex={item.batchIndex}
        />
      ))}

      {/* Per-step status lines — shown only after confirm */}
      {resolved && confirmSteps && confirmSteps.length > 0 && (
        <div className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/40">
          {confirmSteps.map((step, i) => (
            <StepStatusLine key={step.previewId} index={i} step={step} />
          ))}
        </div>
      )}

      {!resolved && expired && (
        <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
          These previews have expired — ask again to create new ones.
        </div>
      )}

      {!resolved && !expired && (
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
