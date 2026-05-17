"use client";

import { type IntakeFormState, createIntakeAction } from "@/app/actions/intake";
import { useActionState } from "react";

const initialState: IntakeFormState = { error: null };

const INTAKE_REASONS = [
  { value: "rescue", label: "Rescate" },
  { value: "surrender", label: "Entrega del dueño" },
  { value: "seizure", label: "Decomiso / Ley 14.346" },
  { value: "stray_found", label: "Animal en la vía pública" },
  { value: "other", label: "Otro" },
] as const;

export function IntakeForm({ orgToken }: { orgToken: string }) {
  const action = createIntakeAction.bind(null, orgToken);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Sobre el animal
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm">Nombre o alias temporal *</span>
            <input
              name="name"
              required
              maxLength={120}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
              placeholder="Ej: Negrita, Sin nombre, Marrón #4"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Especie *</span>
            <select
              name="species"
              required
              defaultValue=""
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            >
              <option value="" disabled>
                Seleccionar
              </option>
              <option value="dog">Perro</option>
              <option value="cat">Gato</option>
              <option value="other">Otra</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-sm">Sexo</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="sex" value="unknown" defaultChecked /> Desconocido
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="sex" value="male" /> Macho
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="sex" value="female" /> Hembra
            </label>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm">Edad estimada — años</span>
            <input
              name="ageYears"
              type="number"
              min={0}
              max={40}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Edad estimada — meses</span>
            <input
              name="ageMonths"
              type="number"
              min={0}
              max={11}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm">Raza (si se sabe)</span>
            <input
              name="breed"
              maxLength={120}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Color / pelaje</span>
            <input
              name="color"
              maxLength={120}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm">Señas particulares</span>
          <textarea
            name="distinguishingFeatures"
            rows={2}
            maxLength={500}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            placeholder="Cicatrices, manchas, oreja cortada, etc."
          />
        </label>

        <details className="space-y-2">
          <summary className="text-sm cursor-pointer">Microchip (opcional)</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="space-y-1">
              <span className="text-sm">Número de microchip</span>
              <input
                name="microchipId"
                maxLength={20}
                className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">País del chip</span>
              <input
                name="microchipCountryCode"
                maxLength={3}
                defaultValue="858"
                className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
              />
            </label>
          </div>
        </details>
      </section>

      <section className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Sobre el ingreso
        </h2>

        <fieldset className="space-y-1">
          <legend className="text-sm">Motivo *</legend>
          <div className="flex flex-col gap-1 text-sm">
            {INTAKE_REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2">
                <input type="radio" name="intakeReason" value={r.value} required /> {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm">Rol de la organización</legend>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="custodyRole"
                value="shelter_custody"
                defaultChecked
                className="mt-1"
              />
              <span>
                <span className="block font-medium">Custodia temporal</span>
                <span className="block text-xs text-neutral-500">
                  El animal queda bajo cuidado del refugio hasta que se concrete una adopción.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="custodyRole" value="owner" className="mt-1" />
              <span>
                <span className="block font-medium">Dueño/a permanente</span>
                <span className="block text-xs text-neutral-500">
                  El animal queda registrado a nombre de la organización (santuario, decomiso sin
                  rehome, adopción institucional).
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm">Fecha del ingreso</span>
          <input
            name="occurredAt"
            type="date"
            defaultValue={today}
            className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Condición al ingreso</span>
          <textarea
            name="intakeCondition"
            rows={3}
            maxLength={500}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            placeholder="Estado nutricional, lesiones, enfermedades aparentes…"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Jurisdicción / lugar de rescate</span>
          <input
            name="rescueJurisdiction"
            maxLength={200}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            placeholder="Ej: Mataderos, CABA"
          />
        </label>
      </section>

      {state.error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
        >
          {isPending ? "Registrando…" : "Registrar ingreso"}
        </button>
      </div>
    </form>
  );
}
