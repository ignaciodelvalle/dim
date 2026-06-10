"use client";

import { type AuthFormState, signupAction } from "@/app/actions/auth";
import { PetForm } from "@/components/PetForm";
import { LnCheckbox, LnInput } from "@/components/ui/Field";
import { createPetAction } from "@/src/modules/pets/actions";
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
//
// returnTo branch (general): when any `returnTo` is present (e.g. invite link),
// we also skip step 2 and redirect back to `returnTo` after account creation.
// safeReturnTo on the page validates the path before it reaches here, so
// open-redirect is already guarded. The default flow (no returnTo) is unchanged.

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
    // Any validated returnTo (apply-intent, invite link, etc.) takes priority over
    // the pet-creation step. safeReturnTo already rejected unsafe paths upstream.
    if (returnTo) {
      router.replace(returnTo);
      return;
    }
    setStep("pet");
  }, [authState.ok, returnTo, router]);

  if (step === "pet") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-ln-mute)]">
            Paso 2 de 2
          </p>
          <h2 className="font-[var(--font-ln-serif)] text-[22px] font-semibold tracking-[-0.01em] text-[var(--color-ln-ink)]">
            Cargá tu primera mascota
          </h2>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
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

        <p className="text-center text-xs text-[var(--color-ln-mute)]">
          Tu cuenta ya está creada. Podés{" "}
          <Link
            href="/mis-mascotas"
            className="font-medium text-[var(--color-ln-ink-2)] underline underline-offset-4 hover:text-[var(--color-ln-ink)]"
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
      <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-ln-mute)] text-center">
        {returnTo ? "Paso 1 de 1" : "Paso 1 de 2"}
      </p>

      <button
        type="button"
        disabled
        title="Próximamente: integración con Mi Argentina"
        className="w-full px-4 py-3 rounded-[3px] border border-[var(--color-ln-line-strong)] text-sm text-[var(--color-ln-mute)] cursor-not-allowed"
      >
        Conectar con Mi Argentina (próximamente)
      </button>

      <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
        <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
        <span>o</span>
        <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
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
        <Field
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label="Repetir contraseña"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <LnCheckbox id="tosAccepted" name="tosAccepted" required>
          Leí y acepto los{" "}
          <Link
            href="/terminos"
            target="_blank"
            className="font-medium text-[var(--color-ln-azul)] underline underline-offset-2"
          >
            Términos y condiciones
          </Link>{" "}
          y la{" "}
          <Link
            href="/privacidad"
            target="_blank"
            className="font-medium text-[var(--color-ln-azul)] underline underline-offset-2"
          >
            Política de privacidad
          </Link>
          .
        </LnCheckbox>

        {authState.error && (
          <p className="text-sm text-[var(--color-ln-err)]" role="alert">
            {authState.error}
          </p>
        )}

        <button
          type="submit"
          disabled={authPending}
          className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-ln-ink)]">
        {label}
      </label>
      <LnInput
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
      />
      {hint && <p className="text-xs text-[var(--color-ln-mute)]">{hint}</p>}
    </div>
  );
}
