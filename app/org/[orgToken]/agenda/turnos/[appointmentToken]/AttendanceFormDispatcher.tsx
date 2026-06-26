"use client";

// Client component that selects and renders the right attendance form
// based on the offering's service_kind. Shared between org-side and pro-side
// detail pages.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DewormingAttendanceForm } from "@/app/_components/attendance-forms/DewormingAttendanceForm";
import { GenericAttendanceForm } from "@/app/_components/attendance-forms/GenericAttendanceForm";
import { MicrochipAttendanceForm } from "@/app/_components/attendance-forms/MicrochipAttendanceForm";
import { SterilizationAttendanceForm } from "@/app/_components/attendance-forms/SterilizationAttendanceForm";
import { VaccinationAttendanceForm } from "@/app/_components/attendance-forms/VaccinationAttendanceForm";
import type { AttendancePayload, AttendanceResult } from "@/app/actions/attendance";

type Props = {
  appointmentToken: string;
  serviceKind: string;
  backUrl: string;
  onAttend: (token: string, payload: AttendancePayload) => Promise<AttendanceResult>;
  onNoShow: (token: string, reason: string) => Promise<{ ok: true } | { error: string }>;
  onCancel: (token: string, reason: string) => Promise<{ ok: true } | { error: string }>;
};

// Modes for the "other actions" section.
type ActionMode = "idle" | "noshow" | "cancel";

export function AttendanceFormDispatcher({
  appointmentToken,
  serviceKind,
  backUrl,
  onAttend,
  onNoShow,
  onCancel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionMode, setActionMode] = useState<ActionMode>("idle");
  const [noShowReason, setNoShowReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  function handleSuccess() {
    router.push(backUrl);
    router.refresh();
  }

  function submitNoShow() {
    setActionError(null);
    startTransition(async () => {
      const result = await onNoShow(appointmentToken, noShowReason);
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      handleSuccess();
    });
  }

  function submitCancel() {
    setActionError(null);
    startTransition(async () => {
      const result = await onCancel(appointmentToken, cancelReason);
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      handleSuccess();
    });
  }

  function resetAction() {
    setActionMode("idle");
    setNoShowReason("");
    setCancelReason("");
    setActionError(null);
  }

  // Per-service-kind form dispatcher.
  const isVaccination = serviceKind.startsWith("vaccination_");
  const isDeworming = serviceKind === "deworming";
  const isSterilization = serviceKind.startsWith("sterilization_");
  const isMicrochip = serviceKind === "microchip_implantation";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-md font-semibold text-ln-op-ink mb-4">Registrar asistencia</h2>

        {isVaccination && (
          <VaccinationAttendanceForm
            appointmentToken={appointmentToken}
            onSubmit={(payload) => onAttend(appointmentToken, payload)}
            onSuccess={handleSuccess}
          />
        )}

        {isDeworming && (
          <DewormingAttendanceForm
            appointmentToken={appointmentToken}
            onSubmit={(payload) => onAttend(appointmentToken, payload)}
            onSuccess={handleSuccess}
          />
        )}

        {isSterilization && (
          <SterilizationAttendanceForm
            appointmentToken={appointmentToken}
            onSubmit={(payload) => onAttend(appointmentToken, payload)}
            onSuccess={handleSuccess}
          />
        )}

        {isMicrochip && (
          <MicrochipAttendanceForm
            appointmentToken={appointmentToken}
            onSubmit={(payload) => onAttend(appointmentToken, payload)}
            onSuccess={handleSuccess}
          />
        )}

        {!isVaccination && !isDeworming && !isSterilization && !isMicrochip && (
          <GenericAttendanceForm
            appointmentToken={appointmentToken}
            onSubmit={(payload) => onAttend(appointmentToken, payload)}
            onSuccess={handleSuccess}
          />
        )}
      </section>

      <section className="border-t border-ln-op-line pt-6 space-y-3">
        <h2 className="text-sm font-medium text-ln-op-mute uppercase tracking-[0.08em]">
          Otras acciones
        </h2>

        {actionError && (
          <p
            role="alert"
            className="rounded-[4px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-sm text-ln-op-danger"
          >
            {actionError}
          </p>
        )}

        {actionMode === "idle" && (
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setActionMode("noshow")}
              className="px-4 py-2 rounded-[6px] border border-ln-op-warn text-ln-op-warn text-[13px] font-medium hover:bg-ln-op-warn-bg transition-colors"
            >
              No vino
            </button>
            <button
              type="button"
              onClick={() => setActionMode("cancel")}
              className="px-4 py-2 rounded-[6px] border border-ln-op-danger text-ln-op-danger text-[13px] font-medium hover:bg-ln-op-danger-bg transition-colors"
            >
              Cancelar turno
            </button>
          </div>
        )}

        {actionMode === "noshow" && (
          <div className="space-y-2 rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg p-3">
            <label htmlFor="noshow-reason" className="block text-sm font-medium text-ln-op-ink">
              Motivo de la ausencia (opcional)
            </label>
            <input
              id="noshow-reason"
              type="text"
              value={noShowReason}
              onChange={(e) => setNoShowReason(e.target.value)}
              placeholder="Ej: No se presentó sin aviso"
              className="w-full rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-warn"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitNoShow}
                disabled={pending}
                className="rounded-[4px] bg-ln-op-warn px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pending ? "Guardando…" : "Confirmar ausencia"}
              </button>
              <button
                type="button"
                onClick={resetAction}
                disabled={pending}
                className="rounded-[4px] border border-ln-op-line px-4 py-1.5 text-[13px] text-ln-op-ink hover:bg-ln-op-stripe disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {actionMode === "cancel" && (
          <div className="space-y-2 rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg p-3">
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-ln-op-ink">
              Motivo de la cancelación (opcional)
            </label>
            <input
              id="cancel-reason"
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej: Cancelado por el profesional"
              className="w-full rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-danger"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitCancel}
                disabled={pending}
                className="rounded-[4px] bg-ln-op-danger px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pending ? "Cancelando…" : "Confirmar cancelación"}
              </button>
              <button
                type="button"
                onClick={resetAction}
                disabled={pending}
                className="rounded-[4px] border border-ln-op-line px-4 py-1.5 text-[13px] text-ln-op-ink hover:bg-ln-op-stripe disabled:opacity-50 transition-colors"
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
