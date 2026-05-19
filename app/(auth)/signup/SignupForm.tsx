"use client";

import { type AuthFormState, signupAction } from "@/app/actions/auth";
import { createPetAction } from "@/app/actions/pets";
import { PetForm } from "@/components/PetForm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

const initialAuthState: AuthFormState = { error: null };

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

  useEffect(() => {
    if (!authState.ok) return;
    if (intent === "apply" && returnTo) {
      router.replace(returnTo);
      return;
    }
    setStep("pet");
  }, [authState.ok, intent, returnTo, router]);

  if (step === "pet") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500">
            Paso 2 de 2
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Cargá tu primera mascota
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Lo más básico: una foto, su nombre, especie y datos generales. Podés completar el resto
            después.
          </p>
        </div>

        <PetForm
          action={createPetAction}
          compact
          submitLabel="Crear mascota y entrar"
          pendingLabel="Creando…"
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

  return (
    <div className="space-y-5">
      <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500 text-center">
        {intent === "apply" ? "Paso 1 de 1" : "Paso 1 de 2"}
      </p>

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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
