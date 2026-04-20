"use client";
import { useRef, useEffect } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  activeOrgName: string | null;
}

export function ChatInput({ value, onChange, onSubmit, isLoading, activeOrgName }: ChatInputProps) {
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
    <div className="shrink-0 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-end gap-3 rounded-2xl border border-neutral-300 bg-neutral-50 p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={activeOrgName ? `Ask about ${activeOrgName}…` : "Ask anything…"}
            rows={1}
            className="min-h-11 flex-1 resize-none bg-transparent px-1 py-2 text-sm focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => { if (!isLoading && value.trim()) onSubmit(); }}
            disabled={isLoading || !value.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-sm text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700"
            aria-label="Send"
          >
            {isLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              "↑"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
