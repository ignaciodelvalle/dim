"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptPetTransferAction,
  cancelPetTransferAction,
  rejectPetTransferAction,
} from "@/app/actions/pet-transfer";

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
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {showRejectReason ? (
          <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <label
              htmlFor="reject-reason"
              className="block text-xs font-medium text-neutral-900 dark:text-neutral-50"
            >
              Motivo (opcional)
            </label>
            <input
              id="reject-reason"
              type="text"
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRejectReason(false)}
                className="flex-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
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
                className="flex-1 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
              className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-neutral-950 dark:text-red-300"
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
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Esperando respuesta del receptor.
        </p>
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
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        >
          {pending ? "Cancelando…" : "Cancelar transferencia"}
        </button>
      </div>
    );
  }

  return null;
}
