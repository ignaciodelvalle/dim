"use client";

// The web's code step of password recovery (PO decision 2026-09-13: ONE method,
// the six-digit code, on both surfaces). Mirrors the phone's `RecuperarScreen`
// redeem step, minus the password fields: on the web the code buys a recovery
// session and `/recuperar/actualizar` — unchanged — sets the new password.
//
// WHY THE CODE IS REDEEMED FROM THE BROWSER AND NOT FROM A SERVER ACTION
// ---------------------------------------------------------------------------
// It used to be a server action, and that is exactly what broke. GoTrue's
// `token_verifications` ceiling is keyed PER IP ADDRESS (supabase/config.toml,
// `[auth.rate_limit]`: 30 per 5 minutes). Every web redemption reached GoTrue
// from the deployment's ONE egress address, so that per-IP ceiling stopped
// bounding a caller and became a single pool shared by every web user in the
// country — one burst and nobody could redeem a code for five minutes.
//
// Redeeming here, from the browser, is the structural fix rather than a bigger
// number: GoTrue then keys the ceiling on the real person's address, exactly as
// it already does for the phone (`resetPasswordWithCode`,
// apps/mobile/src/auth/session-store.ts). The shared pool does not need to be
// managed because it no longer exists.
//
// `createClient()` here is `createBrowserClient` from `@supabase/ssr`, which
// writes the auth cookies to `document.cookie`. That is the load-bearing detail:
// a successful `verifyOtp` leaves the recovery session in the SAME cookie jar
// the server reads through `@/lib/supabase/server`, so `/recuperar/actualizar`
// and `updatePasswordAction` see it on the next request without any change.
//
// WHAT WENT AWAY WITH THE SERVER ACTION, AND WHY THAT IS NOT A REGRESSION
// ---------------------------------------------------------------------------
// The verify-side per-IP and per-email rate-limit buckets are gone, and a reader
// arriving here will reasonably suspect protection was deleted. It was not,
// because those buckets never bounded an attacker: the anon key is PUBLIC — it
// ships in this very bundle, and the phone already redeems with it — so
// `/auth/v1/verify` was always reachable directly. Somebody brute-forcing a
// victim's six-digit code never had to come through our form, so our per-email
// bucket only ever bounded people who did. The real and only bound on brute
// force is GoTrue's own per-IP ceiling, and this change makes that ceiling
// per-attacker instead of per-deployment. We gave up a bucket that bounded
// nobody and removed a denial of service that bounded everybody.
//
// WHAT A REFUSAL MAY NEVER SAY: whether the address has an account. GoTrue
// answers a wrong code, an expired code, a spent code and a code for an address
// with no account with the SAME error, so there is no honest way to tell them
// apart — and telling "no such account" apart would rebuild the enumeration
// oracle `requestPasswordReset` refuses to be. They share ONE sentence, the same
// one the phone shows. The other refusals (blank field, provider over its own
// limit, provider unavailable) are about the request, never the account.
//
// THE CODE IS NEVER LOGGED, never echoed back into the DOM and never put in a
// URL: it goes to `verifyOtp` and nowhere else.
//
// "Pedir otro código" stays a SERVER action, deliberately. That half is
// genuinely ours — our server is the one asking GoTrue to send mail — so it
// still spends `auth_password_reset_ip` / `auth_password_reset_email` before
// GoTrue is touched, and gets the same neutral sentence back.

import {
  type PasswordResetRequestState,
  requestPasswordResetAction,
} from "@/app/actions/password-reset";
import { LnButton } from "@/components/ui/Button";
import { LnField, LnInput } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { useActionNavigate } from "@/lib/ui/use-action-redirect";
import { type FormEvent, useActionState, useState } from "react";

const initialResendState: PasswordResetRequestState = { message: null, error: null };

/** Where a redeemed code lands. A full document navigation — see below. */
const REDEEMED_DESTINATION = "/recuperar/actualizar";

/**
 * Every sentence this step can show for a refused code. `invalid_code` is the
 * neutral one the four indistinguishable causes share; the other two are about
 * the provider, never about the account.
 */
