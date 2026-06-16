"use client";

// Client component: add or edit a schedule rule.
// Uses useActionState for progressive enhancement.

import type { ScheduleRuleFormState } from "@/app/actions/schedule-rules";
import { LnCheckbox, LnInput } from "@/components/ui/Field";
import { useActionState, useState } from "react";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

const INITIAL_STATE: ScheduleRuleFormState = { error: null };

export function AgendaRuleForm({
  serviceOfferingId,
  offeringPublicToken,
  orgToken,
  createAction,
  defaultDays,
}: {
  serviceOfferingId: string;
  offeringPublicToken: string;
  orgToken: string;
  createAction: (prev: ScheduleRuleFormState, formData: FormData) => Promise<ScheduleRuleFormState>;
  defaultDays?: number[];
}) {
  const [state, formAction, isPending] = useActionState(createAction, INITIAL_STATE);

  const today = new Date().toISOString().slice(0, 10);

  // Controlled field state — preserves typed input on validation error.
  const [startTimeLocal, setStartTimeLocal] = useState("08:00");
  const [endTimeLocal, setEndTimeLocal] = useState("12:00");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [effectiveUntil, setEffectiveUntil] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="serviceOfferingId" value={serviceOfferingId} />
      <input type="hidden" name="offeringPublicToken" value={offeringPublicToken} />
      <input type="hidden" name="orgToken" value={orgToken} />

      {state.error && (
        <p className="text-[13px] rounded-[6px] border border-ln-op-danger bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
          {state.error}
        </p>
      )}

      {/* Days of week */}
      <div className="space-y-1">
        <span className="block text-[13px] font-medium text-ln-op-ink">
          Días <span className="text-ln-op-danger">*</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <LnCheckbox
              key={d.value}
              name="daysOfWeek"
              value={d.value}
              defaultChecked={defaultDays?.includes(d.value) ?? d.value <= 5}
            >
              {d.label}
            </LnCheckbox>
          ))}
        </div>
      </div>

      {/* Time window */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="startTimeLocal" className="block text-[13px] font-medium text-ln-op-ink">
            Hora inicio <span className="text-ln-op-danger">*</span>
          </label>
          <LnInput
            id="startTimeLocal"
            name="startTimeLocal"
            type="time"
            required
            value={startTimeLocal}
            onChange={(e) => setStartTimeLocal(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="endTimeLocal" className="block text-[13px] font-medium text-ln-op-ink">
            Hora fin <span className="text-ln-op-danger">*</span>
          </label>
          <LnInput
            id="endTimeLocal"
            name="endTimeLocal"
            type="time"
            required
            value={endTimeLocal}
            onChange={(e) => setEndTimeLocal(e.target.value)}
          />
        </div>
      </div>

      {/* Effective range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="effectiveFrom" className="block text-[13px] font-medium text-ln-op-ink">
            Válido desde <span className="text-ln-op-danger">*</span>
          </label>
          <LnInput
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            required
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="effectiveUntil" className="block text-[13px] font-medium text-ln-op-ink">
            Válido hasta{" "}
            <span className="text-ln-op-mute font-normal">(opcional — sin fecha = abierto)</span>
          </label>
          <LnInput
            id="effectiveUntil"
            name="effectiveUntil"
            type="date"
            value={effectiveUntil}
            onChange={(e) => setEffectiveUntil(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {isPending ? "Guardando…" : "Agregar regla"}
        </button>
      </div>
    </form>
  );
}
