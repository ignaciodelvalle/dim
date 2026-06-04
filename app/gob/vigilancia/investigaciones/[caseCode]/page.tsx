import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/poncho/Alert";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { getNormativesForCase } from "@/lib/case-normatives";
import { getOutbreakInvestigationDetail } from "@/lib/case-queries";
import { formatDateTime } from "@/lib/format";

import { InvestigationActions } from "./InvestigationActions";

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

const ENTRY_LABEL: Record<string, string> = {
  case_opened: "Apertura",
  case_escalated: "Escalada",
  case_closed: "Cierre",
  dataset_classification: "Clasificacion",
  lab_result: "Resultado de laboratorio",
  control_action: "Medida de control",
  contact_tracing: "Rastreo de contactos",
  final_report: "Informe final",
  linked_signal: "Signal vinculada",
  general_note: "Nota",
};

function parseDiseaseCode(openedReason: string | null): string | null {
  if (!openedReason) return null;
  const match = openedReason.match(/^manual \[([^\]]+)\]:/);
  return match ? match[1] : null;
}

export default async function InvestigacionDetailPage({
  params,
}: {
  params: Promise<{ caseCode: string }>;
}) {
  const { caseCode } = await params;
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const detail = await getOutbreakInvestigationDetail(caseCode);
  if (!detail) notFound();

  if (profile.role === "govt") {
    const inScope =
      !detail.jurisdictionProvince ||
      jurisdictions.some((j) => j.province === detail.jurisdictionProvince);
    if (!inScope) notFound();
  }

  const diseaseCode = parseDiseaseCode(detail.openedReason);
  const isClosed = detail.status === "closed";

  const normatives = getNormativesForCase(detail.caseKind, {
    country: detail.jurisdictionCountry,
    province: detail.jurisdictionProvince ?? undefined,
    locality: detail.jurisdictionLocality ?? undefined,
  });

  const datasetNotes = detail.notes.filter((n) =>
    ["dataset_classification", "lab_result", "control_action", "contact_tracing"].includes(
      n.entryType,
    ),
  );
  const timelineNotes = detail.notes.filter(
    (n) =>
      !["dataset_classification", "lab_result", "control_action", "contact_tracing"].includes(
        n.entryType,
      ),
  );

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/gob/vigilancia/investigaciones"
          className="text-sm text-gob-text-muted hover:text-gob-text"
        >
          ← Volver al listado
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gob-text">
              {/* eslint-disable-next-line react/jsx-curly-brace-presence */}
              {"Investigacion de brote"}
              {diseaseCode ? ` — ${diseaseCode}` : ""}
            </h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[detail.status] ?? ""}`}
            >
              {STATUS_LABEL[detail.status] ?? detail.status}
            </span>
          </div>
          <p className="text-[10px] font-mono text-gob-text-muted">
            {detail.publicCode} · abierta {formatDateTime(detail.openedAt)}
          </p>
        </header>

        {/* PERSISTENT honesty banner */}
        <Alert variant="warning" title="Notificacion externa no integrada">
          La notificacion obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64){" "}
          <strong>no esta integrada</strong> en esta version. La notificacion legal obligatoria debe
          realizarse a traves de los canales habituales de la jurisdiccion.
        </Alert>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {diseaseCode && (
            <div className="rounded-lg border border-gob-border px-3 py-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Enfermedad</p>
              <p className="text-sm font-semibold text-gob-text">{diseaseCode}</p>
            </div>
          )}
          <div className="rounded-lg border border-gob-border px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Estado</p>
            <p className="text-sm font-semibold text-gob-text">
              {STATUS_LABEL[detail.status] ?? detail.status}
            </p>
          </div>
          <div className="rounded-lg border border-gob-border px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Jurisdiccion</p>
            <p className="text-sm font-semibold text-gob-text">
              {[detail.jurisdictionLocality, detail.jurisdictionProvince]
                .filter(Boolean)
                .join(", ") || "Nacional"}
            </p>
          </div>
        </div>

        <section className="rounded-lg border border-gob-border p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
            Motivo de apertura
          </h2>
          <p className="text-sm text-gob-text whitespace-pre-wrap">
            {detail.openedReason ?? "Sin motivo registrado"}
          </p>
        </section>

        {datasetNotes.length > 0 && (
          <section className="rounded-lg border border-gob-border p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
              Datos epidemiologicos ({datasetNotes.length})
            </h2>
            <ul className="space-y-2">
              {datasetNotes.map((n) => (
                <li key={n.id} className="rounded bg-gob-surface-alt p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gob-text">
                      {ENTRY_LABEL[n.entryType] ?? n.entryType}
                    </span>
                    <span className="text-xs text-gob-text-muted">
                      {formatDateTime(n.occurredAt)}
                    </span>
                  </div>
                  {n.notes && <p className="text-gob-text-gray whitespace-pre-wrap">{n.notes}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {timelineNotes.length > 0 && (
          <section className="rounded-lg border border-gob-border p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
              Linea de tiempo
            </h2>
            <ul className="space-y-2">
              {timelineNotes.map((n) => (
                <li key={n.id} className="flex gap-3 text-sm">
                  <span className="text-xs text-gob-text-muted shrink-0 mt-0.5">
                    {formatDateTime(n.occurredAt)}
                  </span>
                  <span className="text-gob-text">
                    <span className="font-medium">{ENTRY_LABEL[n.entryType] ?? n.entryType}</span>
                    {n.notes ? ` — ${n.notes}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isClosed && (
          <section className="space-y-3 pt-2 border-t border-gob-border">
            <h2 className="text-lg font-semibold text-gob-text">Acciones</h2>
            <InvestigationActions
              casePublicCode={detail.publicCode}
              currentStatus={detail.status}
            />
          </section>
        )}

        {normatives.length > 0 && (
          <section className="rounded-lg border border-gob-border p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
              Normativa aplicable
            </h2>
            <ul className="space-y-2 text-sm text-gob-text-gray">
              {normatives.map((law) => (
                <li key={law.id}>
                  <span className="font-medium">{law.label}</span> — {law.scope}
                </li>
              ))}
            </ul>
          </section>
        )}

        {isClosed && (
          <section className="rounded-lg border border-gob-border p-4 space-y-2 text-sm">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Cierre</h2>
            <p>
              Cerrada el {detail.closedAt ? formatDateTime(detail.closedAt) : ""}{" "}
              {detail.closedReason ? `— ${detail.closedReason}` : ""}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
