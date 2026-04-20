"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white p-8 dark:bg-neutral-950">
        <div className="flex max-w-sm flex-col gap-4 text-center">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Something went wrong
          </h1>
          <p className="text-sm text-neutral-500">
            An unexpected error occurred. Try again or reload the page.
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-neutral-400">
              Error ID: {error.digest}
            </p>
          )}
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
