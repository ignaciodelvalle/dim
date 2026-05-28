"use client";

// Deworming attendance form.
// Maps to the deworming_administered event payload schema in lib/event-schemas.ts.

import { useTransition } from "react";

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      alert("El nombre del producto es obligatorio.");
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
        <label className="block text-xs font-medium text-gob-text-gray  mb-1">
          Producto / antiparasitario <span className="text-gob-danger">*</span>
        </label>
        <input
          name="product"
          type="text"
          required
          placeholder="Ej: Nexgard, Milbemax"
          className="w-full px-3 py-2 rounded-md border border-gob-border-strong  bg-white  text-sm focus:outline-none focus:ring-2 focus:ring-gob-success"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gob-text-gray  mb-1">
          Tipo de desparasitación
        </label>
        <select
          name="type"
          defaultValue="internal"
          className="w-full px-3 py-2 rounded-md border border-gob-border-strong  bg-white  text-sm focus:outline-none focus:ring-2 focus:ring-gob-success"
        >
          <option value="internal">Interna</option>
          <option value="external">Externa</option>
          <option value="both">Ambas</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gob-text-gray  mb-1">
          Próxima dosis (fecha)
        </label>
        <input
          name="next_due_at"
          type="date"
          className="w-full px-3 py-2 rounded-md border border-gob-border-strong  bg-white  text-sm focus:outline-none focus:ring-2 focus:ring-gob-success"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2 rounded-md bg-gob-success text-white text-sm font-medium hover:bg-gob-success disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
