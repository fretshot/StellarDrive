"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshMetadataButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { objects: number; fields: number; classes: number } | null
  >(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/salesforce/metadata/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, kind: "full" }),
      });
      const body = (await res.json()) as
        | { objects: number; fields: number; classes: number }
        | { error: string; message?: string };
      if (!res.ok) {
        throw new Error(("message" in body && body.message) || ("error" in body && body.error) || `HTTP ${res.status}`);
      }
      setResult(body as { objects: number; fields: number; classes: number });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="self-start rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Syncing…" : "Refresh metadata"}
      </button>
      {result ? (
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Synced {result.objects} objects, {result.fields} fields, {result.classes} Apex classes.
        </div>
      ) : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
