"use client";

// Deworming attendance form.
// Maps to the deworming_administered event payload schema in lib/event-schemas.ts.

import { useState, useTransition } from "react";

import type { AttendanceResult, DewormingPayload } from "@/app/actions/attendance";

type Props = {
  appointmentToken: string;
  onSubmit: (payload: { kind: "deworming" } & DewormingPayload) => Promise<AttendanceResult>;
  onSuccess?: () => void;
  submitLabel?: string;
};

export function DewormingAttendanceForm({
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

    const type = String(data.get("type") ?? "internal") as "internal" | "external" | "both";
    const payload = {
      kind: "deworming" as const,
      product: String(data.get("product") ?? "").trim(),
      type,
      next_due_at: String(data.get("next_due_at") ?? "").trim() || null,
    };

    if (!payload.product) {
      setError("El nombre del producto es obligatorio.");
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
        <label htmlFor="dew-product" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
          Producto / antiparasitario <span className="text-ln-op-danger">*</span>
        </label>
        <input
          id="dew-product"
          name="product"
          type="text"
          required
          placeholder="Ej: Nexgard, Milbemax"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        />
      </div>

      <div>
        <label htmlFor="dew-type" className="block text-xs font-medium text-ln-op-ink-2 mb-1">
          Tipo de desparasitación
        </label>
        <select
          id="dew-type"
          name="type"
          defaultValue="internal"
          className="w-full px-3 py-2 rounded-md border border-ln-op-line bg-ln-op-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-ok"
        >
          <option value="internal">Interna</option>
          <option value="external">Externa</option>
          <option value="both">Ambas</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="dew-next_due_at"
          className="block text-xs font-medium text-ln-op-ink-2 mb-1"
        >
          Próxima dosis (fecha)
        </label>
        <input
          id="dew-next_due_at"
          name="next_due_at"
          type="date"
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
