import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-neutral-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
