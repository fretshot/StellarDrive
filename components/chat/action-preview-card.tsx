"use client";

import { useState } from "react";

interface Props {
  previewId: string;
  preview: {
    summary: string;
    diff?: string;
    risks: string[];
    targets: Array<{ orgId: string; entity: string; label?: string }>;
  };
  onResolved?: (outcome: "executed" | "rejected", result?: unknown) => void;
}

export function ActionPreviewCard({ previewId, preview, onResolved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId }),
      });
      const body = (await res.json()) as { result?: unknown; error?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      onResolved?.("executed", body.result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm dark:border-amber-600 dark:bg-amber-950/40">
      <div className="font-medium">Confirm action</div>
      <div className="mt-1">{preview.summary}</div>
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
      <div className="mt-3 flex gap-2">
        <button
          onClick={confirm}
          disabled={busy}
          className="rounded bg-amber-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Running…" : "Confirm"}
        </button>
        <button
          onClick={() => onResolved?.("rejected")}
          disabled={busy}
          className="rounded border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700"
        >
          Reject
        </button>
      </div>
      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
