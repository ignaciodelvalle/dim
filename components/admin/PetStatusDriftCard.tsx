// Admin card — pets.status cache drift visibility (projection-cron audit
// 2026-07-03 B3). Surfaces what the reconcile-pet-status cron already detects
// (cronRuns.details.divergent + sample) and the cron-health meta-cron's
// semantic verdict, which were previously invisible outside function logs.
//
// Detect-only surface: no repair action is offered here — repairing the cache
// is human-gated (scripts/rebuild-projections.ts --apply) because a divergence
// may indicate a missing upcaster rather than a stale cache.

import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import type { PetStatusDrift } from "@/lib/analytics/admin-metrics";

function formatDate(d: Date): string {
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PetStatusDriftCard({ data }: { data: PetStatusDrift }) {
  const { reconcile, metaCheck } = data;
  const hasDrift = (reconcile?.divergent ?? 0) > 0;

  return (
    <OpCard>
      <OpCardHead
        title="Deriva de caché · pets.status"
        actions={
          reconcile ? (
            <OpPill tone={hasDrift ? "danger" : "ok"}>
              {hasDrift ? `${reconcile.divergent} divergentes` : "Sin deriva"}
            </OpPill>
          ) : undefined
        }
      />
      <OpCardBody>
        {reconcile === null ? (
          <p className="text-[var(--text-md)] text-ln-op-mute">
            El cron reconcile_pet_status todavía no registró corridas.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Row label="Último escaneo" value={formatDate(reconcile.lastRunAt)} />
              <Row
                label="Mascotas escaneadas"
                value={
                  reconcile.earlyStop
                    ? `${reconcile.scanned} (escaneo parcial)`
                    : String(reconcile.scanned)
                }
              />
              <Row label="Divergentes" value={String(reconcile.divergent)} />
            </div>

            {hasDrift && reconcile.sample.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">
                  Muestra
                </p>
                <ul className="space-y-0.5">
                  {reconcile.sample.slice(0, 5).map((s) => (
                    <li
                      key={s.publicToken}
                      className="flex items-baseline justify-between gap-3 text-[var(--text-sm)]"
                    >
                      <span className="font-mono text-ln-op-ink">{s.publicToken}</span>
                      <span className="text-ln-op-mute">
                        cache {s.cached ?? "—"} {"→"} log {s.derived ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-3 border-t border-ln-op-line pt-2">
              <span className="text-sm text-ln-op-mute">Chequeo semántico (cron-health)</span>
              {metaCheck === null ? (
                <span className="text-[var(--text-sm)] text-ln-op-mute">Sin datos</span>
              ) : (
                <span className="flex items-center gap-1.5 text-[var(--text-sm)] tabular-nums">
                  {formatDate(metaCheck.checkedAt)}
                  <OpPill tone={metaCheck.healthy ? "ok" : "danger"}>
                    {metaCheck.healthy
                      ? "OK"
                      : metaCheck.reason === "drift"
                        ? "Deriva detectada"
                        : metaCheck.reason}
                  </OpPill>
                </span>
              )}
            </div>

            <p className="text-[var(--text-sm)] text-ln-op-mute">
              Solo detección: la reparación de la caché es manual y auditada (no hay auto-repair).
            </p>
          </div>
        )}
      </OpCardBody>
    </OpCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-ln-op-mute">{label}</span>
      <span className="text-[var(--text-md)] font-medium tabular-nums text-ln-op-ink">{value}</span>
    </div>
  );
}
