import Link from "next/link";
import { notFound } from "next/navigation";

import { OpBreach, OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
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

type PillTone = "open" | "escalated" | "closed";
const STATUS_PILL_TONE: Record<string, PillTone> = {
  open: "open",
  escalated: "escalated",
  closed: "closed",
};

const ENTRY_LABEL: Record<string, string> = {
  case_opened: "Apertura",
  case_escalated: "Escalada",
  case_closed: "Cierre",
  classification: "Clasificacion",
  lab_result: "Resultado de laboratorio",
  control_action: "Medida de control",
  contact_tracing: "Rastreo de contactos",
  final_report: "Informe final",
  signal_link: "Signal vinculada",
  system: "Nota",
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
    ["classification", "lab_result", "control_action", "contact_tracing"].includes(n.entryType),
  );
  const timelineNotes = detail.notes.filter(
    (n) =>
      !["classification", "lab_result", "control_action", "contact_tracing"].includes(n.entryType),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/gob/vigilancia/investigaciones"
        className="text-[13px] text-ln-op-mute hover:text-ln-op-ink no-underline"
      >
        ← Volver al listado
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[22px] font-semibold text-ln-op-ink">
            {/* eslint-disable-next-line react/jsx-curly-brace-presence */}
            {"Investigacion de brote"}
            {diseaseCode ? ` — ${diseaseCode}` : ""}
          </h1>
          <OpPill tone={STATUS_PILL_TONE[detail.status] ?? "neutral"}>
            {STATUS_LABEL[detail.status] ?? detail.status}
          </OpPill>
        </div>
        <p className="text-[11px] font-mono text-ln-op-mute">
          {detail.publicCode} · abierta {formatDateTime(detail.openedAt)}
        </p>
      </header>

      {/* PERSISTENT honesty banner */}
      <OpBreach
        title="Notificacion externa no integrada"
        detail="La notificacion obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64) no esta integrada en esta version. La notificacion legal obligatoria debe realizarse a traves de los canales habituales de la jurisdiccion."
        icon="⚠"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {diseaseCode && (
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-ln-op-mute">Enfermedad</p>
            <p className="text-[13px] font-semibold text-ln-op-ink">{diseaseCode}</p>
          </div>
        )}
        <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-ln-op-mute">Estado</p>
          <p className="text-[13px] font-semibold text-ln-op-ink">
            {STATUS_LABEL[detail.status] ?? detail.status}
          </p>
        </div>
        <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-ln-op-mute">Jurisdiccion</p>
          <p className="text-[13px] font-semibold text-ln-op-ink">
            {[detail.jurisdictionLocality, detail.jurisdictionProvince]
              .filter(Boolean)
              .join(", ") || "Nacional"}
          </p>
        </div>
      </div>

      <OpCard>
        <OpCardHead title="Motivo de apertura" />
        <OpCardBody>
          <p className="text-[13px] text-ln-op-ink whitespace-pre-wrap">
            {detail.openedReason ?? "Sin motivo registrado"}
          </p>
        </OpCardBody>
      </OpCard>

      {datasetNotes.length > 0 && (
        <OpCard>
          <OpCardHead title={`Datos epidemiologicos (${datasetNotes.length})`} />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {datasetNotes.map((n) => (
                <li key={n.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ln-op-ink">
                      {ENTRY_LABEL[n.entryType] ?? n.entryType}
                    </span>
                    <span className="text-[12px] text-ln-op-mute">
                      {formatDateTime(n.occurredAt)}
                    </span>
                  </div>
                  {n.notes && (
                    <p className="text-[13px] text-ln-op-ink-2 whitespace-pre-wrap">{n.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}

      {timelineNotes.length > 0 && (
        <OpCard>
          <OpCardHead title="Linea de tiempo" />
          <OpCardBody className="p-0">
            <ul className="divide-y divide-ln-op-line-2">
              {timelineNotes.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-3">
                  <span className="text-[12px] text-ln-op-mute shrink-0 mt-0.5 tabular-nums">
                    {formatDateTime(n.occurredAt)}
                  </span>
                  <span className="text-[13px] text-ln-op-ink">
                    <span className="font-medium">{ENTRY_LABEL[n.entryType] ?? n.entryType}</span>
                    {n.notes ? ` — ${n.notes}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}

      {!isClosed && (
        <section className="space-y-3 pt-2 border-t border-ln-op-line">
          <h2 className="text-[14px] font-semibold text-ln-op-ink">Acciones</h2>
          <InvestigationActions casePublicCode={detail.publicCode} currentStatus={detail.status} />
        </section>
      )}

      {normatives.length > 0 && (
        <OpCard>
          <OpCardHead title="Normativa aplicable" />
          <OpCardBody>
            <ul className="space-y-2 text-[13px] text-ln-op-ink-2">
              {normatives.map((law) => (
                <li key={law.id}>
                  <span className="font-medium text-ln-op-ink">{law.label}</span> — {law.scope}
                </li>
              ))}
            </ul>
          </OpCardBody>
        </OpCard>
      )}

      {isClosed && (
        <OpCard>
          <OpCardHead title="Cierre" />
          <OpCardBody>
            <p className="text-[13px] text-ln-op-ink">
              Cerrada el {detail.closedAt ? formatDateTime(detail.closedAt) : ""}{" "}
              {detail.closedReason ? `— ${detail.closedReason}` : ""}
            </p>
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}
