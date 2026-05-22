"use client";

import { type PetDraft, clearPetDraft, readPetDraft } from "@/app/_components/PetDraftForm";
import { type AuthFormState, signupAction } from "@/app/actions/auth";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useActionState, useEffect, useRef, useState } from "react";

const initialAuthState: AuthFormState = { error: null };

// es-AR species labels for the "Vamos a guardar a {nombre}, tu {especie}" banner.
const SPECIES_LABELS: Record<string, string> = {
  dog: "perro",
  cat: "gato",
  other: "mascota",
};

// Single-step signup. signupAction handles pet auto-create server-side to
// avoid the client useEffect race where page.tsx would redirect to
// /mis-mascotas before the effect could fire createPetAction.
//
// Draft fields are sent as hidden inputs inside the same <form> so the
// server action receives them alongside email/password and can insert the
// pet within the same request, before redirecting.
//
// Adoption-apply branch (spec adoption-listing-public §8.3): when intent=apply,
// signupAction skips pet creation and redirects to returnTo instead.

export function SignupForm({
  intent,
  returnTo,
}: {
  intent: "apply" | null;
  returnTo: string | null;
}) {
  const [authState, authFormAction, authPending] = useActionState(signupAction, initialAuthState);

  // Landing-page pet draft, if any. Read once on mount so the banner sees the
  // correct snapshot. Cleared the moment the user submits to avoid stale data
  // on retry if the action returns an error.
  const [petDraft, setPetDraft] = useState<PetDraft | null>(null);
  // Captured once at mount — true if the user came from the landing draft.
  // Ref so it stays stable even after setPetDraft(null).
  const hasDraftAtMount = useRef(false);

  useEffect(() => {
    const draft = readPetDraft();
    setPetDraft(draft);
    hasDraftAtMount.current = !!draft?.name.trim();
  }, []);

  // Clear localStorage draft the moment the form submits (authPending flips to
  // true). The hidden inputs carry the values to the server action, so the
  // localStorage copy is no longer needed.
  useEffect(() => {
    if (authPending) clearPetDraft();
  }, [authPending]);

  const draftHasContent = !!petDraft?.name.trim();
  const draftSpeciesLabel = petDraft ? (SPECIES_LABELS[petDraft.species] ?? "mascota") : null;

  const stepLabel =
    intent === "apply" ? "Paso 1 de 1" : hasDraftAtMount.current ? "Paso 2 de 2" : "Paso 1 de 1";

  return (
    <div className="space-y-5">
      <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500 text-center">
        {stepLabel}
      </p>

      {draftHasContent && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300">
          Vamos a guardar la credencial de{" "}
          <span className="font-semibold text-neutral-900 dark:text-neutral-50">
            {petDraft?.name}
          </span>
          {draftSpeciesLabel ? `, tu ${draftSpeciesLabel}` : ""}. Creá tu cuenta para terminar.
        </div>
      )}

      <button
        type="button"
        disabled
        title="Próximamente: integración con Mi Argentina"
        className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-500 cursor-not-allowed"
      >
        Conectar con Mi Argentina (próximamente)
      </button>

      <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-500">
        <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
        <span>o</span>
        <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
      </div>

      <form action={authFormAction} className="space-y-4">
        {/* Hidden context fields for the server action */}
        {intent && <input type="hidden" name="intent" value={intent} />}
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

        {/* Draft fields: sent to signupAction for server-side pet auto-create */}
        {petDraft && (
          <>
            <input type="hidden" name="draftName" value={petDraft.name} />
            <input type="hidden" name="draftSpecies" value={petDraft.species} />
            <input type="hidden" name="draftBreed" value={petDraft.breed ?? ""} />
          </>
        )}

        <Field
          id="displayName"
          name="displayName"
          type="text"
          label="¿Cómo te llamás?"
          autoComplete="name"
          required
        />
        <Field
          id="email"
          name="email"
          type="email"
          label="Tu correo"
          autoComplete="email"
          required
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Elegí una contraseña"
          autoComplete="new-password"
          minLength={8}
          required
          hint="Mínimo 8 caracteres."
        />

        {authState.error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {authState.error}
          </p>
        )}

        <button
          type="submit"
          disabled={authPending}
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {authPending ? "Creando cuenta..." : "Guardar y continuar"}
        </button>
      </form>
    </div>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
  required,
  minLength,
  hint,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className={inputClass}
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
