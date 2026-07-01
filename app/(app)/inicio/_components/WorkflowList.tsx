import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import type { WorkflowItem } from "@/lib/analytics/owner-dashboard";

// Shared list-of-workflow-items renderer. Used by both OpenWorkflows
// and PreviousWorkflows widgets — only the title + empty copy differ.

const SEVERITY_BADGE: Record<WorkflowItem["severity"], { label: string; cls: string }> = {
  urgent: {
    label: "Urgente",
    cls: "bg-[var(--color-ln-err-050)] text-[var(--color-ln-seal)]",
  },
  warning: {
    label: "Atención",
    cls: "bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]",
  },
  info: {
    label: "Info",
    cls: "bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]",
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
    return <LnEmptyState variant="dashed" title={emptyCopy} />;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const badge = SEVERITY_BADGE[item.severity];
        return (
          <li key={item.id}>
            <Link
              href={item.ctaUrl}
              className="block border border-[var(--color-ln-line)] rounded-xl p-4 hover:bg-[var(--color-ln-stripe)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-[var(--color-ln-ink)] truncate">
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="text-xs text-[var(--color-ln-mute)] truncate">{item.subtitle}</p>
                  )}
                  <p className="text-xs text-[var(--color-ln-mute)]">{formatDate(item.since)}</p>
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
