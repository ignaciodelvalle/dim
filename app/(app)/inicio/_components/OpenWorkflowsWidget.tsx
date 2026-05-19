import type { WorkflowItem } from "@/lib/owner-dashboard";

import { WorkflowList } from "./WorkflowList";

const MAX_VISIBLE = 8;

export function OpenWorkflowsWidget({ items }: { items: WorkflowItem[] }) {
  const visible = items.slice(0, MAX_VISIBLE);
  const hasMore = items.length > visible.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-50">
          Procesos abiertos
          {items.length > 0 && (
            <span className="ml-2 text-xs font-normal text-neutral-500">({items.length})</span>
          )}
        </h2>
        {hasMore && (
          <span className="text-xs text-neutral-500">
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
