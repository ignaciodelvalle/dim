import type { WorkflowItem } from "@/lib/owner-dashboard";

import { WorkflowList } from "./WorkflowList";

export function PreviousWorkflowsWidget({ items }: { items: WorkflowItem[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-50">
          Procesos previos
        </h2>
        <span className="text-xs text-neutral-500">Últimos {items.length}</span>
      </div>
      <WorkflowList
        items={items}
        emptyCopy="Tu historial de procesos resueltos aparece acá una vez que se cierran."
      />
    </section>
  );
}
