// Pet transfer detail / accept-reject page (handoff P3-2).
//
// Receiver lands here from the email magic-link or from their in-app
// notification. Senders see read-only state + a cancel button while pending.

import Link from "next/link";

import { getTransferForViewer } from "@/app/actions/pet-transfer";
import { requireUserOrRedirect } from "@/lib/auth-guards";
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
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-md mx-auto pt-10 space-y-4">
          <Link
            href="/mis-mascotas"
            className="inline-block text-sm text-gob-text-gray  underline underline-offset-4"
          >
            ← Mis mascotas
          </Link>
          <div className="rounded-lg border border-gob-danger bg-gob-danger/10 p-4 text-sm text-gob-danger   ">
            {result.error}
          </div>
        </div>
      </main>
    );
  }

  const { transfer } = result;
  const statusLabel = STATUS_LABELS[transfer.status] ?? transfer.status;
  const reasonLabel = transfer.reason ? (REASON_LABELS[transfer.reason] ?? transfer.reason) : null;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-10 space-y-6">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4"
        >
          ← Mis mascotas
        </Link>

        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-gob-text-muted ">
            Transferencia · {statusLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
            {transfer.isRecipient
              ? `Recibiste a ${transfer.petName}`
              : `Transferencia de ${transfer.petName}`}
          </h1>
          {transfer.fromDisplayName && transfer.isRecipient && (
            <p className="text-sm text-gob-text-gray ">
              {transfer.fromDisplayName} te quiere transferir esta mascota.
            </p>
          )}
        </header>

        <dl className="space-y-3 text-sm">
          {reasonLabel && (
            <div>
              <dt className="text-xs text-gob-text-muted ">Motivo</dt>
              <dd className="text-gob-text ">{reasonLabel}</dd>
            </div>
          )}
          {transfer.note && (
            <div>
              <dt className="text-xs text-gob-text-muted ">Comentario</dt>
              <dd className="text-gob-text ">{transfer.note}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-gob-text-muted ">Vence</dt>
            <dd className="text-gob-text ">{formatExpiresAt(transfer.expiresAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gob-text-muted ">Email del receptor</dt>
            <dd className="font-mono text-gob-text ">{transfer.toEmail}</dd>
          </div>
        </dl>

        {transfer.status === "pending" && (
          <AcceptTransferActions
            transferToken={transfer.publicToken}
            isRecipient={transfer.isRecipient}
            isSender={transfer.isSender}
            petToken={transfer.petToken}
          />
        )}
      </div>
    </main>
  );
}
