"use client";

import {
  type AuthFormState,
  type IdentityFormState,
  completeIdentityAction,
  signupAction,
} from "@/app/actions/auth";
import { LnCheckbox, LnInput } from "@/components/ui/Field";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

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
//   and stores dni_number unverified if provided.
//
// returnTo / intent=apply branches: both used to skip the old pet step and
// redirect after step 1. They now show step 2 (identity) first so that the
// account never ends up with only a provisional display_name. Redirect happens
// after step 2 completes.

export function SignupForm({
  intent,
  returnTo,
}: {
  intent: "apply" | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "identity">("account");
  const [authState, authFormAction, authPending] = useActionState(signupAction, initialAuthState);
  const [identityState, identityFormAction, identityPending] = useActionState(
    completeIdentityAction,
    initialIdentityState,
  );

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
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-[var(--color-ln-mute)]">
          Paso 2 de 2
        </p>

        <div className="space-y-2">
          <h2 className="font-[var(--font-ln-serif)] text-[22px] font-semibold tracking-[-0.01em] text-[var(--color-ln-ink)]">
            Contanos quién sos
          </h2>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            Tu nombre aparecerá en tu perfil y en las comunicaciones de MiMAR.
          </p>
        </div>

        <form action={identityFormAction} className="space-y-4">
          <Field
            id="firstName"
            name="firstName"
            type="text"
            label="Nombre"
            autoComplete="given-name"
            required
          />
          <Field
            id="lastName"
            name="lastName"
            type="text"
            label="Apellido"
            autoComplete="family-name"
            required
          />
          <Field
            id="dni"
            name="dni"
            type="text"
            inputMode="numeric"
            label="DNI"
            autoComplete="off"
            hint="Podés agregarlo después desde tu cuenta."
            placeholder="Ej: 34567890"
          />

          {identityState.error && (
            <p className="text-sm text-[var(--color-ln-err)]" role="alert">
              {identityState.error}
            </p>
          )}

          <button
            type="submit"
            disabled={identityPending}
            className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {identityPending ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-ln-mute)] text-center">
        Paso 1 de 2
      </p>

      {/* Email/password form comes first in DOM for correct tab order and screen-reader flow.
          The Mi Argentina stub follows visually via flex-direction: column-reverse so it
          renders above the divider, but tab focus hits email first. */}
      <div className="flex flex-col-reverse gap-5">
        {/* Mi Argentina stub — last in DOM so tab order: email → password → ... → submit → stub */}
        <button
          type="button"
          disabled
          tabIndex={-1}
          title="Próximamente: integración con Mi Argentina"
          className="w-full px-4 py-3 rounded-[3px] border border-[var(--color-ln-line-strong)] text-sm text-[var(--color-ln-mute)] cursor-not-allowed"
        >
          Conectar con Mi Argentina (próximamente)
        </button>

        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
            <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
            <span>o</span>
            <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
          </div>

          <form action={authFormAction} className="space-y-4">
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
              {authPending ? "Procesando..." : "Continuar"}
            </button>
          </form>
        </div>
      </div>
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
  inputMode,
  placeholder,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
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
        inputMode={inputMode}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-[var(--color-ln-mute)]">{hint}</p>}
    </div>
  );
}
