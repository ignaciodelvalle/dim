"use client";

// Vaccination attendance form.
// Maps to the vaccination_administered event payload schema in lib/event-schemas.ts.

import { useTransition } from "react";

import type { AttendanceResult, VaccinationPayload } from "@/app/actions/attendance";

type Props = {
  appointmentToken: string;
  onSubmit: (payload: { kind: "vaccination" } & VaccinationPayload) => Promise<AttendanceResult>;
  onSuccess?: () => void;
  submitLabel?: string;
};

export function VaccinationAttendanceForm({
  appointmentToken,
  onSubmit,
  onSuccess,
  submitLabel = "Marcar asistencia",
}: Props) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = {
      kind: "vaccination" as const,
      vaccine_name: String(data.get("vaccine_name") ?? "").trim(),
      brand: String(data.get("brand") ?? "").trim() || null,
      batch: String(data.get("batch") ?? "").trim() || null,
      administered_by: String(data.get("administered_by") ?? "").trim() || null,
      next_due_at: String(data.get("next_due_at") ?? "").trim() || null,
    };

    if (!payload.vaccine_name) {
      alert("El nombre de la vacuna es obligatorio.");
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
          Nombre de la vacuna <span className="text-red-500">*</span>
        </label>
        <input
          name="vaccine_name"
          type="text"
          required
          placeholder="Ej: Antirrábica"
          className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Marca / laboratorio
          </label>
          <input
            name="brand"
            type="text"
            placeholder="Opcional"
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Lote / número de batch
          </label>
          <input
            name="batch"
            type="text"
            placeholder="Opcional"
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Administrado por
        </label>
        <input
          name="administered_by"
          type="text"
          placeholder="Nombre del profesional (opcional)"
          className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Próxima dosis (fecha)
        </label>
        <input
          name="next_due_at"
          type="date"
          className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Si se completa, se crea un recordatorio automático para el dueño.
        </p>
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
