import type { WorkflowItem } from "@/lib/analytics/owner-dashboard";

import { WorkflowList } from "./WorkflowList";

const MAX_VISIBLE = 8;

export function OpenWorkflowsWidget({ items }: { items: WorkflowItem[] }) {
  const visible = items.slice(0, MAX_VISIBLE);
  const hasMore = items.length > visible.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">
          Procesos abiertos
          {items.length > 0 && (
            <span className="ml-2 text-xs font-normal text-[var(--color-ln-mute)]">
              ({items.length})
            </span>
          )}
        </h2>
        {hasMore && (
          <span className="text-xs text-[var(--color-ln-mute)]">
            Mostrando los {MAX_VISIBLE} más recientes
          </span>
        )}
      </div>
      <WorkflowList
        items={visible}
        emptyCopy="No tenés procesos abiertos. Cualquier postulación, propuesta de tránsito o denuncia que arranques va a aparecer acá."
      />
    </section>
  );
}
