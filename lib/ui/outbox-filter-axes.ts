// outbox-filter-axes — shared OpFilterBar axis definitions for the outbox SLA
// monitor twins (/gob/outbox + /admin/outbox, #26 D3 lineage: the WHERE-clause
// builder in lib/infra/outbox-query.ts already lives in ONE place so the two
// surfaces can't silently diverge; this gives their FILTER UI the same
// treatment). status/target_kind/breach are IDENTICAL between the two pages
// (same param names, same options, same labels) — only the Provincia axis
// differs (govt: assigned provinces only; admin: every province) and stays
// defined per-page.

import type { OpFilterAxis } from "@/components/ui/dashboard";
import {
  OUTBOX_STATUS_VALUES,
  OUTBOX_TARGET_KIND_LABEL,
  OUTBOX_TARGET_KIND_VALUES,
  buildStatusLabel,
} from "@/components/ui/dashboard/OutboxTable";
import type { OutboxStatus } from "@/db";

/** Builds the status/target_kind/breach axes shared by both outbox pages. */
export function buildOutboxDomainAxes(filters: {
  status?: string;
  target_kind?: string;
  breach?: string;
}): OpFilterAxis[] {
  return [
    {
      id: "status",
      label: "Estado",
      paramKey: "status",
      options: OUTBOX_STATUS_VALUES.map((s) => ({
        value: s,
        label: buildStatusLabel(s as OutboxStatus),
      })),
      current: filters.status ?? null,
      allLabel: "Todos los estados",
    },
    {
      id: "target_kind",
      label: "Destino",
      paramKey: "target_kind",
      options: OUTBOX_TARGET_KIND_VALUES.map((k) => ({
        value: k,
        label: OUTBOX_TARGET_KIND_LABEL[k],
      })),
      current: filters.target_kind ?? null,
      allLabel: "Todos los destinos",
    },
    {
      id: "breach",
      label: "SLA",
      paramKey: "breach",
      options: [
        { value: "yes", label: "Solo incumplimientos SLA" },
        { value: "no", label: "Solo dentro de SLA" },
      ],
      current: filters.breach ?? null,
      allLabel: "Todos (breach o no)",
    },
  ];
}
