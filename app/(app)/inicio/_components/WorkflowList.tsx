import Link from "next/link";

import type { WorkflowItem } from "@/lib/owner-dashboard";

// Shared list-of-workflow-items renderer. Used by both OpenWorkflows
// and PreviousWorkflows widgets — only the title + empty copy differ.

const SEVERITY_BADGE: Record<WorkflowItem["severity"], { label: string; cls: string }> = {
  urgent: {
    label: "Urgente",
    cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
  warning: {
    label: "Atención",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  info: {
    label: "Info",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function WorkflowList({ items, emptyCopy }: { items: WorkflowItem[]; emptyCopy: string }) {
  if (items.length === 0) {
    return (
      <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-6 text-center text-sm text-neutral-500 dark:text-neutral-500">
        {emptyCopy}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const badge = SEVERITY_BADGE[item.severity];
        return (
          <li key={item.id}>
            <Link
              href={item.ctaUrl}
              className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 truncate">
                      {item.subtitle}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 dark:text-neutral-600">
                    {formatDate(item.since)}
                  </p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
