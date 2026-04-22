"use client";
import { useRef, useEffect, useState } from "react";

const PLACEHOLDERS = [
  "What should we do today?",
  "What are we doing today?",
  "What's the plan for today?",
  "What can we get into today?",
  "What do you want to do today?",
  "Any ideas for today?",
  "How should we spend today?",
  "What's on the agenda today?",
  "What are our options for today?",
  "What's something fun we can do today?",
  "What do we feel like doing today?",
  "What's the move for today?",
  "Got any plans for today?",
  "What could we try today?",
  "What are we up for today?",
  "What's worth doing today?",
  "What's the game plan for today?",
  "What do we have going on today?",
  "What should we get started with today?",
  "What's something we can do together today?",
];

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  activeOrgName: string | null;
}

export function ChatInput({ value, onChange, onSubmit, isLoading, activeOrgName }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);

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
    <div className="shrink-0 bg-white/95 px-6 py-6 backdrop-blur dark:bg-neutral-950/95">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-end gap-3 rounded-2xl border border-neutral-300 bg-neutral-50 p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={activeOrgName ? `Ask about ${activeOrgName}…` : placeholder}
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
        <p className="mt-2 text-center text-[11px] text-neutral-400 dark:text-neutral-600">
          StellarDrive can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
