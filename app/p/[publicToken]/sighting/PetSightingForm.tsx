"use client";

// Short anonymous form: pick a point on the map, optional description,
// optional sighted-at timestamp (defaults to now). Anyone can submit; the
// server action rate-limits + emits a note_added event + notifies the owner.
//
// P0d additions:
//   - Collapsible photo group (optional file upload, image/*, 5 MB limit)
//   - Collapsible contact group (finderName + finderContact)
//   - a11y/contrast fixes: submit button text-black, back link bumped up

import Link from "next/link";
import { useActionState } from "react";

import { LocationFields } from "@/components/LocationFields";

import { type SightingActionState, reportPetSightingAction } from "@/app/actions/pet-sighting";

const initialState: SightingActionState = { ok: false, error: null };

export function PetSightingForm({
  publicToken,
  petName,
  biasProvince,
  biasLocality,
}: {
  publicToken: string;
  petName: string;
  biasProvince: string | null;
  biasLocality: string | null;
}) {
  const boundAction = reportPetSightingAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (state.ok) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-gob-success bg-gob-success/10 p-4 text-sm text-gob-success">
          <p className="font-medium">¡Gracias!</p>
          <p className="mt-1 text-xs">
            Le avisamos al dueño/a con el punto que marcaste. Cualquier detalle más puede ayudar.
          </p>
          {state.warning && <p className="mt-2 text-xs text-gob-warning-text">{state.warning}</p>}
        </div>
        <Link
          href={`/p/${publicToken}`}
          className="block text-center text-sm font-medium text-gob-azul-link underline underline-offset-4"
        >
          Volver al perfil de {petName}
        </Link>
      </div>
    );
  }

  const todayLocalIso = new Date().toISOString().slice(0, 16);

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
      <LocationFields
        mode="l2"
        biasProvince={biasProvince}
        biasLocality={biasLocality}
        useMyLocationVariant="primary"
        allowAnonymous
      />

      <div className="space-y-1">
        <label htmlFor="sightedAt" className="block text-xs font-medium text-gob-text">
          ¿Cuándo la viste?
        </label>
        <input
          id="sightedAt"
          name="sightedAt"
          type="datetime-local"
          defaultValue={todayLocalIso}
          className="w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="description" className="block text-xs font-medium text-gob-text">
          Algún detalle (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="Color del collar, dirección de paso, hora exacta, comportamiento…"
          className="w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
        />
      </div>

      {/* Photo group — collapsible */}
      <details className="rounded-lg border border-gob-border bg-gob-surface-alt">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gob-text">
          📷 ¿Le sacaste foto? (opcional)
        </summary>
        <div className="p-4 border-t border-gob-border space-y-2">
          <input
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            className="w-full text-sm text-gob-text"
          />
          <p className="text-xs text-gob-text-muted">
            JPG/PNG hasta 5MB. Ayuda muchísimo al dueño a confirmar.
          </p>
        </div>
      </details>

      {/* Contact group — collapsible */}
      <details className="rounded-lg border border-gob-border bg-gob-surface-alt">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gob-text">
          📞 ¿Querés que te puedan contactar? (opcional)
        </summary>
        <div className="p-4 border-t border-gob-border space-y-3">
          <div className="space-y-1">
            <label htmlFor="finderName" className="block text-xs font-medium text-gob-text">
              Tu nombre
            </label>
            <input
              id="finderName"
              name="finderName"
              type="text"
              maxLength={80}
              placeholder="María García"
              className="w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="finderContact" className="block text-xs font-medium text-gob-text">
              Teléfono o email
            </label>
            <input
              id="finderContact"
              name="finderContact"
              type="text"
              maxLength={120}
              placeholder="11-1234-5678 o maria@ejemplo.com"
              className="w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
            />
          </div>
          <p className="text-xs text-gob-text-muted">
            El dueño verá tu contacto. Si no querés, dejalo vacío.
          </p>
        </div>
      </details>

      {state.error && (
        <p className="text-xs text-gob-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-warning text-black text-sm font-medium hover:bg-gob-warning disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño/a"}
      </button>
    </form>
  );
}
