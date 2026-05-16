"use client";

import type { EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { useActionState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function MarkLostForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="lastKnownLocation"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Última ubicación conocida
        </label>
        <input
          id="lastKnownLocation"
          name="lastKnownLocation"
          type="text"
          placeholder="Ej: Plaza Italia, esquina Cerviño"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Opcional. Aparece en la credencial pública para ayudar a quien la encuentre.
        </p>
      </div>

      {/* Map picker — drops a marker on the actual spot. Coordinates flow
          through pet_events.location_lat / location_lng so the credential
          page and future broadcast/hotspot maps can use them. */}
      <LocationFields mode="point" />

      <div className="space-y-1.5">
        <label
          htmlFor="reason"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Detalles
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          placeholder="Cualquier detalle que pueda ayudar (collar, comportamiento, hora aproximada)"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Opcional. Guardado en el historial para tu referencia.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-amber-600 dark:bg-amber-500 text-white font-medium hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Marcando..." : "Marcar como perdida"}
      </button>
    </form>
  );
}
