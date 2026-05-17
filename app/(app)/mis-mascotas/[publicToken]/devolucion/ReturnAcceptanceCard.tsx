"use client";

// ReturnAcceptanceCard — owner UI for the devolucion page.
//
// Renders:
//   - Proposal details (actor name, notes, date)
//   - "Marcar como recibida" button → ownerAcceptReturnFormAction
//   - Reject section → ownerRejectReturnFormAction
//
// When accept returns autoCancelled=true, shows an explanation banner instead
// of success and tells the user to go back to /mis-mascotas.

import {
  type AcceptReturnFormState,
  type RejectReturnFormState,
  ownerAcceptReturnFormAction,
  ownerRejectReturnFormAction,
} from "@/app/actions/return-to-owner-form";
import { useActionState, useState } from "react";

const acceptInitial: AcceptReturnFormState = { error: null };
const rejectInitial: RejectReturnFormState = { error: null };

export function ReturnAcceptanceCard({
  petPublicToken,
  petName,
  actorName,
  proposalNotes,
  proposedAt,
  backUrl,
}: {
  petPublicToken: string;
  petName: string;
  actorName: string;
  proposalNotes: string | null;
  proposedAt: string;
  backUrl: string;
}) {
  const boundAccept = ownerAcceptReturnFormAction.bind(null, petPublicToken);
  const boundReject = ownerRejectReturnFormAction.bind(null, petPublicToken);

  const [acceptState, acceptFormAction, acceptPending] = useActionState(boundAccept, acceptInitial);
  const [rejectState, rejectFormAction, rejectPending] = useActionState(boundReject, rejectInitial);

  const [showRejectForm, setShowRejectForm] = useState(false);

  // Accepted successfully — show success.
  if (acceptState.error === null && !acceptState.autoCancelled && acceptState !== acceptInitial) {
    return (
      <div className="rounded border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 space-y-2">
        <p className="text-emerald-900 dark:text-emerald-200 font-medium">
          Devolución confirmada. {petName} está de vuelta con vos.
        </p>
        <a href={backUrl} className="text-sm underline text-emerald-800 dark:text-emerald-300">
          Ir a mis mascotas
        </a>
      </div>
    );
  }

  // Auto-cancelled — show explanation banner.
  if (acceptState.autoCancelled) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-2">
        <p className="text-amber-900 dark:text-amber-200 font-medium">
          La propuesta ya no es válida
        </p>
        <p className="text-amber-800 dark:text-amber-300 text-sm">{acceptState.autoCancelReason}</p>
        <a href={backUrl} className="text-sm underline text-amber-800 dark:text-amber-300">
          Volver a mis mascotas
        </a>
      </div>
    );
  }

  // Rejected successfully.
  if (rejectState.success) {
    return (
      <div className="rounded border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 p-4 space-y-2">
        <p className="text-neutral-800 dark:text-neutral-200 font-medium">
          Propuesta rechazada. {actorName} fue notificado.
        </p>
        <a href={backUrl} className="text-sm underline text-neutral-600 dark:text-neutral-400">
          Volver a mis mascotas
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Proposal card */}
      <div className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm text-neutral-500 uppercase tracking-wide">
            Propuesta de devolución
          </p>
          <p className="text-base font-semibold">
            {actorName} está listo para devolverte a {petName}
          </p>
          <p className="text-xs text-neutral-500">
            Propuesta el{" "}
            {new Date(proposedAt).toLocaleDateString("es-AR", {
              dateStyle: "long",
            })}
          </p>
        </div>

        {proposalNotes && (
          <div className="rounded bg-neutral-50 dark:bg-neutral-900 p-3 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line">
            {proposalNotes}
          </div>
        )}
      </div>

      {/* Accept action */}
      {acceptState.error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {acceptState.error}
        </p>
      )}

      <form action={acceptFormAction}>
        <button
          type="submit"
          disabled={acceptPending}
          className="w-full py-3 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 font-medium transition-colors"
        >
          {acceptPending ? "Confirmando…" : "Marcar como recibida"}
        </button>
      </form>

      {/* Reject toggle */}
      {!showRejectForm && (
        <button
          type="button"
          onClick={() => setShowRejectForm(true)}
          className="text-sm text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Rechazar propuesta
        </button>
      )}

      {showRejectForm && (
        <form
          action={rejectFormAction}
          className="space-y-3 rounded border border-neutral-200 dark:border-neutral-800 p-4"
        >
          <div className="space-y-1">
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Motivo del rechazo
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              maxLength={500}
              placeholder="Explicá por qué rechazás la propuesta..."
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm resize-y"
            />
          </div>

          {rejectState.error && (
            <p className="text-sm text-red-700 dark:text-red-300">{rejectState.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={rejectPending}
              className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50 text-sm"
            >
              {rejectPending ? "Enviando…" : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
