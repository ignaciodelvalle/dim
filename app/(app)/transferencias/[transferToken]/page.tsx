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
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-md mx-auto pt-10 space-y-4">
          <Link
            href="/mis-mascotas"
            className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
          >
            ← Mis mascotas
          </Link>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-10 space-y-6">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Mis mascotas
        </Link>

        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Transferencia · {statusLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {transfer.isRecipient
              ? `Recibiste a ${transfer.petName}`
              : `Transferencia de ${transfer.petName}`}
          </h1>
          {transfer.fromDisplayName && transfer.isRecipient && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {transfer.fromDisplayName} te quiere transferir esta mascota.
            </p>
          )}
        </header>

        <dl className="space-y-3 text-sm">
          {reasonLabel && (
            <div>
              <dt className="text-xs text-neutral-500 dark:text-neutral-400">Motivo</dt>
              <dd className="text-neutral-900 dark:text-neutral-50">{reasonLabel}</dd>
            </div>
          )}
          {transfer.note && (
            <div>
              <dt className="text-xs text-neutral-500 dark:text-neutral-400">Comentario</dt>
              <dd className="text-neutral-900 dark:text-neutral-50">{transfer.note}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Vence</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {formatExpiresAt(transfer.expiresAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Email del receptor</dt>
            <dd className="font-mono text-neutral-900 dark:text-neutral-50">{transfer.toEmail}</dd>
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
