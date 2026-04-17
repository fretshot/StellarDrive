import Link from "next/link";
import { signup } from "./actions";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-neutral-500">Email and password for now.</p>
      </div>
      <form action={signup} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Full name</span>
          <input
            name="full_name"
            type="text"
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
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
            minLength={8}
            className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Create account
        </button>
      </form>
      <p className="mt-6 text-sm text-neutral-500">
        Already have one?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
