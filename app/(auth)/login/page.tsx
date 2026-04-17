import Link from "next/link";
import { LoginForm } from "./login-form";

function getLoginErrorMessage(error?: string) {
  if (!error) return null;

  if (error.toLowerCase() === "email not confirmed") {
    return "Your email address is not confirmed yet. Check your inbox for the confirmation link before logging in.";
  }

  return error;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = getLoginErrorMessage(error);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">StellarDrive</h1>
        <p className="text-sm text-neutral-500">Log in to continue.</p>
      </div>
      {errorMessage ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}
      <LoginForm />
      <p className="mt-6 text-sm text-neutral-500">
        No account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
