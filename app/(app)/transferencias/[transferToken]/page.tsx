// Pet transfer detail / accept-reject page (handoff P3-2).
// Presentation redesign only — data fetching and AcceptTransferActions unchanged.

import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout } from "@/components/ui/DocElements";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { getTransferForViewerAction as getTransferForViewer } from "@/src/modules/transfers/actions";
import { AcceptTransferActions } from "./AcceptTransferActions";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

const REASON_LABELS: Record<string, string> = {
  sale: "Venta",
  gift: "Regalo",
  inheritance: "Herencia",
  other: "Otro",
};

function formatExpiresAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TransferPage({
  params,
}: {
  params: Promise<{ transferToken: string }>;
}) {
  await requireUserOrRedirect();
  const { transferToken } = await params;
  const result = await getTransferForViewer(transferToken);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
        <Link
          href="/transferencias"
          className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Transferencias
        </Link>
        <LnCallout tone="warn" title="No se pudo cargar la transferencia">
          {result.error}
        </LnCallout>
      </div>
    );
  }

  const { transfer } = result;
  const statusLabel = STATUS_LABELS[transfer.status] ?? transfer.status;
  const reasonLabel = transfer.reason ? (REASON_LABELS[transfer.reason] ?? transfer.reason) : null;

  const statusBadgeClass =
    transfer.status === "accepted"
      ? "border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]"
      : transfer.status === "pending"
        ? "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]"
        : "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]";

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/transferencias"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Transferencias
      </Link>

      {/* Header */}
      <div className="mb-[24px] flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[24px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
            {transfer.isRecipient
              ? `Recibiste a ${transfer.petName}`
              : `Transferencia de ${transfer.petName}`}
          </h1>
          {transfer.fromDisplayName && transfer.isRecipient && (
            <p className="mt-[4px] text-[13px] text-[var(--color-ln-mute)]">
              {transfer.fromDisplayName} te quiere transferir esta mascota.
            </p>
          )}
        </div>
        <span
          className={`flex-shrink-0 inline-flex items-center rounded-[2px] border px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] ${statusBadgeClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Details */}
      <LnCard className="mb-[20px]">
        <LnCardHead title="Detalle de la transferencia" />
        <LnCardBody>
          <dl className="flex flex-col gap-[12px]">
            {reasonLabel && <DetailRow label="Motivo">{reasonLabel}</DetailRow>}
            {transfer.note && <DetailRow label="Comentario">{transfer.note}</DetailRow>}
            <DetailRow label="Vence">{formatExpiresAt(transfer.expiresAt)}</DetailRow>
            <DetailRow label="Email del receptor">
              <span className="font-[var(--font-ln-mono)] text-[12.5px]">{transfer.toEmail}</span>
            </DetailRow>
          </dl>
        </LnCardBody>
      </LnCard>

      {/* Actions */}
      {transfer.status === "pending" && (
        <AcceptTransferActions
          transferToken={transfer.publicToken}
          isRecipient={transfer.isRecipient}
          isSender={transfer.isSender}
          petToken={transfer.petToken}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
        {label}
      </dt>
      <dd className="mt-[2px] text-[13px] text-[var(--color-ln-ink-2)]">{children}</dd>
    </div>
  );
}
