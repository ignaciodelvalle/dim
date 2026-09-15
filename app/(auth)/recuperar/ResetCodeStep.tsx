"use client";

// The web's code step of password recovery (PO decision 2026-09-13: ONE method,
// the six-digit code, on both surfaces). Mirrors the phone's `RecuperarScreen`
// redeem step, minus the password fields: on the web the code buys a recovery
// session and `/recuperar/actualizar` — unchanged — sets the new password.
//
// WHAT THIS STEP MUST NEVER SAY: whether the address has an account. It is shown
// after EVERY accepted request, and every refused code gets one sentence from the
// server (`verifyPasswordResetCode`), because GoTrue itself cannot tell a wrong
// code from an expired one or from an address with no account.
//
// "Pedir otro código" posts the SAME request action as the first step, so a
// resend spends the same two budgets (`auth_password_reset_ip`,
// `auth_password_reset_email`) and gets the same neutral sentence back.

import {
  type PasswordResetRequestState,
  requestPasswordResetAction,
} from "@/app/actions/password-reset";
import { LnButton } from "@/components/ui/Button";
import { LnField, LnInput } from "@/components/ui/Field";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
// Imported from the module's action edge directly rather than grown into the
// `app/actions/password-reset.ts` shim, which the strangler line budget freezes.
import { verifyPasswordResetCodeAction } from "@/src/modules/auth/actions";
import type { PasswordResetCodeState } from "@/src/modules/auth/application/password-reset/types";
import { useActionState } from "react";

const initialCodeState: PasswordResetCodeState = { error: null };
const initialResendState: PasswordResetRequestState = { message: null, error: null };

export function ResetCodeStep({
  email,
  notice,
  onChangeEmail,
}: {
  email: string;
  notice: string;
  onChangeEmail: () => void;
}) {
  const [codeState, codeAction, codePending] = useActionState(
    verifyPasswordResetCodeAction,
    initialCodeState,
  );
  const [resendState, resendAction, resendPending] = useActionState(
    requestPasswordResetAction,
    initialResendState,
  );
  // N3: the action returns where to go; this performs the full document
  // navigation, so the next page is rendered with the fresh session cookies.
  const navigating = useActionRedirect(codeState.redirectTo, codeState);

  return (
    <ResetCodeStepView
      email={email}
      notice={resendState.message ?? notice}
      codeState={codeState}
      codeAction={codeAction}
      codePending={codePending || navigating}
      resendError={resendState.error}
      resendAction={resendAction}
      resendPending={resendPending}
      onChangeEmail={onChangeEmail}
    />
  );
}

/** Presentational half, split so tests can render every state without hooks. */
export function ResetCodeStepView({
  email,
  notice,
  codeState,
  codeAction,
  codePending,
  resendError,
  resendAction,
  resendPending,
  onChangeEmail,
}: {
  email: string;
  notice: string;
  codeState: PasswordResetCodeState;
  codeAction: (formData: FormData) => void;
  codePending: boolean;
  resendError: string | null;
  resendAction: (formData: FormData) => void;
  resendPending: boolean;
  onChangeEmail: () => void;
}) {
  return (
    <div className="space-y-5">
      <output className="block rounded-[var(--radius-sm)] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-4 py-3.5 text-md text-[var(--color-ln-ink)]">
        {notice}
      </output>

      <form action={codeAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <LnField
          label="Código"
          required
          hint="El código de 6 dígitos que te llegó por correo."
          error={codeState.error ?? undefined}
        >
          {({ id, describedBy, invalid }) => (
            <LnInput
              id={id}
              name="code"
              type="text"
              // `one-time-code` lets the browser offer the code straight from the
              // mail or the notification. NO maxLength: GoTrue owns otp_length,
              // and a cap here would silently truncate a longer code.
              autoComplete="one-time-code"
              inputMode="numeric"
              spellCheck={false}
              mono
              required
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </LnField>

        <LnButton type="submit" block size="lg" loading={codePending}>
          {codePending ? "Verificando..." : "Verificar código"}
        </LnButton>
      </form>

      <div className="flex flex-col items-center gap-2">
        <form action={resendAction} className="w-full">
          <input type="hidden" name="email" value={email} />
          {resendError && (
            <p role="alert" className="mb-2 text-center text-sm text-[var(--color-ln-err)]">
              {resendError}
            </p>
          )}
          <LnButton type="submit" variant="ghost" block loading={resendPending}>
            {resendPending ? "Enviando..." : "Pedir otro código"}
          </LnButton>
        </form>
        <LnButton type="button" variant="ghost" size="sm" onClick={onChangeEmail}>
          Usar otro correo
        </LnButton>
      </div>
    </div>
  );
}
