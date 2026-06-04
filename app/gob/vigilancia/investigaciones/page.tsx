import Link from "next/link";

import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/poncho";
import { Alert } from "@/components/poncho/Alert";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { listOutbreakInvestigationsForGovt } from "@/lib/case-queries";
import { formatDateTime } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  escalated: "Escalada",
  closed: "Cerrada",
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-gob-warning/10 text-gob-warning-text",
  escalated: "bg-gob-danger/10 text-gob-danger",
  closed: "bg-gob-surface-alt text-gob-text-gray",
};

export default async function GobInvestigacionesPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const isAdmin = profile.role === "admin";

  const investigations = await listOutbreakInvestigationsForGovt(jurisdictions, isAdmin);

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
              Investigaciones de brote
            </h1>
            <p className="text-sm text-gob-text-gray">
              Casos abiertos, escalados y cerrados en los ultimos 90 dias.
            </p>
          </div>
          <Link
            href="/gob/vigilancia/investigaciones/nuevo"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Nueva investigacion
          </Link>
        </header>

        <Alert variant="warning" title="Notificacion externa no integrada">
          La notificacion obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64) NO
          esta integrada en esta version. Realizala a traves de los canales habituales de tu
          jurisdiccion.
        </Alert>

        <Panel>
          <PanelHeader
            title={
              <span>
                {investigations.length} investigacion
                {investigations.length !== 1 ? "es" : ""}
              </span>
            }
          />
          <PanelBody>
            {investigations.length === 0 ? (
              <EmptyState
                icon="shield-check"
                title="Sin investigaciones en este periodo"
                description="No hay investigaciones de brote en tu cobertura en los ultimos 90 dias."
              />
            ) : (
              <ul className="divide-y divide-gob-border">
                {investigations.map((inv) => (
                  <li key={inv.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gob-text-muted">
                          {inv.publicCode}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[inv.status] ?? ""}`}
                        >
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </div>
                      <p className="text-sm text-gob-text truncate">
                        {inv.openedReason
                          ? inv.openedReason.substring(0, 80) +
                            (inv.openedReason.length > 80 ? "..." : "")
                          : "Sin motivo registrado"}
                      </p>
                      <p className="text-xs text-gob-text-muted">
                        {[inv.jurisdictionLocality, inv.jurisdictionProvince]
                          .filter(Boolean)
                          .join(", ") || "Jurisdiccion nacional"}{" "}
                        &middot; Abierta {formatDateTime(inv.openedAt)}
                      </p>
                    </div>
                    <Link
                      href={`/gob/vigilancia/investigaciones/${inv.publicCode}`}
                      className="shrink-0 px-3 py-1.5 rounded border border-gob-border text-sm hover:bg-gob-surface-alt transition-colors"
                    >
                      Ver &rarr;
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </main>
  );
}
