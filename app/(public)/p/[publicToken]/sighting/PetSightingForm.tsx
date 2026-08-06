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
import { useActionState, useState } from "react";

import { LocationFields } from "@/components/LocationFields";
import { DateInputAr } from "@/components/ui/DateInputAr";
import { TimeInputAr } from "@/components/ui/TimeInputAr";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import { nowLocalDatetimeInAr, sightedWhenQuestion } from "@/lib/utils/format";

import { type SightingActionState, reportPetSightingAction } from "@/app/actions/pet-sighting";

const initialState: SightingActionState = { ok: false, error: null };

// Same visual treatment the native datetime-local carried, shared by the
// dd/mm/aaaa and HH:mm halves that replaced it.
const dateTimeFieldClass =
  "w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]";

export function PetSightingForm({
  publicToken,
  petName,
  petSex = null,
  biasProvince,
  biasLocality,
  defaultCenter = null,
}: {
  publicToken: string;
  petName: string;
  /** Pet sex ('male' | 'female' | 'unknown') — flexes "¿Cuándo la viste?". */
  petSex?: string | null;
  biasProvince: string | null;
  biasLocality: string | null;
  /** Initial map center: the pet's DISCLOSED last-known lost location
   * (publicSightingMapCenter, privacy-gated server-side) or null for the
   * neutral default. */
  defaultCenter?: { lat: number; lng: number } | null;
}) {
  const boundAction = reportPetSightingAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();

  // "¿Cuándo la viste?" is entered as two AUTHOR-OWNED fields (dd/mm/aaaa +
  // HH:mm) instead of one `<input type="datetime-local">`, whose visible text
  // follows the BROWSER's locale — a viewer on an en-US machine was offered
  // month/day order and an AM/PM clock inside es-AR copy, on the one field
  // that decides WHEN a lost pet was seen. The halves are recomposed
  // client-side into the exact "YYYY-MM-DDTHH:mm" string the server action
  // already parses (parseArDatetimeLocal), carried by a hidden `sightedAt` —
  // so the action is untouched and the wire format is byte-identical.
  //
  // Defaults still come from `nowLocalDatetimeInAr` (AR wall clock, not UTC —
  // see lib/utils/format.ts for why toISOString() would misdate this near
  // midnight in Argentina); it is simply split at the "T".
  const [defaultDate, defaultTime] = nowLocalDatetimeInAr().split("T");
  const [sightedDate, setSightedDate] = useState(defaultDate);
  const [sightedTime, setSightedTime] = useState(defaultTime);
  // `onHiddenValueChange` (not `onValueChange`) is deliberate: it MIRRORS each
  // control's hidden value, so a half-typed or impossible entry empties its half
  // here too. The commit-worthy signal would stay silent instead, leaving the
  // composed field holding the PREVIOUS date while the visible one shows an
  // error — a silently wrong sighting timestamp.
  //
  // Either half blank ⇒ submit nothing, which is exactly what an emptied
  // datetime-local did: the action falls back to "now" server-side.
  const sightedAt = sightedDate && sightedTime ? `${sightedDate}T${sightedTime}` : "";

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

  // B-2: stable id for the error paragraph so inputs can reference it via aria-describedby
  const errorId = "sighting-form-error";

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
      <input
        type="hidden"
        name="clientIdempotencyKey"
        value={idempotencyKey}
        suppressHydrationWarning
      />
      <LocationFields
        mode="l2"
        biasProvince={biasProvince}
        biasLocality={biasLocality}
        useMyLocationVariant="primary"
        allowAnonymous
        defaultCenter={defaultCenter}
      />

      <fieldset className="space-y-1">
        <legend className="block text-xs font-medium text-[var(--color-ln-ink-2)]">
          {sightedWhenQuestion(petSex)}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label
              htmlFor="sightedAtDate"
              className="block text-[11px] font-medium text-[var(--color-ln-faint)]"
            >
              Fecha
            </label>
            <DateInputAr
              id="sightedAtDate"
              name="sightedAtDate"
              defaultValue={defaultDate}
              onHiddenValueChange={setSightedDate}
              ariaDescribedBy={state.error ? errorId : undefined}
              className={dateTimeFieldClass}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="sightedAtTime"
              className="block text-[11px] font-medium text-[var(--color-ln-faint)]"
            >
              Hora (24 h)
            </label>
            <TimeInputAr
              id="sightedAtTime"
              name="sightedAtTime"
              defaultValue={defaultTime}
              onHiddenValueChange={setSightedTime}
              ariaDescribedBy={state.error ? errorId : undefined}
              className={dateTimeFieldClass}
            />
          </div>
        </div>
        {/* The single field the server action reads — recomposed from the two
            halves above into the same "YYYY-MM-DDTHH:mm" the datetime-local
            used to submit. */}
        <input type="hidden" name="sightedAt" value={sightedAt} />
      </fieldset>

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
          className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
        />
      </div>

      {/* Photo group — collapsible */}
      <details className="rounded-lg border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--color-ln-ink)]">
          ¿Le sacaste foto? (opcional)
        </summary>
        <div className="p-4 border-t border-[var(--color-ln-line)] space-y-2">
          {/* B-1: explicit label for the file input */}
          <label htmlFor="photo" className="sr-only">
            Foto de la mascota (opcional)
          </label>
          <input
            id="photo"
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
          ¿Querés que te puedan contactar? (opcional)
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
              autoComplete="name"
              maxLength={80}
              placeholder="María García"
              className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="finderContact"
              className="block text-xs font-medium text-[var(--color-ln-ink-2)]"
            >
              Teléfono o email
            </label>
            {/* UX 3.5 item 8a: combined phone-or-email field — inputMode="email"
                is the best single keyboard without forcing type=tel/email. */}
            <input
              id="finderContact"
              name="finderContact"
              type="text"
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              placeholder="11-1234-5678 o maria@ejemplo.com"
              className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            />
          </div>
          <p className="text-xs text-[var(--color-ln-faint)]">
            El dueño verá tu contacto. Si no querés, dejalo vacío.
          </p>
        </div>
      </details>

      {/* B-2: stable id so inputs above can reference it via aria-describedby */}
      {state.error && (
        <p id={errorId} className="text-xs text-[var(--color-ln-seal)]" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[var(--radius-sm)] bg-[var(--color-ln-azul)] text-white text-sm font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño/a"}
      </button>
    </form>
  );
}
