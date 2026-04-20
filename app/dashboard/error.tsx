"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        Something went wrong
      </h2>
      <p className="max-w-sm text-sm text-neutral-500">
        An unexpected error occurred in this section. Try again or navigate away.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-neutral-400">ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