export const RESET_CODE_MESSAGES = {
  missing_code: "Ingresá el código de 6 dígitos que te enviamos por correo.",
  rate_limited: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
  invalid_code: "El código no es válido o ya venció. Pedí uno nuevo y volvé a intentar.",
  unavailable: "No pudimos verificar el código en este momento. Probá de nuevo en unos minutos.",
} as const;

/**
 * Whitespace is removed from the code, not just trimmed: a code pasted from a
 * mail client often arrives as "123 456". Nothing else is normalized and the
 * LENGTH is not checked — GoTrue owns `otp_length`, and a client that refused a
 * seven-digit code would break the day that setting changes (the phone's
 * `CODE_LENGTH` docblock makes the same point).
 */
export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/**
 * A provider refusal that is about load or availability rather than the code.
 * Anything else — including GoTrue's `otp_expired`, which is what a wrong code,
 * an expired code, a spent code and an unknown address all produce — collapses
 * into the one neutral sentence.
 */
function messageForProviderError(error: { status?: number; code?: string }): string {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return RESET_CODE_MESSAGES.rate_limited;
  }
  if (error.status === undefined || error.status >= 500) return RESET_CODE_MESSAGES.unavailable;
  return RESET_CODE_MESSAGES.invalid_code;
}

export function ResetCodeStep({
  email,
  notice,
  onChangeEmail,
}: {
  email: string;
  notice: string;
  onChangeEmail: () => void;
}) {
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendState, resendAction, resendPending] = useActionState(
    requestPasswordResetAction,
    initialResendState,
  );
  // NAV CONTRACT N3, imperative half: `useActionNavigate` performs a FULL
  // document navigation, which is what makes the next page render on the server
  // with the cookies `verifyOtp` just wrote. A client-side router push would
  // reuse the RSC payload this document already has and reach
  // `/recuperar/actualizar` without them. `navigating` never comes back down,
  // so the button stays in its loading state until the document leaves.
  const [navigate, navigating] = useActionNavigate();

  async function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    // The browser must NOT post this form: there is no longer a server action
    // behind it, and a native post would put the code in a request we do not
    // handle. JavaScript is required for this step by design (PO 2026-09-15) —
    // the redemption has to happen from the person's own IP to be worth doing.
    event.preventDefault();
    const code = normalizeRecoveryCode(String(new FormData(event.currentTarget).get("code") ?? ""));
    if (!code) {
      setCodeError(RESET_CODE_MESSAGES.missing_code);
      return;
    }

    setCodeError(null);
    setVerifying(true);

    let answer: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["verifyOtp"]>>;
    try {
      answer = await createClient().auth.verifyOtp({ email, token: code, type: "recovery" });
    } catch {
      // auth-js rethrows anything that is not an AuthError (a network failure, a
      // cookie write that threw). Nothing about the code or the account.
      setVerifying(false);
      setCodeError(RESET_CODE_MESSAGES.unavailable);
      return;
    }

    if (answer.error) {
      setVerifying(false);
      setCodeError(messageForProviderError(answer.error));
      return;
    }
    // No error and no session is not a success: there is nothing for
    // `/recuperar/actualizar` to read. Same sentence as a refused code.
    if (!answer.data.session) {
      setVerifying(false);
      setCodeError(RESET_CODE_MESSAGES.invalid_code);
      return;
    }

    // Deliberately NOT clearing `verifying`: the document is on its way out and
    // a button that came back to life over the old page invites a second tap.
    navigate(REDEEMED_DESTINATION);
  }

  return (
    <ResetCodeStepView
      email={email}
      notice={resendState.message ?? notice}
      codeError={codeError}
      onSubmitCode={onSubmitCode}
      codePending={verifying || navigating}
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
  codeError,
  onSubmitCode,
  codePending,
  resendError,
  resendAction,
  resendPending,
  onChangeEmail,
}: {
  email: string;
  notice: string;
  codeError: string | null;
  onSubmitCode: (event: FormEvent<HTMLFormElement>) => void;
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

      <form onSubmit={onSubmitCode} className="space-y-4">
        <LnField
          label="Código"
          required
          hint="El código de 6 dígitos que te llegó por correo."
          error={codeError ?? undefined}
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
