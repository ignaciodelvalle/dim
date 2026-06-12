"use client";

// Vaccination attendance form.
// Maps to the vaccination_administered event payload schema in lib/event-schemas.ts.

import { useState, useTransition } from "react";

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
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
      setError("El nombre de la vacuna es obligatorio.");
      return;
    }

    startTransition(async () => {
      const result = await onSubmit(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-[4px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-sm text-ln-op-danger"
        >
          {error}
        </p>
      )}
      <div>
        <label
          htmlFor="vacc-vaccine_name"
          className="block text-xs font-medium text-ln-op-ink-2 mb-1"
        >
          Nombre de la vacuna <span className="text-ln-op-danger">*</span>
        </label>
        <input
          id="vacc-vaccine_name"
          name="vaccine_name"
          type="text"
          required
          placeholder="Ej: Antirrábica"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="vacc-brand" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
            Marca / laboratorio
          </label>
          <input
            id="vacc-brand"
            name="brand"
            type="text"
            placeholder="Opcional"
            className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
          />
        </div>
        <div>
          <label htmlFor="vacc-batch" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
            Lote / número de batch
          </label>
          <input
            id="vacc-batch"
            name="batch"
            type="text"
            placeholder="Opcional"
            className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="vacc-administered_by"
          className="block text-xs font-medium text-ln-op-ink-2 mb-1"
        >
          Administrado por
        </label>
        <input
          id="vacc-administered_by"
          name="administered_by"
          type="text"
          placeholder="Nombre del profesional (opcional)"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
      </div>

      <div>
        <label
          htmlFor="vacc-next_due_at"
          className="block text-xs font-medium text-ln-op-ink-2 mb-1"
        >
          Próxima dosis (fecha)
        </label>
        <input
          id="vacc-next_due_at"
          name="next_due_at"
          type="date"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
        <p className="text-xs text-ln-op-mute mt-1">
          Si se completa, se crea un recordatorio automático para el dueño.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2 rounded-md bg-ln-op-ok text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
