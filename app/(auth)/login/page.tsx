import Link from "next/link";
import { login } from "./actions";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">StellarDrive</h1>
        <p className="text-sm text-neutral-500">Log in to continue.</p>
      </div>
      <form action={login} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Log in
        </button>
      </form>
      <p className="mt-6 text-sm text-neutral-500">
        No account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
