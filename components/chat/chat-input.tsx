"use client";
import { useRef, useEffect } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
    const maxHeight = lineHeight * 5;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  }

  return (
    <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
      {value.length > 2000 && (
        <p className="mb-1 text-xs text-amber-600 dark:text-amber-400">
          Message is long ({value.length} chars) — consider splitting it up.
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Ask about your Salesforce org…"
          rows={1}
          className="flex-1 resize-none rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          onClick={() => { if (!isLoading && value.trim()) onSubmit(); }}
          disabled={isLoading || !value.trim()}
          className="flex h-9 w-9 items-center justify-center rounded border border-neutral-300 text-sm hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900"
          aria-label="Send"
        >
          {isLoading ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
          ) : (
            "↑"
          )}
        </button>
      </div>
    </div>
  );
}
