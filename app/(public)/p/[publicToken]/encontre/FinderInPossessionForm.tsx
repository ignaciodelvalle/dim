"use client";

// Heavy finder form: "I physically have the pet, come get it."
// Sibling of PetSightingForm — that one is for "I saw it from afar" (no custody).
// This form captures contact, current location (L1), condition, availability, and
// an optional current photo.
//
// Client-side validation: name + (phone OR email) required before submit.
// Prefill: when the user is logged in, props contain prefill values and loggedIn=true;
// a banner prompts them to sign out if they're not the finder.

import Link from "next/link";
import { useActionState, useState } from "react";

import { logoutAndReturnAction } from "@/app/actions/auth";
import { LocationFields } from "@/components/LocationFields";

import { type FinderInPossessionState, reportFinderInPossessionAction } from "./action";

const initialState: FinderInPossessionState = { ok: false, error: null };

const PET_CONDITIONS: Array<{ value: string; label: string; urgent?: boolean }> = [
  { value: "bien", label: "Bien" },
  { value: "herida", label: "Herida o lastimada" },
  { value: "asustada", label: "Asustada o agitada" },
  { value: "necesita_vet_urgente", label: "Necesita veterinario urgente", urgent: true },
];

export function FinderInPossessionForm({
  publicToken,
  petName,
  biasProvince,
  biasLocality,
  prefill,
  loggedIn,
}: {
  publicToken: string;
  petName: string;
  biasProvince: string | null;
  biasLocality: string | null;
  prefill?: {
    name?: string;
    phone?: string;
    email?: string;
    displayName?: string;
  };
  loggedIn?: boolean;
}) {
  const boundAction = reportFinderInPossessionAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  // Client-side contact validation state.
  const [clientError, setClientError] = useState<string | null>(null);
  const [canKeepIndefinite, setCanKeepIndefinite] = useState(false);

  // B-2: stable id for the error paragraph so required inputs can reference it
  const errorId = "finder-possession-form-error";

  // Controlled field state — preserves typed input on validation error.
  const [finderName, setFinderName] = useState(prefill?.name ?? "");
  const [finderPhone, setFinderPhone] = useState(prefill?.phone ?? "");
  const [finderEmail, setFinderEmail] = useState(prefill?.email ?? "");
  const [canKeepUntil, setCanKeepUntil] = useState("");
  const [message, setMessage] = useState("");

  if (state.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] p-4 text-sm text-[var(--color-ln-ok)]">
          <p className="font-medium">¡Gracias!</p>
          <p className="mt-1 text-xs">
            Le avisamos al dueño/a con urgencia. Vas a recibir noticias pronto.
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

  const inputClass =
    "w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink)] text-sm outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]";
  const labelClass = "block text-sm font-medium text-[var(--color-ln-ink-2)]";
  const requiredMark = <span className="text-[var(--color-ln-seal)] ml-0.5">*</span>;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const phone = finderPhone.trim();
    const email = finderEmail.trim();
    if (!phone && !email) {
      e.preventDefault();
      setClientError("Dejá al menos un medio de contacto (teléfono o email).");
      return;
    }
    if (!canKeepIndefinite && !canKeepUntil.trim()) {
      e.preventDefault();
      setClientError(
        "Indicá hasta cuándo podés cuidarla o marcá que podés tenerla indefinidamente.",
      );
      return;
    }
    setClientError(null);
  }

  return (
    <>
      {/* Logged-in banner — rendered outside the main form: forms cannot nest,
          and the main form's onSubmit validation would block the logout submit. */}
      {loggedIn && prefill?.displayName && (
        <div className="mb-5 rounded-lg border border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] px-4 py-3 text-sm text-[var(--color-ln-azul)]">
          Completamos el formulario con tus datos,{" "}
          <span className="font-medium">{prefill.displayName}</span>. El aviso no queda vinculado a
          tu cuenta: el dueño solo ve lo que escribas acá.{" "}
          <form
            action={logoutAndReturnAction.bind(null, `/p/${publicToken}/encontre`)}
            className="inline"
          >
            <button
              type="submit"
              className="underline underline-offset-4 hover:opacity-80 bg-transparent border-0 p-0 text-inherit text-sm cursor-pointer"
            >
              ¿No sos vos? Salí de la sesión.
            </button>
          </form>
        </div>
      )}

      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="space-y-5"
        encType="multipart/form-data"
      >
        {/* Finder name */}
        <div className="space-y-1.5">
          <label htmlFor="finderName" className={labelClass}>
            Tu nombre{requiredMark}
          </label>
          <input
            id="finderName"
            name="finderName"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            value={finderName}
            onChange={(e) => setFinderName(e.target.value)}
            placeholder="Nombre y apellido"
            aria-describedby={(clientError ?? state.error) ? errorId : undefined}
            className={inputClass}
          />
        </div>

        {/* Contact: phone (tel) + email — at least one required */}
        <fieldset className="space-y-3">
          <legend className={`${labelClass} mb-1`}>
            Contacto{requiredMark}{" "}
            <span className="font-normal text-[var(--color-ln-faint)] text-xs">(al menos uno)</span>
          </legend>
          <div className="space-y-1.5">
            <label
              htmlFor="finderPhone"
              className="block text-xs font-medium text-[var(--color-ln-mute)]"
            >
              Teléfono
            </label>
            <input
              id="finderPhone"
              name="finderPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              value={finderPhone}
              onChange={(e) => setFinderPhone(e.target.value)}
              placeholder="11-1234-5678"
              aria-describedby={(clientError ?? state.error) ? errorId : undefined}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="finderEmail"
              className="block text-xs font-medium text-[var(--color-ln-mute)]"
            >
              Email
            </label>
            <input
              id="finderEmail"
              name="finderEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              value={finderEmail}
              onChange={(e) => setFinderEmail(e.target.value)}
              placeholder="vos@ejemplo.com"
              aria-describedby={(clientError ?? state.error) ? errorId : undefined}
              className={inputClass}
            />
          </div>
        </fieldset>

        {/* Current location — exact point (L2). A finder in possession needs to
            tell the owner WHERE to pick the pet up; a pin is far more useful than
            a locality. Mirrors the sighting flow. */}
        <div className="space-y-1.5">
          <p className={labelClass}>¿Dónde la tenés ahora?{requiredMark}</p>
          <p className="text-xs text-[var(--color-ln-faint)]">
            Marcá el punto exacto en el mapa así el dueño/a sabe dónde encontrarte.
          </p>
          <LocationFields
            mode="l2"
            biasProvince={biasProvince}
            biasLocality={biasLocality}
            useMyLocationVariant="primary"
            allowAnonymous
          />
        </div>

        {/* Pet condition */}
        <fieldset className="space-y-2">
          <legend className={`${labelClass} mb-1`}>¿Cómo está la mascota?{requiredMark}</legend>
          {PET_CONDITIONS.map(({ value, label, urgent }) => (
            <label
              key={value}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                urgent
                  ? "border-[var(--color-ln-seal)] bg-[var(--color-ln-err-050)] text-[var(--color-ln-seal)] font-medium hover:bg-[var(--color-ln-err-100)]"
                  : "border-[var(--color-ln-line)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)]"
              }`}
            >
              <input
                type="radio"
                name="petCondition"
                value={value}
                required
                className="accent-[var(--color-ln-azul)]"
              />
              {label}
            </label>
          ))}
        </fieldset>

        {/* Availability */}
        <fieldset className="space-y-3">
          <legend className={`${labelClass} mb-1`}>
            ¿Hasta cuándo podés cuidarla?{requiredMark}
          </legend>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ln-ink)] cursor-pointer">
            <input
              type="checkbox"
              name="canKeepIndefiniteToggle"
              className="accent-[var(--color-ln-azul)]"
              checked={canKeepIndefinite}
              onChange={(e) => setCanKeepIndefinite(e.target.checked)}
            />
            <input type="hidden" name="canKeepIndefinite" value={String(canKeepIndefinite)} />
            Puedo tenerla indefinidamente
          </label>
          {!canKeepIndefinite && (
            <div className="space-y-1.5">
              <label
                htmlFor="canKeepUntil"
                className="block text-xs font-medium text-[var(--color-ln-mute)]"
              >
                Hasta cuándo (fecha y hora)
              </label>
              <input
                id="canKeepUntil"
                name="canKeepUntil"
                type="datetime-local"
                value={canKeepUntil}
                onChange={(e) => setCanKeepUntil(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </fieldset>

        {/* Optional message */}
        <div className="space-y-1.5">
          <label htmlFor="message" className={labelClass}>
            Algo más que quieras decirle al dueño{" "}
            <span className="font-normal text-[var(--color-ln-faint)] text-xs">(opcional)</span>
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Lugar donde la encontraste, collar, comportamiento…"
            className={inputClass}
          />
        </div>

        {/* Optional current photo */}
        <details className="rounded-lg border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--color-ln-ink)]">
            📷 ¿Le sacás una foto ahora para confirmar? (opcional)
          </summary>
          <div className="p-4 border-t border-[var(--color-ln-line)] space-y-2">
            {/* B-1: explicit label for the file input */}
            <label htmlFor="photoNow" className="sr-only">
              Foto actual de la mascota (opcional)
            </label>
            <input
              id="photoNow"
              type="file"
              name="photoNow"
              accept="image/*"
              capture="environment"
              className="w-full text-sm text-[var(--color-ln-ink)]"
            />
            <p className="text-xs text-[var(--color-ln-faint)]">
              JPG/PNG hasta 5 MB. Ayuda al dueño/a a confirmar que es su mascota.
            </p>
          </div>
        </details>

        {/* B-2: stable id so required inputs above can reference via aria-describedby */}
        {(clientError ?? state.error) && (
          <p id={errorId} className="text-xs text-[var(--color-ln-seal)]" role="alert">
            {clientError ?? state.error}
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
    </>
  );
}
