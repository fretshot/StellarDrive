"use client";

import { useState } from "react";

/**
 * Chat UI skeleton. Renders a static conversation and an input; wiring to
 * /api/chat lands in milestone-7.
 */
export function ChatPanel() {
  const [messages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [input, setInput] = useState("");

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex-1 overflow-auto p-4">
        {messages.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Ask a question about your orgs, or propose a create-action.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="mr-2 font-medium">{m.role}:</span>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800"
        onSubmit={(e) => {
          e.preventDefault();
          // TODO(milestone-7): POST /api/chat and stream the response.
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message StellarDrive…"
          className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
        >
          Send
        </button>
      </form>
    </div>
  );
}
