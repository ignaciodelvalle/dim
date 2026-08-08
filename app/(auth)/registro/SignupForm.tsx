"use client";

import {
  type AuthFormState,
  type IdentityFormState,
  completeIdentityAction,
  signupAction,
} from "@/app/actions/auth";
import { LocationFields } from "@/components/LocationFields";
import { LnCheckbox, LnField, LnInput, LnPasswordInput } from "@/components/ui/Field";
import { useStepFocus } from "@/lib/ui/use-step-focus";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

const initialAuthState: AuthFormState = { error: null };
const initialIdentityState: IdentityFormState = { error: null };

// Two-step inline signup per design spec §1.2.
//
// Step 1 (account): email + password + repeat password + TOS checkbox.
//   signupAction creates the auth.users row; profiles.display_name is set
//   provisionally to the email local-part by the handle_new_user trigger.
//
// Step 2 (identity): nombre + apellido (required) + DNI (optional).
//   completeIdentityAction updates profiles.display_name to the real name
//   and stores dni_hash + dni_last4 (no plaintext DNI — Wave 5 Item 25a).
//
// returnTo / intent=apply branches: both used to skip the old pet step and
// redirect after step 1. They now show step 2 (identity) first so that the
// account never ends up with only a provisional display_name. Redirect happens
// after step 2 completes.
//
// `initialStep` (2026-08-01): the page mounts this form at "identity" when the
// visitor is ALREADY authenticated but still carries the trigger's provisional
// display_name — i.e. they are resuming an abandoned signup, not starting one.
// The step used to live only in this component's useState, so it died with the
// browser tab and nothing could ever bring the user back. Now the entry step is
// decided server-side from the database on every request; the useState below
// only carries the step-1 → step-2 transition within a single visit.

