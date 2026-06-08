"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
}: {
  transferToken: string;
  isRecipient: boolean;
  isSender: boolean;
  petToken: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (isRecipient) {
    return (
      <div className="space-y-3">
        {error && (
          <p className="text-sm text-gob-danger " role="alert">
            {error}
          </p>
        )}
        {showRejectReason ? (
          <div className="space-y-2 rounded-lg border border-gob-border bg-gob-surface-alt p-3  ">
            <label htmlFor="reject-reason" className="block text-xs font-medium text-gob-text ">
              Motivo (opcional)
            </label>
            <input
              id="reject-reason"
              type="text"
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded border border-gob-border-strong bg-white px-2 py-1 text-sm  "
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRejectReason(false)}
                className="flex-1 rounded border border-gob-border-strong bg-white px-3 py-1.5 text-xs font-medium text-gob-text   "
              >
                Atrás
              </button>
              <button
                type="button"
                disabled={pending}
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
                    router.refresh();
                  });
                }}
                className="flex-1 rounded bg-gob-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-gob-danger disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowRejectReason(true)}
              className="flex-1 rounded-lg border border-gob-danger bg-white px-3 py-2 text-sm font-medium text-gob-danger hover:bg-gob-danger/10 disabled:opacity-50   "
            >
              Rechazar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await acceptPetTransferAction(transferToken);
                  if ("error" in result) {
                    setError(result.error);
                    return;
                  }
                  router.push(`/mis-mascotas/${petToken}`);
                  router.refresh();
                });
              }}
              className="flex-1 rounded-lg bg-gob-success px-3 py-2 text-sm font-medium text-white hover:bg-gob-success disabled:opacity-50"
            >
              {pending ? "Aceptando…" : "Aceptar"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isSender) {
    return (
      <div className="space-y-3">
        {error && (
          <p className="text-sm text-gob-danger " role="alert">
            {error}
          </p>
        )}
        <p className="text-sm text-gob-text-gray ">Esperando respuesta del receptor.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                "¿Cancelar la transferencia? Si después querés transferir de nuevo tenés que iniciar otra propuesta.",
              )
            )
              return;
            startTransition(async () => {
              const result = await cancelPetTransferAction(transferToken);
              if ("error" in result) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
          className="w-full rounded-lg border border-gob-border-strong bg-white px-3 py-2 text-sm font-medium text-gob-text hover:bg-gob-surface-alt disabled:opacity-50   "
        >
          {pending ? "Cancelando…" : "Cancelar transferencia"}
        </button>
      </div>
    );
  }

  return null;
}
