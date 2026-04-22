"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { getToolName } from "ai";
import { BatchPreviewGroup } from "@/components/chat/batch-preview-group";
import type { ActionPreview } from "@/lib/actions/types";

// ── typewriter hook ───────────────────────────────────────────────────────────

/**
 * Reveals `text` character by character over ~1.4 s when `active` is true.
 * Speed adapts so any length finishes in roughly the same time.
 * Returns the full string immediately when `active` is false.
 */
function useTypewriter(text: string, active: boolean): { displayed: string; done: boolean } {
  // Initialized at 0 when active (component remounts via key when streaming ends).
  const [revealed, setRevealed] = useState(active ? 0 : text.length);

  useEffect(() => {
    if (!active) {
      setRevealed(text.length);
      return;
    }
    if (revealed >= text.length) return;
    const charsPerTick = Math.max(1, Math.ceil(text.length / 115));
    const id = setTimeout(
      () => setRevealed((r) => Math.min(r + charsPerTick, text.length)),
      12,
    );
    return () => clearTimeout(id);
  }, [active, revealed, text.length]);

  const count = active ? revealed : text.length;
  return { displayed: text.slice(0, count), done: count >= text.length };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function countResults(output: unknown): number | null {
  if (Array.isArray(output)) return output.length;
  return null;
}

// ── props ─────────────────────────────────────────────────────────────────────

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  error?: Error;
  onBatchResolved?: (outcome: "executed" | "rejected", steps?: import("@/components/chat/batch-preview-group").StepResult[]) => void;
  onRetry?: () => void;
}

// ── main component ────────────────────────────────────────────────────────────

