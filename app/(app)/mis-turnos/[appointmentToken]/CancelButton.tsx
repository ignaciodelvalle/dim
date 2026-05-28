"use client";

// Owner-side cancellation button for /mis-turnos/[appointmentToken] (Fase 6).

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cancelAppointmentByOwnerAction } from "@/app/actions/booking";

type Props = {
  appointmentToken: string;
};

export function CancelButton({ appointmentToken }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    if (!confirm("¿Confirmás la cancelación de este turno?")) return;

    startTransition(async () => {
      const result = await cancelAppointmentByOwnerAction(appointmentToken);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={pending}
      className="px-4 py-2 rounded-md border border-gob-danger  text-gob-danger  text-sm font-medium hover:bg-gob-danger/10  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Cancelando…" : "Cancelar turno"}
    </button>
  );
}
