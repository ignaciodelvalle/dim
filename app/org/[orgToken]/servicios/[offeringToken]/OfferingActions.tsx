"use client";

// Inline-confirm controls for pause (toggle) and archive (soft-delete).
// Mirrors the LeaveOrgButton pattern: two-step confirm, no modal dependency.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveServiceOfferingAction,
  pauseServiceOfferingAction,
  unpauseServiceOfferingAction,
} from "@/app/actions/service-offerings";

type Props = {
  orgToken: string;
  offeringToken: string;
  status: string;
};

type ActionKey = "pause" | "unpause" | "archive" | null;

export function OfferingActions({ orgToken, offeringToken, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<ActionKey>(null);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const isArchived = status === "archived";

  function run(action: NonNullable<ActionKey>) {
    setError(null);
    startTransition(async () => {
      let result: { ok: true } | { error: string };
      if (action === "pause") {
        result = await pauseServiceOfferingAction(orgToken, offeringToken);
      } else if (action === "unpause") {
        result = await unpauseServiceOfferingAction(orgToken, offeringToken);
      } else {
        result = await archiveServiceOfferingAction(orgToken, offeringToken);
      }

      if ("error" in result) {
        setError(result.error);
        setConfirming(null);
        return;
      }

      if (action === "archive") {
        router.push(`/org/${orgToken}/servicios`);
      } else {
        router.refresh();
        setConfirming(null);
      }
    });
  }

  if (isArchived) return null;

  if (confirming !== null) {
    const isDestructive = confirming === "archive";
    const labelMap: Record<NonNullable<ActionKey>, string> = {
      pause: "¿Pausar el servicio? Dejará de aparecer en búsquedas.",
      unpause: "¿Reactivar el servicio?",
      archive: "¿Eliminar el servicio? Esta acción no se puede deshacer.",
    };
    const confirmLabel: Record<NonNullable<ActionKey>, string> = {
      pause: "Pausar",
      unpause: "Reactivar",
      archive: "Eliminar",
    };
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[12px] text-ln-op-mute">{labelMap[confirming]}</p>
        {error && (
          <p className="text-[12px] text-ln-op-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run(confirming)}
            disabled={pending}
            className={`rounded-[4px] px-3 py-[5px] text-[12px] font-medium text-white transition-colors disabled:opacity-60 ${
              isDestructive ? "bg-ln-op-danger" : "bg-ln-op-azul"
            }`}
          >
            {pending ? "Procesando..." : confirmLabel[confirming]}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(null);
              setError(null);
            }}
            disabled={pending}
            className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <p className="w-full text-[12px] text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => setConfirming(isPaused ? "unpause" : "pause")}
        className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe"
      >
        {isPaused ? "Reactivar servicio" : "Pausar servicio"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming("archive")}
        className="rounded-[4px] px-3 py-[5px] text-[12px] font-medium text-ln-op-danger transition-colors hover:bg-ln-op-danger-bg"
      >
        Eliminar
      </button>
    </div>
  );
}
