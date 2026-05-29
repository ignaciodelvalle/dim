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

import { LocationFields } from "@/components/LocationFields";

import {
  type FinderInPossessionState,
  reportFinderInPossessionAction,
} from "./action";

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

  if (state.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gob-success bg-gob-success/10 p-4 text-sm text-gob-success">
          <p className="font-medium">¡Gracias!</p>
          <p className="mt-1 text-xs">
            Le avisamos al dueño/a con urgencia. Vas a recibir noticias pronto.
          </p>
          {state.warning && (
            <p className="mt-2 text-xs text-gob-warning-text">{state.warning}</p>
          )}
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

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-gob-text text-sm focus:outline-none focus:ring-2 focus:ring-gob-primary focus:border-transparent";
  const labelClass = "block text-sm font-medium text-gob-text";
  const requiredMark = <span className="text-gob-danger ml-0.5">*</span>;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("finderPhone") ?? "").trim();
    const email = String(fd.get("finderEmail") ?? "").trim();
    if (!phone && !email) {
      e.preventDefault();
      setClientError("Dejá al menos un medio de contacto (teléfono o email).");
      return;
    }
    const keepIndefinite = String(fd.get("canKeepIndefinite") ?? "") === "true";
    const keepUntil = String(fd.get("canKeepUntil") ?? "").trim();
    if (!keepIndefinite && !keepUntil) {
      e.preventDefault();
      setClientError(
        "Indicá hasta cuándo podés cuidarla o marcá que podés tenerla indefinidamente.",
      );
      return;
    }
    setClientError(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-5"
      encType="multipart/form-data"
    >
      {/* Logged-in banner */}
      {loggedIn && prefill?.displayName && (
        <div className="rounded-lg border border-gob-primary bg-gob-primary/5 px-4 py-3 text-sm text-gob-primary">
          Estás enviando como{" "}
          <span className="font-medium">{prefill.displayName}</span>.{" "}
          <Link
            href="/api/auth/signout"
            className="underline underline-offset-4 hover:opacity-80"
          >
            ¿No sos vos? Salí de la sesión.
          </Link>
        </div>
      )}

      {/* Finder name */}
      <div className="space-y-1.5">
        <label htmlFor="finderName" className={labelClass}>
          Tu nombre{requiredMark}
        </label>
        <input
          id="finderName"
          name="finderName"
          type="text"
          required
          maxLength={80}
          defaultValue={prefill?.name ?? ""}
          placeholder="Nombre y apellido"
          className={inputClass}
        />
      </div>

      {/* Contact: phone (tel) + email — at least one required */}
      <fieldset className="space-y-3">
        <legend className={`${labelClass} mb-1`}>
          Contacto{requiredMark}{" "}
          <span className="font-normal text-gob-text-muted text-xs">(al menos uno)</span>
        </legend>
        <div className="space-y-1.5">
          <label htmlFor="finderPhone" className="block text-xs font-medium text-gob-text-gray">
            Teléfono
          </label>
          <input
            id="finderPhone"
            name="finderPhone"
            type="tel"
            maxLength={40}
            defaultValue={prefill?.phone ?? ""}
            placeholder="11-1234-5678"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="finderEmail" className="block text-xs font-medium text-gob-text-gray">
            Email
          </label>
          <input
            id="finderEmail"
            name="finderEmail"
            type="email"
            maxLength={120}
            defaultValue={prefill?.email ?? ""}
            placeholder="vos@ejemplo.com"
            className={inputClass}
          />
        </div>
      </fieldset>

      {/* Current location — L1 */}
      <div className="space-y-1.5">
        <p className={labelClass}>
          ¿Dónde la tenés ahora?{requiredMark}
        </p>
        <LocationFields
          mode="l1"
          biasProvince={biasProvince}
          biasLocality={biasLocality}
          allowAnonymous
        />
      </div>

      {/* Pet condition */}
      <fieldset className="space-y-2">
        <legend className={`${labelClass} mb-1`}>
          ¿Cómo está la mascota?{requiredMark}
        </legend>
        {PET_CONDITIONS.map(({ value, label, urgent }) => (
          <label
            key={value}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer text-sm transition-colors ${
              urgent
                ? "border-gob-danger/40 bg-gob-danger/5 text-gob-danger font-medium hover:bg-gob-danger/10"
                : "border-gob-border bg-white text-gob-text hover:bg-gob-surface-alt"
            }`}
          >
            <input
              type="radio"
              name="petCondition"
              value={value}
              required
              className="accent-gob-primary"
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
        <label className="flex items-center gap-2 text-sm text-gob-text cursor-pointer">
          <input
            type="checkbox"
            name="canKeepIndefiniteToggle"
            className="accent-gob-primary"
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
              className="block text-xs font-medium text-gob-text-gray"
            >
              Hasta cuándo (fecha y hora)
            </label>
            <input
              id="canKeepUntil"
              name="canKeepUntil"
              type="datetime-local"
              className={inputClass}
            />
          </div>
        )}
      </fieldset>

      {/* Optional message */}
      <div className="space-y-1.5">
        <label htmlFor="message" className={labelClass}>
          Algo más que quieras decirle al dueño{" "}
          <span className="font-normal text-gob-text-muted text-xs">(opcional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={500}
          placeholder="Lugar donde la encontraste, collar, comportamiento…"
          className={inputClass}
        />
      </div>

      {/* Optional current photo */}
      <details className="rounded-lg border border-gob-border bg-gob-surface-alt">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gob-text">
          📷 ¿Le sacás una foto ahora para confirmar? (opcional)
        </summary>
        <div className="p-4 border-t border-gob-border space-y-2">
          <input
            type="file"
            name="photoNow"
            accept="image/*"
            capture="environment"
            className="w-full text-sm text-gob-text"
          />
          <p className="text-xs text-gob-text-muted">
            JPG/PNG hasta 5 MB. Ayuda al dueño/a a confirmar que es su mascota.
          </p>
        </div>
      </details>

      {/* Error display */}
      {(clientError ?? state.error) && (
        <p className="text-xs text-gob-danger" role="alert">
          {clientError ?? state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-warning text-black text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño/a"}
      </button>
    </form>
  );
}
