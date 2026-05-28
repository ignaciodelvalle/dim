"use client";

// Client component that selects and renders the right attendance form
// based on the offering's service_kind. Shared between org-side and pro-side
// detail pages.

import { useRouter } from "next/navigation";

import { DewormingAttendanceForm } from "@/app/_components/attendance-forms/DewormingAttendanceForm";
import { GenericAttendanceForm } from "@/app/_components/attendance-forms/GenericAttendanceForm";
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

export function AttendanceFormDispatcher({
  appointmentToken,
  serviceKind,
  backUrl,
  onAttend,
  onNoShow,
  onCancel,
}: Props) {
  const router = useRouter();

  function handleSuccess() {
    router.push(backUrl);
    router.refresh();
  }

  async function handleNoShow() {
    const reason = prompt("Motivo de la ausencia (opcional):") ?? "";
    const result = await onNoShow(appointmentToken, reason);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    handleSuccess();
  }

  async function handleCancel() {
    const reason = prompt("Motivo de la cancelación (opcional):") ?? "";
    if (!confirm("¿Confirmás la cancelación del turno?")) return;
    const result = await onCancel(appointmentToken, reason);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    handleSuccess();
  }

  // Per-service-kind form dispatcher.
  const isVaccination = serviceKind.startsWith("vaccination_");
  const isDeworming = serviceKind === "deworming";
  const isSterilization = serviceKind.startsWith("sterilization_");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold text-gob-text  mb-4">Registrar asistencia</h2>

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

        {!isVaccination && !isDeworming && !isSterilization && (
          <GenericAttendanceForm
            appointmentToken={appointmentToken}
            onSubmit={(payload) => onAttend(appointmentToken, payload)}
            onSuccess={handleSuccess}
          />
        )}
      </section>

      <section className="border-t border-gob-border  pt-6 space-y-3">
        <h2 className="text-sm font-medium text-gob-text-gray ">Otras acciones</h2>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleNoShow}
            className="px-4 py-2 rounded-md border border-gob-warning  text-gob-warning-text  text-sm font-medium hover:bg-gob-warning/10  transition-colors"
          >
            No vino
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-md border border-gob-danger  text-gob-danger  text-sm font-medium hover:bg-gob-danger/10  transition-colors"
          >
            Cancelar turno
          </button>
        </div>
      </section>
    </div>
  );
}
