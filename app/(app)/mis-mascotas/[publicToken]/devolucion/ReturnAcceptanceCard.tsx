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
      <div className="rounded border border-gob-success bg-gob-success/10   p-4 space-y-2">
        <p className="text-gob-success  font-medium">
          Devolución confirmada. {petName} está de vuelta con vos.
        </p>
        <a href={backUrl} className="text-sm underline text-gob-success ">
          Ir a mis mascotas
        </a>
      </div>
    );
  }

  // Auto-cancelled — show explanation banner.
  if (acceptState.autoCancelled) {
    return (
      <div className="rounded border border-gob-warning bg-gob-warning/10   p-4 space-y-2">
        <p className="text-gob-warning-text  font-medium">La propuesta ya no es válida</p>
        <p className="text-gob-warning-text  text-sm">{acceptState.autoCancelReason}</p>
        <a href={backUrl} className="text-sm underline text-gob-warning-text ">
          Volver a mis mascotas
        </a>
      </div>
    );
  }

  // Rejected successfully.
  if (rejectState.success) {
    return (
      <div className="rounded border border-gob-border-strong bg-gob-surface-alt   p-4 space-y-2">
        <p className="text-gob-text  font-medium">
          Propuesta rechazada. {actorName} fue notificado.
        </p>
        <a href={backUrl} className="text-sm underline text-gob-text-gray ">
          Volver a mis mascotas
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Proposal card */}
      <div className="rounded border border-gob-border  p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm text-gob-text-muted uppercase tracking-wide">
            Propuesta de devolución
          </p>
          <p className="text-base font-semibold">
            {actorName} está listo para devolverte a {petName}
          </p>
          <p className="text-xs text-gob-text-muted">
            Propuesta el{" "}
            {new Date(proposedAt).toLocaleDateString("es-AR", {
              dateStyle: "long",
            })}
          </p>
        </div>

        {proposalNotes && (
          <div className="rounded bg-gob-surface-alt  p-3 text-sm text-gob-text-gray  whitespace-pre-line">
            {proposalNotes}
          </div>
        )}
      </div>

      {/* Accept action */}
      {acceptState.error && (
        <p className="text-sm rounded border border-gob-danger bg-gob-danger/10 px-3 py-2 text-gob-danger   ">
          {acceptState.error}
        </p>
      )}

      <form action={acceptFormAction}>
        <button
          type="submit"
          disabled={acceptPending}
          className="w-full py-3 rounded bg-gob-success text-white hover:bg-gob-success disabled:opacity-50 font-medium transition-colors"
        >
          {acceptPending ? "Confirmando…" : "Marcar como recibida"}
        </button>
      </form>

      {/* Reject toggle */}
      {!showRejectForm && (
        <button
          type="button"
          onClick={() => setShowRejectForm(true)}
          className="text-sm text-gob-text-muted underline hover:text-gob-text-gray "
        >
          Rechazar propuesta
        </button>
      )}

      {showRejectForm && (
        <form action={rejectFormAction} className="space-y-3 rounded border border-gob-border  p-4">
          <div className="space-y-1">
            <label htmlFor="reason" className="block text-sm font-medium text-gob-text-gray ">
              Motivo del rechazo
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              maxLength={500}
              placeholder="Explicá por qué rechazás la propuesta..."
              className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2 text-sm resize-y"
            />
          </div>

          {rejectState.error && <p className="text-sm text-gob-danger ">{rejectState.error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={rejectPending}
              className="px-4 py-2 rounded bg-gob-primary text-white   disabled:opacity-50 text-sm"
            >
              {rejectPending ? "Enviando…" : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              className="px-4 py-2 rounded border border-gob-border-strong  text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
