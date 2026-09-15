// @vitest-environment jsdom
//
// The web's six-digit recovery code step (PO decision 2026-09-13: ONE method,
// the code, on both surfaces; 2026-09-15: redeemed from the BROWSER).
//
// TWO HALVES, TESTED TWO WAYS, and the split is the point of the component's own
// split. `ResetCodeStepView` is pure presentation, so its states render to a
// STRING with no hooks at all. `ResetCodeStep` owns the redemption, and there is
// no server action left to assert against — the security properties now live in
// what this component does with `verifyOtp`, so they are exercised through a
// real submit against a mocked `@/lib/supabase/client`.
//
// The assertions that carry weight, and that would go red if the protection were
// removed rather than merely restated:
//   · a wrong code, an expired code and an unknown address produce the SAME
//     sentence — the anti-enumeration property;
//   · the typed code reaches `verifyOtp` and NOTHING else: not the DOM, not the
//     navigation, not the resend action;
//   · a resolved-but-sessionless answer is a failure, not a success;
//   · success leaves through a FULL document navigation to /recuperar/actualizar.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render as renderDom, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The resend half is still a server action; importing it for real would pull the
// whole server graph into this test.
const { resendAction } = vi.hoisted(() => ({
  resendAction: vi.fn(async () => ({ message: null, error: null })),
}));
vi.mock("@/app/actions/password-reset", () => ({ requestPasswordResetAction: resendAction }));

const { verifyOtp } = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { verifyOtp } }),
}));

// `useActionNavigate` performs a real `window.location.assign`, which jsdom
// refuses to implement. Spying on the module keeps the component's own contract
// under test (it must navigate, and it must stay busy afterwards) without asking
// jsdom to leave the page.
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@/lib/ui/use-action-redirect", () => ({
  useActionNavigate: () => [navigate, false] as const,
}));

import {
  RESET_CODE_MESSAGES,
  ResetCodeStep,
  ResetCodeStepView,
} from "@/app/(auth)/recuperar/ResetCodeStep";

const NOTICE =
  "Si existe una cuenta con ese correo, te enviamos un código de 6 dígitos. Revisá también tu carpeta de spam.";
const noop = () => {};

/** GoTrue's answer to a wrong code, an expired one, a spent one and an unknown address alike. */
const GOTRUE_OTP_REFUSAL = {
  message: "Token has expired or is invalid",
  code: "otp_expired",
  status: 403,
};

function render(overrides: Partial<Parameters<typeof ResetCodeStepView>[0]> = {}) {
  return renderToStaticMarkup(
    <ResetCodeStepView
      email="ana@mimar.ar"
      notice={NOTICE}
      codeError={null}
      onSubmitCode={noop}
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

  it("shows the invalid-or-expired sentence on the code field when the code is refused", () => {
    const html = render({ codeError: RESET_CODE_MESSAGES.invalid_code });
    expect(html).toContain(RESET_CODE_MESSAGES.invalid_code);
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
    const form = codeForm(render({ codePending: true }));
    expect(form).toContain("Verificando...");
    expect(form).toContain("disabled");
  });

  it("never mentions a link — the mail carries a code", () => {
    expect(render()).not.toMatch(/enlace/i);
  });
});

// ---------------------------------------------------------------------------
// ResetCodeStep — the browser redemption
// ---------------------------------------------------------------------------

/** Mount the step and submit `code` through the real form. */
async function submitCode(code: string, email = "ana@mimar.ar") {
  renderDom(<ResetCodeStep email={email} notice={NOTICE} onChangeEmail={noop} />);
  const field = screen.getByLabelText(/Código/i);
  fireEvent.change(field, { target: { value: code } });
  fireEvent.submit(field.closest("form") as HTMLFormElement);
  return field as HTMLInputElement;
}

/** Whatever sentence the step is currently showing about the code, if any. */
function shownError(): string | null {
  for (const sentence of Object.values(RESET_CODE_MESSAGES)) {
    if (screen.queryByText(sentence)) return sentence;
  }
  return null;
}

beforeEach(() => {
  verifyOtp.mockReset();
  navigate.mockReset();
  resendAction.mockClear();
});

afterEach(cleanup);

describe("ResetCodeStep (browser redemption)", () => {
  it("redeems the code against the browser client and navigates to /recuperar/actualizar", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "a" } }, error: null });
    // Pasted from a mail client, hence the space: whitespace is removed, the
    // address is the one the request step echoed back.
    await submitCode("123 456");

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({
        email: "ana@mimar.ar",
        token: "123456",
        type: "recovery",
      }),
    );
    // A FULL document navigation, not a router push: the next page is rendered
    // by the SERVER and needs the cookies verifyOtp just wrote.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/recuperar/actualizar"));
    expect(shownError()).toBeNull();
  });

  it("keeps the button busy through the navigation, so a second tap is impossible", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "a" } }, error: null });
    await submitCode("123456");

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const button = screen.getByRole("button", { name: /Verificando/i });
    expect(button).toBeDisabled();
  });

  it.each([
    ["a wrong code", GOTRUE_OTP_REFUSAL, "000000"],
    ["an expired code", { ...GOTRUE_OTP_REFUSAL }, "654321"],
    // A DIFFERENT provider shape for the unknown address. Today's GoTrue answers
    // both with otp_expired, but if a version ever distinguishes them, what the
    // person is TOLD must still not — otherwise this is an enumeration oracle.
    [
      "an address with no account",
      { message: "User not found", code: "user_not_found", status: 404 },
      "111111",
    ],
  ])("shows the one neutral sentence for %s", async (_label, error, code) => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error });
    await submitCode(code);

    await waitFor(() => expect(shownError()).toBe(RESET_CODE_MESSAGES.invalid_code));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("treats a resolved answer with no session as a failure, not a success", async () => {
    // GoTrue said nothing was wrong and handed over no session: there would be
    // nothing for /recuperar/actualizar to read. Same sentence as a refused code.
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    await submitCode("123456");

    await waitFor(() => expect(shownError()).toBe(RESET_CODE_MESSAGES.invalid_code));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never lets the code reach the DOM, the navigation or the resend action", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: GOTRUE_OTP_REFUSAL });
    const field = await submitCode("987654");

    await waitFor(() => expect(shownError()).toBe(RESET_CODE_MESSAGES.invalid_code));
    // The box still holds what the person typed — that is the DOM's own value,
    // not something React re-rendered from state. Everything the component
    // WROTE is checked below.
    expect(field.value).toBe("987654");
    field.value = "";
    expect(document.body.innerHTML).not.toContain("987654");
    // verifyOtp is the only thing that ever sees it.
    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(resendAction).not.toHaveBeenCalled();
  });

  it("asks for the code when the field is blank, without calling GoTrue", async () => {
    await submitCode("   ");

    await waitFor(() => expect(shownError()).toBe(RESET_CODE_MESSAGES.missing_code));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("maps GoTrue's own rate limit to the rate-limit sentence, not to a code verdict", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "rate limit", code: "over_request_rate_limit", status: 429 },
    });
    await submitCode("123456");

    await waitFor(() => expect(shownError()).toBe(RESET_CODE_MESSAGES.rate_limited));
  });

  it("reports an unavailable provider without blaming the code", async () => {
    verifyOtp.mockRejectedValue(new Error("fetch failed"));
    await submitCode("123456");

    await waitFor(() => expect(shownError()).toBe(RESET_CODE_MESSAGES.unavailable));
    expect(navigate).not.toHaveBeenCalled();
  });
});
