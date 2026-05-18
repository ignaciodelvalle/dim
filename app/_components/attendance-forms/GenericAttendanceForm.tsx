"use client";

// Generic attendance form — fallback for service_kinds without a specific schema.
// Maps to the vet_visit_logged event payload schema in lib/event-schemas.ts.

import { useTransition } from "react";

import type { AttendanceResult, VetVisitPayload } from "@/app/actions/attendance";

type Props = {
  appointmentToken: string;
  onSubmit: (payload: { kind: "vet_visit" } & VetVisitPayload) => Promise<AttendanceResult>;
  onSuccess?: () => void;
  submitLabel?: string;
};

export function GenericAttendanceForm({ appointmentToken, onSubmit, onSuccess, submitLabel = "Marcar asistencia" }: Props) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = {
      kind: "vet_visit" as const,
      reason: String(data.get("reason") ?? "").trim(),
      diagnosis: String(data.get("diagnosis") ?? "").trim() || null,
      vet_name: String(data.get("vet_name") ?? "").trim() || null,
      clinic: String(data.get("clinic") ?? "").trim() || null,
    };

    if (!payload.reason) {
      alert("El motivo de la consulta es obligatorio.");
      return;
    }

    startTransition(async () => {
      const result = await onSubmit(payload);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      onSuccess?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Motivo de la consulta <span className="text-red-500">*</span>
        </label>
        <input
          name="reason"
          type="text"
          required
          placeholder="Ej: Control de rutina, revisación"
          className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Diagnóstico / observaciones
        </label>
        <input
          name="diagnosis"
          type="text"
          placeholder="Opcional"
          className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Veterinario/a
          </label>
          <input
            name="vet_name"
            type="text"
            placeholder="Nombre (opcional)"
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Clínica
          </label>
          <input
            name="clinic"
            type="text"
            placeholder="Opcional"
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