export function MessageList({ messages, isLoading, error, onBatchResolved, onRetry }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Bumped synchronously (before paint) each time streaming ends so AssistantTextRows
  // remounts with useState(0) and the typewriter starts from scratch.
  const [typewriterKey, setTypewriterKey] = useState(0);
  const prevLoadingRef = useRef(isLoading);
  useLayoutEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      setTypewriterKey((k) => k + 1);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  // Scroll to bottom on new messages and loading state changes.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-neutral-500">
        Ask anything about your connected org.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div ref={scrollContainerRef} className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 pt-12 pb-16">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" && (
                <div className="flex justify-end">
                  <div className="max-w-[72%] rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
                    <UserText parts={msg.parts} />
                  </div>
                </div>
              )}

              {msg.role === "assistant" && (
                <div className="min-w-0">
                  <ToolRows parts={msg.parts} onBatchResolved={onBatchResolved} />
                  <AssistantTextRows
                    key={msg.id === lastAssistantId ? typewriterKey : 0}
                    parts={msg.parts}
                    animate={msg.id === lastAssistantId && !isLoading}
                    onTick={msg.id === lastAssistantId ? scrollToBottom : undefined}
                  />
                </div>
              )}
            </div>
          ))}

          {isLoading && messages.at(-1)?.role === "user" && (
            <div className="flex items-center gap-3 px-1 text-sm text-neutral-500">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-800">
                <span className="animate-spin inline-block text-xs">⟳</span>
              </div>
              <span>Thinking through your org and available tools…</span>
            </div>
          )}

          {error && (
            <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              <span>Response interrupted — try again.</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                >
                  Retry
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── sub-renderers ─────────────────────────────────────────────────────────────

type Part = UIMessage["parts"][number];

/** Renders text content for a user message (text parts only). */
function UserText({ parts }: { parts: Part[] }) {
  const text = parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
  return <>{text}</>;
}

// Shape of a mutating preview output returned by a tool execute closure.
interface PreviewOutput {
  previewId: string;
  batchIndex: number;
  messageId: string;
  preview: ActionPreview;
  expiresAt?: number;
}

function isPreviewOutput(output: unknown): output is PreviewOutput {
  if (output === null || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  if (
    typeof o.previewId !== "string" ||
    typeof o.batchIndex !== "number" ||
    typeof o.messageId !== "string" ||
    o.preview === null ||
    typeof o.preview !== "object"
  ) return false;
  const p = o.preview as Record<string, unknown>;
  return (
    typeof p.actionType === "string" &&
    typeof p.summary === "string" &&
    Array.isArray(p.targets) &&
    Array.isArray(p.risks)
  );
}

/** Renders tool-invocation rows from a set of assistant message parts. */
function ToolRows({ parts, onBatchResolved }: { parts: Part[]; onBatchResolved?: MessageListProps["onBatchResolved"] }) {
  const toolParts = parts.filter(
    (p): p is Extract<Part, { type: `tool-${string}` }> | Extract<Part, { type: "dynamic-tool" }> =>
      p.type === "dynamic-tool" || p.type.startsWith("tool-"),
  );

  if (toolParts.length === 0) return null;

  // Separate tool parts into read-only badge rows and mutating preview outputs.
  const previewOutputs: PreviewOutput[] = [];
  const badgeRows: React.ReactNode[] = [];

  for (const part of toolParts) {
    const toolCallId = (part as { toolCallId: string }).toolCallId;
    const rawName = getToolName(part);
    const label = formatToolName(rawName);
    const state = (part as { state: string }).state;

    if (state === "output-available") {
      const output = (part as { output: unknown }).output;

      // Mutating preview — collect for BatchPreviewGroup, skip badge row.
      if (isPreviewOutput(output)) {
        previewOutputs.push(output);
        continue;
      }

      // Read-only output — render existing badge.
      const count = countResults(output);
      badgeRows.push(
        <div
          key={toolCallId}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <span className="text-green-600 dark:text-green-400">✓</span>
          <span>
            {label}
            {count !== null ? ` (${count} results)` : ""}
          </span>
        </div>,
      );
      continue;
    }

    if (state === "output-error") {
      const errorText = (part as { errorText: string }).errorText;
      badgeRows.push(
        <div
          key={toolCallId}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>✗</span>
          <span>
            {label}: {errorText}
          </span>
        </div>,
      );
      continue;
    }

    if (state === "output-denied") {
      badgeRows.push(
        <div
          key={toolCallId}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        >
          <span>—</span>
          <span>{label}: cancelled</span>
        </div>,
      );
      continue;
    }

    // input-streaming, input-available, approval-requested, approval-responded → in-progress
    badgeRows.push(
      <div
        key={toolCallId}
        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
      >
        <span className="animate-spin inline-block">⟳</span>
        <span>{label}…</span>
      </div>,
    );
  }

  const batchMessageId = previewOutputs[0]?.messageId ?? "";

  return (
    <div className="mb-3 flex flex-col gap-2">
      {badgeRows}
      {previewOutputs.length > 0 && (
        <BatchPreviewGroup
          previews={previewOutputs.map((o) => ({
            previewId: o.previewId,
            batchIndex: o.batchIndex,
            preview: o.preview,
            expiresAt: o.expiresAt,
          }))}
          messageId={batchMessageId}
          onResolved={(outcome, steps) => onBatchResolved?.(outcome, steps)}
        />
      )}
    </div>
  );
}

/** Renders the text parts of an assistant message with inline markdown. */
function AssistantTextRows({ parts, animate, onTick }: { parts: Part[]; animate?: boolean; onTick?: () => void }) {
  const textParts = parts.filter(
    (p): p is Extract<Part, { type: "text" }> => p.type === "text",
  );
  const fullText = textParts.map((p) => p.text).join("");

  const { displayed, done } = useTypewriter(fullText, animate ?? false);
  const text = animate ? displayed : fullText;

  // Fire scroll after each typewriter tick so the container follows new text.
  useLayoutEffect(() => {
    if (animate && onTick) onTick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed]);

  if (textParts.length === 0) return null;

  return (
    <div className="text-sm leading-6 text-neutral-800 dark:text-neutral-200">
      <AssistantText text={text} />
      {animate && !done && (
        <span className="animate-pulse font-mono text-neutral-400 dark:text-neutral-500">▎</span>
      )}
    </div>
  );
}

// ── markdown renderers ────────────────────────────────────────────────────────

/** Renders assistant text with support for bold, inline code, fenced code blocks, and bullet lists. */
function AssistantText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const fence = line.trimStart().match(/^(`{3,})/)?.[1] ?? "```";
      const lang = line.trimStart().slice(fence.length).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      nodes.push(
        <pre
          key={nodes.length}
          className="my-2 overflow-x-auto rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-800"
        >
          <code data-lang={lang || undefined}>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Markdown table — collect | rows, skipping blank lines between them
    if (line.trimStart().startsWith("|")) {
      const rawTableLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const l = lines[j].trim();
        if (l.startsWith("|")) {
          rawTableLines.push(lines[j]);
          j++;
        } else if (l === "" && lines[j + 1]?.trim().startsWith("|")) {
          j++; // blank line between rows — skip
        } else {
          break;
        }
      }
      const isSeparator = (r: string) => /^\|[-| :]+\|$/.test(r.trim());
      const hasSeparator = rawTableLines.some(isSeparator);
      if (hasSeparator && rawTableLines.length >= 2) {
        i = j;
        const parseRow = (row: string) =>
          row.split("|").slice(1, -1).map((cell) => cell.trim());
        const contentRows = rawTableLines.filter((r) => !isSeparator(r));
        const [headerRow, ...dataRows] = contentRows;
        const headers = parseRow(headerRow);
        nodes.push(
          <div key={nodes.length} className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-300 dark:border-neutral-600">
                  {headers.map((h, ci) => (
                    <th
                      key={ci}
                      className="px-3 py-1.5 text-left font-semibold text-neutral-700 dark:text-neutral-300"
                    >
                      <InlineMarkdown text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  >
                    {parseRow(row).map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-neutral-800 dark:text-neutral-200">
                        <InlineMarkdown text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
      // Not a table — fall through to paragraph rendering
    }

    // Bullet list item
    if (/^(\s*[-*+]|\s*\d+\.)\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^(\s*[-*+]|\s*\d+\.)\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*+\d.]+\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={nodes.length} className="my-1 list-disc pl-5 space-y-0.5">
          {listItems.map((item, j) => (
            <li key={j}>
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      nodes.push(<div key={nodes.length} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph line
    nodes.push(
      <p key={nodes.length} className="leading-relaxed">
        <InlineMarkdown text={line} />
      </p>,
    );
    i++;
  }

  return <div className="flex flex-col gap-0.5">{nodes}</div>;
}

/** Renders inline markdown: **bold** and `inline code`. */
function InlineMarkdown({ text }: { text: string }) {
  // Split on **bold** and `code` tokens
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