export function SignupForm({
  intent,
  returnTo,
  initialStep = "account",
}: {
  intent: "apply" | null;
  returnTo: string | null;
  /** Server-decided entry point. "identity" means "resume an abandoned signup". */
  initialStep?: "account" | "identity";
}) {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "identity">(initialStep);
  // Resuming is a property of how the page was ENTERED, not of the current
  // step: a visitor who starts at step 1 and advances to step 2 is completing a
  // fresh signup and must still read "Paso 2 de 2".
  const resuming = initialStep === "identity";
  const [authState, authFormAction, authPending] = useActionState(signupAction, initialAuthState);
  const [identityState, identityFormAction, identityPending] = useActionState(
    completeIdentityAction,
    initialIdentityState,
  );
  // A11y fix (2026-07 audit): each step below is a full early-return (its own
  // JSX tree, not a shared shell), so only one of the two target elements is
  // ever mounted at a time — the same ref object attaches to whichever one is
  // currently rendered. See lib/ui/use-step-focus.ts.
  const stepFocusRef = useRef<HTMLDivElement>(null);
  useStepFocus(step, stepFocusRef);

  // Step 1 → step 2 transition.
  useEffect(() => {
    if (!authState.ok) return;
    setStep("identity");
  }, [authState.ok]);

  // Step 2 → redirect or /mis-mascotas.
  useEffect(() => {
    if (!identityState.ok) return;
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.replace("/mis-mascotas");
    }
  }, [identityState.ok, returnTo, router]);

  if (step === "identity") {
    return (
      <div className="space-y-5">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-[var(--color-ln-mute)]">
          {resuming ? "Último paso" : "Paso 2 de 2"}
        </p>

        <div className="space-y-2">
          <h2
            ref={stepFocusRef}
            tabIndex={-1}
            className="font-ln-serif text-title font-semibold tracking-[-0.01em] text-[var(--color-ln-ink)] focus:outline-none"
          >
            Contanos quién sos
          </h2>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            {resuming
              ? "Ahora figurás con la primera parte de tu correo. Tu nombre real es lo que va a aparecer en la credencial de tu mascota."
              : "Tu nombre aparecerá en tu perfil y en las comunicaciones de miMAR."}
          </p>
        </div>

        <form action={identityFormAction} className="space-y-4">
          <LnField label="Nombre" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="firstName"
                type="text"
                autoComplete="given-name"
                required
                aria-describedby={describedBy}
                invalid={invalid}
                // Uncontrolled (DOM-owned). React 19 auto-resets this form once
                // completeIdentityAction resolves; on a validation error (no
                // redirect) the reset would wipe the typed name. The action
                // echoes it back in state so the reset lands on it instead
                // (mirrors the login email fix, bug #46).
                defaultValue={identityState.firstName ?? ""}
              />
            )}
          </LnField>
          <LnField label="Apellido" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="lastName"
                type="text"
                autoComplete="family-name"
                required
                aria-describedby={describedBy}
                invalid={invalid}
                defaultValue={identityState.lastName ?? ""}
              />
            )}
          </LnField>
          <LnField label="DNI" hint="Podés agregarlo después desde tu cuenta.">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="dni"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 34567890"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>

          <div className="space-y-1.5">
            {/* allowAnonymous: signup runs before a session exists, so the
                locality autocomplete must use the no-auth public search action
                (the default auth-gated one redirects to /login on first keystroke). */}
            <LocationFields mode="l1" l1Label="Localidad (opcional)" allowAnonymous cascade />
            <p className="text-xs text-[var(--color-ln-mute)]">
              Ayuda a las campañas regionales de salud animal.
            </p>
          </div>

          {identityState.error && (
            <p className="text-sm text-[var(--color-ln-err)]" role="alert">
              {identityState.error}
            </p>
          )}

          <button
            type="submit"
            disabled={identityPending}
            className="w-full px-4 py-3 rounded-[var(--radius-pill)] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {identityPending
              ? resuming
                ? "Guardando..."
                : "Creando cuenta..."
              : resuming
                ? "Guardar mi nombre"
                : "Crear cuenta"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Step 1 is only ever reached on initial mount (no "back" from step 2),
          so useStepFocus's mount-skip means this ref never actually fires
          today — kept for symmetry with step 2 and in case a future "back"
          affordance is added. */}
      <p
        ref={stepFocusRef}
        tabIndex={-1}
        className="text-xs uppercase tracking-[0.3em] text-[var(--color-ln-mute)] text-center focus:outline-none"
      >
        Paso 1 de 2
      </p>

      {/* Email/password form is FIRST in DOM — correct tab order and screen-reader flow.
          The Mi Argentina stub renders below (visually and in DOM). */}
      <div className="flex flex-col gap-5">
        <form action={authFormAction} className="space-y-4">
          <LnField label="Correo electrónico" required error={authState.error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-describedby={describedBy}
                invalid={invalid}
                // Uncontrolled (DOM-owned) — same fix as LoginForm (bug #46).
                // React 19 auto-resets this form once signupAction resolves; a
                // validation error (no redirect) would otherwise wipe the typed
                // email. signupAction echoes it back in state so the reset
                // lands on the typed value instead of clearing it.
                defaultValue={authState.email ?? ""}
              />
            )}
          </LnField>
          <LnField label="Contraseña" required hint="Mínimo 8 caracteres.">
            {({ id, describedBy, invalid }) => (
              <LnPasswordInput
                id={id}
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Repetir contraseña" required>
            {({ id, describedBy, invalid }) => (
              <LnPasswordInput
                id={id}
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                required
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>

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

          <button
            type="submit"
            disabled={authPending}
            className="w-full px-4 py-3 rounded-[var(--radius-pill)] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {authPending ? "Procesando..." : "Continuar"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
          <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
          <span>o</span>
          <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
        </div>

        {/* Mi Argentina stub — after the form in DOM (and visually) */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          tabIndex={-1}
          title="Próximamente: integración con Mi Argentina"
          className="w-full px-4 py-3 rounded-[var(--radius-pill)] border border-[var(--color-ln-line-strong)] text-sm text-[var(--color-ln-mute)] cursor-not-allowed"
        >
          Conectar con Mi Argentina (próximamente)
        </button>
      </div>
    </div>
  );
}
