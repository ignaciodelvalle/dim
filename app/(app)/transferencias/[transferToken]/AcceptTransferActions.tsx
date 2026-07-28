"use client";

import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import { useActionNavigate } from "@/lib/ui/use-action-redirect";
import {
  acceptPetTransferAction,
  cancelPetTransferAction,
  rejectPetTransferAction,
} from "@/src/modules/transfers/actions";

export function AcceptTransferActions({
  transferToken,
  isRecipient,
  isSender,
  petToken,
  petName,
}: {
  transferToken: string;
  isRecipient: boolean;
  isSender: boolean;
  petToken: string;
  petName: string;
}) {
  const [pending, startTransition] = useTransition();
  // `busy` is what the controls read: the transition's pending PLUS the window
  // where the document is on its way out (X1-F1 — see useActionNavigate).
  const [error, setError] = useState<string | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Accepting a transfer is IRREVERSIBLE (ownership changes hands, no undo) —
  // it must be gated behind the same confirmation weight as rejecting.
  // Previously accept fired on a single click while reject asked for a
  // reason + a second confirm click — backwards (audit finding, safety pass
  // 2026-07-19).
  // Accepting a transfer twice returns a confusing post-hoc error, and the
  // control invited exactly that: the transition's pending dropped the instant
  // assign() returned, re-enabling the button over the unchanged page (X1-F1).
  const [navigate, navigating] = useActionNavigate();
  const busy = pending || navigating;
  const [confirmAccept, setConfirmAccept] = useState(false);
  const acceptTriggerRef = useRef<HTMLButtonElement>(null);

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptPetTransferAction(transferToken);
      if ("error" in result) {
        setError(result.error);
        setConfirmAccept(false);
        return;
      }
      // Ownership just changed (custody event emitted) — land on
      // the pet profile with one full document navigation so its
      // SSR ownership badges match the DB (soft push + refresh is
      // banned — see lib/ui/full-page-action-nav.ts).
      navigate(`/mis-mascotas/${petToken}`);
    });
  }

  if (isRecipient) {
    return (
      <div className="space-y-3">
        {error && (
          <p className="text-sm text-[var(--color-ln-err)]" role="alert">
            {error}
          </p>
        )}
        {showRejectReason ? (
          <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] p-3">
            <label
              htmlFor="reject-reason"
              className="block text-xs font-medium text-[var(--color-ln-ink)]"
            >
              Motivo (opcional)
            </label>
            <input
              id="reject-reason"
              type="text"
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-2 py-1 text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRejectReason(false)}
                className="flex-1 rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-ln-ink)]"
              >
                Atrás
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  startTransition(async () => {
                    const result = await rejectPetTransferAction({
                      transferToken,
                      reason: rejectReason || null,
                    });
                    if ("error" in result) {
                      setError(result.error);
                      return;
                    }
                    // Full reload so the SSR transfer page shows the rejected
                    // state (router.refresh() is banned — see
                    // lib/ui/full-page-action-nav.ts).
                    navigateAfterActionSuccess(window.location.href);
                  });
                }}
                className="flex-1 rounded-[3px] bg-[var(--color-ln-seal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowRejectReason(true)}
              className="flex-1 rounded-[3px] border border-[var(--color-ln-seal)] bg-[var(--color-ln-card)] px-3 py-2 text-sm font-medium text-[var(--color-ln-seal)] hover:bg-[var(--color-ln-err-050)] disabled:opacity-50"
            >
              Rechazar
            </button>
            <button
              ref={acceptTriggerRef}
              type="button"
              disabled={busy}
              onClick={() => setConfirmAccept(true)}
              className="flex-1 rounded-[3px] bg-[var(--color-ln-ok)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Aceptar
            </button>
          </div>
        )}
        <ConfirmDialog
          open={confirmAccept}
          onClose={() => !busy && setConfirmAccept(false)}
          onConfirm={handleAccept}
          title="Aceptar transferencia de titularidad"
          description={`Vas a aceptar la transferencia de titularidad de ${petName}. Esta acción no se puede deshacer.`}
          confirmLabel="Aceptar transferencia"
          tone="warn"
          pending={busy}
          triggerRef={acceptTriggerRef}
        />
      </div>
    );
  }

  if (isSender) {
    return (
      <div className="space-y-3">
        {error && (
          <p className="text-sm text-[var(--color-ln-err)]" role="alert">
            {error}
          </p>
        )}
        <p className="text-sm text-[var(--color-ln-ink-2)]">Esperando respuesta del receptor.</p>
        {confirmCancel ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] p-3 space-y-2">
            <p className="text-sm text-[var(--color-ln-ink-2)]">
              Si después querés transferir de nuevo tenés que iniciar otra propuesta.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  startTransition(async () => {
                    const result = await cancelPetTransferAction(transferToken);
                    if ("error" in result) {
                      setError(result.error);
                      setConfirmCancel(false);
                      return;
                    }
                    // Full reload so the SSR transfer page shows the cancelled
                    // state (router.refresh() is banned — see
                    // lib/ui/full-page-action-nav.ts).
                    navigateAfterActionSuccess(window.location.href);
                  });
                }}
                className="flex-1 rounded-[3px] bg-[var(--color-ln-seal)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Cancelando…" : "Confirmar cancelación"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel(false)}
                className="flex-1 rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 text-sm font-medium text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] disabled:opacity-50"
              >
                Atrás
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmCancel(true)}
            className="w-full rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 text-sm font-medium text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] disabled:opacity-50"
          >
            Cancelar transferencia
          </button>
        )}
      </div>
    );
  }

  return null;
}
