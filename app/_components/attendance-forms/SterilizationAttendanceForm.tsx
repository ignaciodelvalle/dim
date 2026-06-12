"use client";

// Sterilization attendance form.
// Maps to the sterilization_performed event payload schema in lib/event-schemas.ts.

import { useState, useTransition } from "react";

import type { AttendanceResult, SterilizationPayload } from "@/app/actions/attendance";

type Props = {
  appointmentToken: string;
  onSubmit: (
    payload: { kind: "sterilization" } & SterilizationPayload,
  ) => Promise<AttendanceResult>;
  onSuccess?: () => void;
  submitLabel?: string;
};

export function SterilizationAttendanceForm({
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

    const procedure = String(data.get("procedure") ?? "castration") as "castration" | "spay";
    const payload = {
      kind: "sterilization" as const,
      procedure,
      performed_by: String(data.get("performed_by") ?? "").trim() || null,
      clinic: String(data.get("clinic") ?? "").trim() || null,
    };

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
        <label htmlFor="ster-procedure" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
          Procedimiento
        </label>
        <select
          id="ster-procedure"
          name="procedure"
          defaultValue="castration"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        >
          <option value="castration">Castración (macho)</option>
          <option value="spay">Ovariectomía / Castración (hembra)</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="ster-performed_by"
          className="block text-xs font-medium text-ln-op-ink-2 mb-1"
        >
          Realizado por
        </label>
        <input
          id="ster-performed_by"
          name="performed_by"
          type="text"
          placeholder="Nombre del cirujano (opcional)"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
      </div>

      <div>
        <label htmlFor="ster-clinic" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
          Clínica / establecimiento
        </label>
        <input
          id="ster-clinic"
          name="clinic"
          type="text"
          placeholder="Nombre del lugar (opcional)"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
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
