"use client";

// Generic attendance form — fallback for service_kinds without a specific schema.
// Maps to the vet_visit_logged event payload schema in lib/event-schemas.ts.

import { useState, useTransition } from "react";

import type { AttendanceResult, VetVisitPayload } from "@/app/actions/attendance";

type Props = {
  appointmentToken: string;
  onSubmit: (payload: { kind: "vet_visit" } & VetVisitPayload) => Promise<AttendanceResult>;
  onSuccess?: () => void;
  submitLabel?: string;
};

export function GenericAttendanceForm({
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
      kind: "vet_visit" as const,
      reason: String(data.get("reason") ?? "").trim(),
      diagnosis: String(data.get("diagnosis") ?? "").trim() || null,
      vet_name: String(data.get("vet_name") ?? "").trim() || null,
      clinic: String(data.get("clinic") ?? "").trim() || null,
    };

    if (!payload.reason) {
      setError("El motivo de la consulta es obligatorio.");
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
        <label htmlFor="gen-reason" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
          Motivo de la consulta <span className="text-ln-op-danger">*</span>
        </label>
        <input
          id="gen-reason"
          name="reason"
          type="text"
          required
          placeholder="Ej: Control de rutina, revisación"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
      </div>

      <div>
        <label htmlFor="gen-diagnosis" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
          Diagnóstico / observaciones
        </label>
        <input
          id="gen-diagnosis"
          name="diagnosis"
          type="text"
          placeholder="Opcional"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="gen-vet_name" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
            Veterinario/a
          </label>
          <input
            id="gen-vet_name"
            name="vet_name"
            type="text"
            placeholder="Nombre (opcional)"
            className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
          />
        </div>
        <div>
          <label htmlFor="gen-clinic" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
            Clínica
          </label>
          <input
            id="gen-clinic"
            name="clinic"
            type="text"
            placeholder="Opcional"
            className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
          />
        </div>
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
