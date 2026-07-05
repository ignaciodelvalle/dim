// @vitest-environment jsdom
//
// LoginFormView field-state tests (PO QA #44).
//
// Two account-switching bugs on /login, pinned here so a refactor can't
// silently bring them back:
//
//  1. The password field kept the previous account's value after you changed
//     the email. A password is scoped to the email it was typed for, so editing
//     the email must clear the password.
//  2. A remembered/autofilled (or just-typed) email got clobbered on re-render.
//     The email input is uncontrolled (DOM-owned), so nothing in React rewrites
//     its value — the typed value must survive an error re-render.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Import the *type* only at runtime — mocking the server action keeps the
// whole server graph out of the test (same guard as login-form.test.tsx).
vi.mock("@/app/actions/auth", () => ({ loginAction: vi.fn() }));

import { LoginFormView } from "@/app/(auth)/login/LoginForm";
import type { AuthFormState } from "@/app/actions/auth";

const noopAction = () => {};

function renderView(overrides: Partial<Parameters<typeof LoginFormView>[0]> = {}) {
  return render(
    <LoginFormView
      state={{ error: null }}
      formAction={noopAction}
      isPending={false}
      returnTo={null}
      {...overrides}
    />,
  );
}

afterEach(cleanup);

describe("LoginFormView — account-switch field state", () => {
  it("clears the password when the email is edited (bug #1)", () => {
    const view = renderView();
    const email = view.container.querySelector('input[name="email"]') as HTMLInputElement;
    const password = view.container.querySelector('input[name="password"]') as HTMLInputElement;

    fireEvent.change(password, { target: { value: "s3cret-admin" } });
    expect(password.value).toBe("s3cret-admin");

    // Switching account: edit the email → the stale password must drop.
    fireEvent.change(email, { target: { value: "govt@example.gob.ar" } });
    expect(password.value).toBe("");
  });

  it("keeps the typed email across an error re-render — the typed value wins (bug #2)", () => {
    const view = renderView();
    const email = view.container.querySelector('input[name="email"]') as HTMLInputElement;

    fireEvent.change(email, { target: { value: "govt@example.gob.ar" } });
    expect(email.value).toBe("govt@example.gob.ar");

    // A failed submit pushes a new error state → re-render. A controlled email
    // bound to React state would be clobbered back; the uncontrolled one keeps
    // what the user typed.
    const errored: AuthFormState = { error: "Correo o contraseña incorrectos." };
    view.rerender(
      <LoginFormView state={errored} formAction={noopAction} isPending={false} returnTo={null} />,
    );

    expect(email.value).toBe("govt@example.gob.ar");
  });
});
