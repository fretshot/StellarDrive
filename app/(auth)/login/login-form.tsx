"use client";

import { useState } from "react";
import { login } from "./actions";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A11.5 11.5 0 0 1 12 6c6.5 0 10 6 10 6a18.6 18.6 0 0 1-4 4.6" />
      <path d="M6.7 6.8C4 8.5 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={login} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>Email</span>
        <div className="relative">
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 pr-10 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          {email ? (
            <button
              type="button"
              onClick={() => setEmail("")}
              aria-label="Clear email"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Password</span>
        <div className="relative">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 pr-20 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          {password ? (
            <button
              type="button"
              onClick={() => {
                setPassword("");
                setShowPassword(false);
              }}
              aria-label="Clear password"
              className="absolute right-10 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <ClearIcon />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </label>
      <button
        type="submit"
        className="mt-2 rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
      >
        Log in
      </button>
    </form>
  );
}
