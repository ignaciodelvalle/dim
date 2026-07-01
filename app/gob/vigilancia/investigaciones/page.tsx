import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpBreach, OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { listOutbreakInvestigationsForGovt } from "@/lib/infra/case-queries";
import { formatDateTime } from "@/lib/utils/format";

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  escalated: "Escalada",
  closed: "Cerrada",
};

type PillTone = "open" | "escalated" | "closed";
const STATUS_PILL_TONE: Record<string, PillTone> = {
  open: "open",
  escalated: "escalated",
  closed: "closed",
};

export default async function GobInvestigacionesPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const isAdmin = profile.role === "admin";

  const investigations = await listOutbreakInvestigationsForGovt(jurisdictions, isAdmin);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
            Vigilancia · Investigaciones
          </p>
          <h1 className="text-[22px] font-semibold text-ln-op-ink">Investigaciones de brote</h1>
          <p className="text-[13px] text-ln-op-mute">
            Casos abiertos, escalados y cerrados en los últimos 90 días.
          </p>
        </div>
        <Link
          href="/gob/vigilancia/investigaciones/nuevo"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:bg-ln-op-azul-700 transition-colors no-underline"
        >
          Nueva investigación
        </Link>
      </header>

      <OpBreach
        title="Notificación externa no integrada"
        detail="La notificación obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64) NO está integrada en esta versión. Realizala a través de los canales habituales de tu jurisdicción."
        icon="⚠"
      />

      <OpCard>
        <OpCardHead
          title={
            <span>
              {investigations.length === 1
                ? "1 investigación"
                : `${investigations.length} investigaciones`}
            </span>
          }
        />
        <OpCardBody className="p-0">
          {investigations.length === 0 ? (
            <div className="px-4 py-3">
              <LnEmptyState
                icon="shield-check"
                title="Sin investigaciones en este periodo"
                description="No hay investigaciones de brote en tu cobertura en los últimos 90 días."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ln-op-line-2">
              {investigations.map((inv) => (
                <li
                  key={inv.id}
                  className="px-4 py-3 flex items-center justify-between gap-4 odd:bg-ln-op-stripe"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-ln-op-mute">
                        {inv.publicCode}
                      </span>
                      <OpPill tone={STATUS_PILL_TONE[inv.status] ?? "neutral"}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </OpPill>
                    </div>
                    <p className="text-[13px] text-ln-op-ink truncate">
                      {inv.openedReason
                        ? inv.openedReason.substring(0, 80) +
                          (inv.openedReason.length > 80 ? "..." : "")
                        : "Sin motivo registrado"}
                    </p>
                    <p className="text-sm text-ln-op-mute">
                      {[inv.jurisdictionLocality, inv.jurisdictionProvince]
                        .filter(Boolean)
                        .join(", ") || "Jurisdicción nacional"}{" "}
                      &middot; Abierta {formatDateTime(inv.openedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/gob/vigilancia/investigaciones/${inv.publicCode}`}
                    className="shrink-0 px-3 py-1.5 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-azul hover:bg-ln-op-stripe transition-colors no-underline"
                  >
                    Ver &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OpCardBody>
      </OpCard>
    </div>
  );
}
