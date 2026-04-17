"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { getToolName } from "ai";

// ── helpers ──────────────────────────────────────────────────────────────────

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
}

// ── main component ────────────────────────────────────────────────────────────

export function MessageList({ messages, isLoading, error }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        Ask anything about your connected org.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role === "user" && (
            <div className="flex justify-end">
              <div className="max-w-[75%] rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900">
                <UserText parts={msg.parts} />
              </div>
            </div>
          )}

          {msg.role === "assistant" && (
            <div className="flex flex-col gap-2">
              <ToolRows parts={msg.parts} />
              <AssistantTextRows parts={msg.parts} />
            </div>
          )}
        </div>
      ))}

      {isLoading && messages.at(-1)?.role === "user" && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="animate-spin inline-block">⟳</span>
          <span>Thinking…</span>
        </div>
      )}

      {error && (
        <div className="mx-[-1rem] rounded-none w-full border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Response interrupted — try again.
        </div>
      )}

      <div ref={bottomRef} />
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

/** Renders tool-invocation rows from a set of assistant message parts. */
function ToolRows({ parts }: { parts: Part[] }) {
  const toolParts = parts.filter(
    (p): p is Extract<Part, { type: `tool-${string}` }> | Extract<Part, { type: "dynamic-tool" }> =>
      p.type === "dynamic-tool" || p.type.startsWith("tool-"),
  );

  if (toolParts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {toolParts.map((part) => {
        // Both ToolUIPart and DynamicToolUIPart share toolCallId, state, and toolName
        // (ToolUIPart encodes the name in `type` as `tool-<name>`)
        const toolCallId = (part as { toolCallId: string }).toolCallId;
        const rawName = getToolName(part);
        const label = formatToolName(rawName);
        const state = (part as { state: string }).state;

        if (state === "output-available") {
          const output = (part as { output: unknown }).output;
          const count = countResults(output);
          return (
            <div
              key={toolCallId}
              className="flex items-center gap-1.5 text-xs text-neutral-500"
            >
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>
                {label}
                {count !== null ? ` (${count} results)` : ""}
              </span>
            </div>
          );
        }

        if (state === "output-error") {
          const errorText = (part as { errorText: string }).errorText;
          return (
            <div
              key={toolCallId}
              className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
            >
              <span>✗</span>
              <span>
                {label}: {errorText}
              </span>
            </div>
          );
        }

        if (state === "output-denied") {
          return (
            <div
              key={toolCallId}
              className="flex items-center gap-1.5 text-xs text-neutral-500"
            >
              <span>—</span>
              <span>{label}: cancelled</span>
            </div>
          );
        }

        // input-streaming, input-available, approval-requested, approval-responded → in-progress
        return (
          <div
            key={toolCallId}
            className="flex items-center gap-1.5 text-xs text-neutral-500"
          >
            <span className="animate-spin inline-block">⟳</span>
            <span>{label}…</span>
          </div>
        );
      })}
    </div>
  );
}

/** Renders the text parts of an assistant message with inline markdown. */
function AssistantTextRows({ parts }: { parts: Part[] }) {
  const textParts = parts.filter(
    (p): p is Extract<Part, { type: "text" }> => p.type === "text",
  );

  if (textParts.length === 0) return null;

  return (
    <div className="max-w-[85%] text-sm">
      {textParts.map((p, i) => (
        <AssistantText key={i} text={p.text} />
      ))}
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
