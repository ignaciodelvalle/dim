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
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

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
  const { key: idempotencyKey } = useIdempotencyKey();

  if (state.ok) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] p-4 text-sm text-[var(--color-ln-ok)]">
          <p className="font-medium">¡Gracias!</p>
          <p className="mt-1 text-xs">
            Le avisamos al dueño/a con el punto que marcaste. Cualquier detalle más puede ayudar.
          </p>
          {state.warning && (
            <p className="mt-2 text-xs text-[var(--color-ln-warn)]">{state.warning}</p>
          )}
        </div>
        <Link
          href={`/p/${publicToken}`}
          className="block text-center text-sm font-medium text-[var(--color-ln-azul)] underline underline-offset-4"
        >
          Volver al perfil de {petName}
        </Link>
      </div>
    );
  }

  const todayLocalIso = new Date().toISOString().slice(0, 16);

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
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
          className="block text-xs font-medium text-[var(--color-ln-ink-2)]"
        >
          ¿Cuándo la viste?
        </label>
        <input
          id="sightedAt"
          name="sightedAt"
          type="datetime-local"
          defaultValue={todayLocalIso}
          className="w-full px-3 py-2 rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="description"
          className="block text-xs font-medium text-[var(--color-ln-ink-2)]"
        >
          Algún detalle (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="Color del collar, dirección de paso, hora exacta, comportamiento…"
          className="w-full px-3 py-2 rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
        />
      </div>

      {/* Photo group — collapsible */}
      <details className="rounded-lg border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--color-ln-ink)]">
          📷 ¿Le sacaste foto? (opcional)
        </summary>
        <div className="p-4 border-t border-[var(--color-ln-line)] space-y-2">
          <input
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            className="w-full text-sm text-[var(--color-ln-ink)]"
          />
          <p className="text-xs text-[var(--color-ln-faint)]">
            JPG/PNG hasta 5MB. Ayuda muchísimo al dueño a confirmar.
          </p>
        </div>
      </details>

      {/* Contact group — collapsible */}
      <details className="rounded-lg border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--color-ln-ink)]">
          📞 ¿Querés que te puedan contactar? (opcional)
        </summary>
        <div className="p-4 border-t border-[var(--color-ln-line)] space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="finderName"
              className="block text-xs font-medium text-[var(--color-ln-ink-2)]"
            >
              Tu nombre
            </label>
            <input
              id="finderName"
              name="finderName"
              type="text"
              maxLength={80}
              placeholder="María García"
              className="w-full px-3 py-2 rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="finderContact"
              className="block text-xs font-medium text-[var(--color-ln-ink-2)]"
            >
              Teléfono o email
            </label>
            <input
              id="finderContact"
              name="finderContact"
              type="text"
              maxLength={120}
              placeholder="11-1234-5678 o maria@ejemplo.com"
              className="w-full px-3 py-2 rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            />
          </div>
          <p className="text-xs text-[var(--color-ln-faint)]">
            El dueño verá tu contacto. Si no querés, dejalo vacío.
          </p>
        </div>
      </details>

      {state.error && (
        <p className="text-xs text-[var(--color-ln-seal)]" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[4px] bg-[var(--color-ln-azul)] text-white text-sm font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño/a"}
      </button>
    </form>
  );
}
