"use client";

import { type PetDraft, clearPetDraft, readPetDraft } from "@/app/_components/PetDraftForm";
import { type AuthFormState, signupAction } from "@/app/actions/auth";
import { createPetAction } from "@/app/actions/pets";
import { PetForm } from "@/components/PetForm";
import { inputClass, labelClass } from "@/lib/form-classes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

const initialAuthState: AuthFormState = { error: null };

// es-AR species labels for the "Vamos a guardar a {nombre}, tu {especie}" banner.
const SPECIES_LABELS: Record<string, string> = {
  dog: "perro",
  cat: "gato",
  other: "mascota",
};

// Two-step inline signup per AGENTS.md → v1 screens §Signup. Step 1 creates
// the auth user (signupAction returns { ok: true } instead of redirecting so
// we can transition on the same page without a router push). Step 2 collects
// the first pet via PetForm in compact mode. createPetAction reads the
// active Supabase session (set by signUp in step 1) and redirects to
// /mis-mascotas on success.
//
// Partial-create handling: if step 2 errors after step 1 succeeded, the
// PetForm surfaces its own error inline, and the always-visible escape
// note below the form points the (already authenticated) user to
// /mis-mascotas so they can add a pet later — no rollback needed.
//
// Adoption-apply branch (spec adoption-listing-public §8.3): when the form
// is opened with `intent=apply`, we skip step 2 entirely — a visitor who
// came here to ADOPT does not have a pet of their own to register yet.
// On step-1 success we push them straight to `returnTo` (the postular page).

export function SignupForm({
  intent,
  returnTo,
}: {
  intent: "apply" | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "pet">("account");
  const [authState, authFormAction, authPending] = useActionState(signupAction, initialAuthState);
  // Landing-page pet draft, if any. Read once on mount so the step-1 banner
  // and the step-2 PetForm pre-fill see the same snapshot. Cleared on entry
  // to step 2 — by then the data is in component state and a fresh draft
  // would just collide with what the user is about to submit.
  const [petDraft, setPetDraft] = useState<PetDraft | null>(null);
  // Captured once at mount — true if the user came from the landing draft.
  // Using a ref so it doesn't change when the draft is cleared in step 2.
  const hasDraftAtMount = useRef(false);

  useEffect(() => {
    const draft = readPetDraft();
    setPetDraft(draft);
    hasDraftAtMount.current = !!draft?.name.trim();
  }, []);

  useEffect(() => {
    if (!authState.ok) return;
    if (intent === "apply" && returnTo) {
      router.replace(returnTo);
      return;
    }
    setStep("pet");
  }, [authState.ok, intent, returnTo, router]);

  // Once we've transitioned to step 2, the draft has been threaded into
  // PetForm props — drop it from localStorage so a future revisit doesn't
  // resurrect stale data.
  useEffect(() => {
    if (step === "pet" && petDraft) {
      clearPetDraft();
    }
  }, [step, petDraft]);

  if (step === "pet") {
    const hasDraft = !!petDraft?.name.trim();
    // When the user came from a landing draft, the pet info was their step 1.
    const totalSteps = hasDraftAtMount.current ? 3 : 2;
    const petStepNumber = hasDraftAtMount.current ? 3 : 2;
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500">
            Paso {petStepNumber} de {totalSteps}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {hasDraft
              ? `Terminemos la credencial de ${petDraft?.name}`
              : "Cargá tu primera mascota"}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {hasDraft
              ? "Ya tomamos los datos que cargaste. Sumá una foto y revisá lo demás — podés completar el resto después."
              : "Lo más básico: una foto, su nombre, especie y datos generales. Podés completar el resto después."}
          </p>
        </div>

        <PetForm
          action={createPetAction}
          compact
          submitLabel="Crear mascota y entrar"
          pendingLabel="Creando…"
          draftValues={
            petDraft
              ? {
                  name: petDraft.name,
                  // Empty / "other" stays empty so the user picks a concrete
                  // species (or sub-species) themselves.
                  species:
                    petDraft.species === "dog" || petDraft.species === "cat"
                      ? petDraft.species
                      : undefined,
                  breed: petDraft.breed || undefined,
                }
              : undefined
          }
        />

        <p className="text-center text-xs text-neutral-500 dark:text-neutral-500">
          Tu cuenta ya está creada. Podés{" "}
          <Link
            href="/mis-mascotas"
            className="font-medium text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            cargar tu mascota después desde Mis mascotas
          </Link>{" "}
          si preferís.
        </p>
      </div>
    );
  }

  const draftHasContent = !!petDraft?.name.trim();
  const draftSpeciesLabel = petDraft ? (SPECIES_LABELS[petDraft.species] ?? "mascota") : null;

  return (
    <div className="space-y-5">
      <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500 text-center">
        {intent === "apply"
          ? "Paso 1 de 1"
          : hasDraftAtMount.current
            ? "Paso 2 de 3"
            : "Paso 1 de 2"}
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
        <Field
          id="displayName"
          name="displayName"
          type="text"
          label="Nombre"
          autoComplete="name"
          required
        />
        <Field
          id="email"
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          required
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Contraseña"
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
          {authPending ? "Creando cuenta..." : "Continuar"}
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
