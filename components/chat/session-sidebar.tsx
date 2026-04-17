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
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-3 py-2 text-xs text-neutral-500">No conversations yet</p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 pt-3 text-xs font-medium text-neutral-500">
                {group.label}
              </p>
              {group.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    s.id === activeSessionId
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  }`}
                >
                  <span className="block truncate">
                    {s.title.length > 40 ? s.title.slice(0, 40) + "…" : s.title}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
