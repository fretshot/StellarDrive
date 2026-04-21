"use client";
import { useRouter } from "next/navigation";

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface SessionSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNew: () => void;
}

function groupByDate(sessions: ChatSession[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Older", items: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.created_at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups[0].items.push(s);
    else if (day >= yesterday) groups[1].items.push(s);
    else groups[2].items.push(s);
  }

  return groups.filter((g) => g.items.length > 0);
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onNew,
}: SessionSidebarProps) {
  const router = useRouter();

  function handleSelect(id: string) {
    router.push(`/dashboard/chat?session=${id}`);
  }

  const groups = groupByDate(sessions);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="border-b border-neutral-200 px-4 py-5 dark:border-neutral-800">
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Workspace
          </div>
          <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Conversations
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {sessions.length} recent {sessions.length === 1 ? "session" : "sessions"}
          </div>
        </div>
        <button
          onClick={onNew}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-900"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-hidden px-2 py-3">
        {groups.length === 0 ? (
          <p className="px-3 py-2 text-xs text-neutral-500">No conversations yet</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {group.label}
              </p>
              {group.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    s.id === activeSessionId
                      ? "bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-800"
                      : "hover:bg-white/70 hover:shadow-sm dark:hover:bg-neutral-950/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="block truncate font-medium text-neutral-900 dark:text-neutral-100">
                      {s.title.length > 40 ? s.title.slice(0, 40) + "…" : s.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-400">
                      {formatSessionTime(s.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {s.id === activeSessionId ? "Open now" : "Open conversation"}
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
