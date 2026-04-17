"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/orgs", label: "Orgs" },
  { href: "/dashboard/metadata", label: "Metadata" },
  { href: "/dashboard/chat", label: "Chat" },
  { href: "/dashboard/audit", label: "Audit" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold tracking-tight">StellarDrive</div>
        <div className="text-xs text-neutral-500">Salesforce, AI-assisted</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-2 py-1.5 text-sm ${
                active
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
