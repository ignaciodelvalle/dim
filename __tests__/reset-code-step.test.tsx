// ResetCodeStepView — the web's six-digit recovery code step (PO decision
// 2026-09-13: ONE method, the code, on both surfaces).
//
// Pattern: renderToStaticMarkup against the presentational view, like
// login-form.test.tsx — no React-hook mocking needed. The server half (wrong
// code, expired code, rate limits, redirect) is pinned in password-reset.test.ts;
// these tests pin what the page SHOWS for each of those answers, and the
// structure the progressive-enhancement contract depends on.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The view only needs types from the actions module; importing it at runtime
// would pull the whole server graph into the test.
vi.mock("@/app/actions/password-reset", () => ({ requestPasswordResetAction: vi.fn() }));
vi.mock("@/src/modules/auth/actions", () => ({ verifyPasswordResetCodeAction: vi.fn() }));

import { ResetCodeStepView } from "@/app/(auth)/recuperar/ResetCodeStep";

const NOTICE =
  "Si existe una cuenta con ese correo, te enviamos un código de 6 dígitos. Revisá también tu carpeta de spam.";
const noop = () => {};

function render(overrides: Partial<Parameters<typeof ResetCodeStepView>[0]> = {}) {
  return renderToStaticMarkup(
    <ResetCodeStepView
      email="ana@mimar.ar"
      notice={NOTICE}
      codeState={{ error: null }}
      codeAction={noop}
      codePending={false}
      resendError={null}
      resendAction={noop}
      resendPending={false}
      onChangeEmail={noop}
      {...overrides}
    />,
  );
}

/** The markup of the first <form>, i.e. the code form. */
function codeForm(html: string): string {
  const start = html.indexOf("<form");
  return html.slice(start, html.indexOf("</form>", start));
}

describe("ResetCodeStepView", () => {
  it("renders the neutral notice and a code field with a submit INSIDE the code form", () => {
    const html = render();
    expect(html).toContain(NOTICE);
    const form = codeForm(html);
    expect(form).toContain('name="code"');
    expect(form).toContain('autoComplete="one-time-code"');
    expect(form).toContain('inputMode="numeric"');
    expect(form).toContain('type="submit"');
    expect(form).toContain("Verificar código");
    // The address travels with the code — verifyOtp needs both.
    expect(form).toContain('type="hidden" name="email" value="ana@mimar.ar"');
  });

  it("never caps the code length (GoTrue owns otp_length)", () => {
    expect(codeForm(render())).not.toMatch(/maxlength/i);
  });

  it("offers a resend that posts the same address, and a way back to change it", () => {
    const html = render();
    const second = html.slice(html.indexOf("</form>") + 1);
    expect(second).toContain('type="hidden" name="email" value="ana@mimar.ar"');
    expect(second).toContain("Pedir otro código");
    expect(html).toContain("Usar otro correo");
  });

  it("shows the invalid-or-expired sentence on the code field when the server refuses the code", () => {
    const sentence = "El código no es válido o ya venció. Pedí uno nuevo y volvé a intentar.";
    const html = render({ codeState: { error: sentence } });
    expect(html).toContain(sentence);
    expect(codeForm(html)).toContain('aria-invalid="true"');
  });

  it("shows a resend refusal (rate limit) without hiding the code field", () => {
    const html = render({
      resendError: "Demasiados intentos. Esperá un momento y volvé a probar.",
    });
    expect(html).toContain("Demasiados intentos");
    expect(html).toContain('role="alert"');
    expect(codeForm(html)).toContain('name="code"');
  });

  it("disables the submit and says so while verifying (and while navigating away)", () => {
    const html = render({ codePending: true });
    const form = codeForm(html);
    expect(form).toContain("Verificando...");
    expect(form).toContain("disabled");
  });

  it("never mentions a link — the mail carries a code", () => {
    expect(render()).not.toMatch(/enlace/i);
  });
});
