"use client";

// Short anonymous form: pick a point on the map, optional description,
// optional sighted-at timestamp (defaults to now). Anyone can submit; the
// server action rate-limits + emits a note_added event + notifies the owner.

import { useActionState } from "react";

import { LocationFields } from "@/components/LocationFields";

import { type SightingActionState, reportPetSightingAction } from "@/app/actions/pet-sighting";

const initialState: SightingActionState = { ok: false, error: null };

export function PetSightingForm({
  publicToken,
  biasProvince,
  biasLocality,
}: {
  publicToken: string;
  biasProvince: string | null;
  biasLocality: string | null;
}) {
  const boundAction = reportPetSightingAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-900 dark:text-emerald-200">
        <p className="font-medium">¡Gracias!</p>
        <p className="mt-1 text-xs">
          Le avisamos al dueño/a con el punto que marcaste. Cualquier detalle más puede ayudar.
        </p>
      </div>
    );
  }

  const todayLocalIso = new Date().toISOString().slice(0, 16);

  return (
    <form action={formAction} className="space-y-4">
      <LocationFields
        mode="l2"
        biasProvince={biasProvince}
        biasLocality={biasLocality}
        useMyLocationVariant="primary"
        allowAnonymous
      />

      <div className="space-y-1">
        <label
          htmlFor="sightedAt"
          className="block text-xs font-medium text-neutral-800 dark:text-neutral-200"
        >
          ¿Cuándo la viste?
        </label>
        <input
          id="sightedAt"
          name="sightedAt"
          type="datetime-local"
          defaultValue={todayLocalIso}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="description"
          className="block text-xs font-medium text-neutral-800 dark:text-neutral-200"
        >
          Algún detalle (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="Color del collar, dirección de paso, hora exacta, comportamiento…"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      {state.error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño/a"}
      </button>
    </form>
  );
}
