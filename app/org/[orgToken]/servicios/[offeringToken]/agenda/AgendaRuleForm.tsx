"use client";

// Client component: add or edit a schedule rule.
// Uses useActionState for progressive enhancement.

import type { ScheduleRuleFormState } from "@/app/actions/schedule-rules";
import { useActionState } from "react";

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

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="serviceOfferingId" value={serviceOfferingId} />
      <input type="hidden" name="offeringPublicToken" value={offeringPublicToken} />
      <input type="hidden" name="orgToken" value={orgToken} />

      {state.error && (
        <p className="text-sm rounded border border-gob-danger bg-gob-danger/10 px-3 py-2 text-gob-danger   ">
          {state.error}
        </p>
      )}

      {/* Days of week */}
      <div className="space-y-1">
        <span className="block text-sm font-medium">
          Días <span className="text-gob-danger">*</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="daysOfWeek"
                value={d.value}
                defaultChecked={defaultDays?.includes(d.value) ?? d.value <= 5}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      {/* Time window */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="startTimeLocal" className="block text-sm font-medium">
            Hora inicio <span className="text-gob-danger">*</span>
          </label>
          <input
            id="startTimeLocal"
            name="startTimeLocal"
            type="time"
            required
            defaultValue="08:00"
            className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gob-primary"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="endTimeLocal" className="block text-sm font-medium">
            Hora fin <span className="text-gob-danger">*</span>
          </label>
          <input
            id="endTimeLocal"
            name="endTimeLocal"
            type="time"
            required
            defaultValue="12:00"
            className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gob-primary"
          />
        </div>
      </div>

      {/* Effective range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="effectiveFrom" className="block text-sm font-medium">
            Válido desde <span className="text-gob-danger">*</span>
          </label>
          <input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            required
            defaultValue={today}
            className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gob-primary"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="effectiveUntil" className="block text-sm font-medium">
            Válido hasta{" "}
            <span className="text-gob-text-muted font-normal">
              (opcional — sin fecha = abierto)
            </span>
          </label>
          <input
            id="effectiveUntil"
            name="effectiveUntil"
            type="date"
            className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gob-primary"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded bg-gob-primary text-white   text-sm disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Agregar regla"}
        </button>
      </div>
    </form>
  );
}
