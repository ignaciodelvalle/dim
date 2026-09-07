// @vitest-environment jsdom
//
// SignupForm field-state tests (bug #46, mirrored from LoginForm — PO QA #44 /
// login fix 6d0a0cb6).
//
// React 19 auto-resets an uncontrolled `<form action={fn}>` once the action
// resolves. A validation error on either signup step returns (no redirect),
// so the reset would wipe the DOM-owned fields the user just typed: email on
// step 1, first/last name on step 2. signupAction / completeIdentityAction
// echo those non-secret fields back in form state, and the inputs seed
// `defaultValue` from the echo, so the reset lands on the typed value instead
// of clearing it. Password fields are never echoed/round-tripped.
//
// useActionState is stubbed (same technique as pet-sighting-form.test.tsx /
// finder-in-possession-form.test.tsx) so each step's state is fully
// controllable without driving a real server action.

import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthFormState, IdentityFormState } from "@/app/actions/auth";

const mockUseActionState = vi.fn();

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof React;
  return {
    ...actual,
    useActionState: (...args: unknown[]) => mockUseActionState(...args),
  };
});

vi.mock("@/app/actions/auth", () => ({
  signupAction: vi.fn(),
  completeIdentityAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Location autocomplete pulls in fetch/dynamic-import machinery irrelevant here.
vi.mock("@/components/LocationFields", () => ({
  LocationFields: () => React.createElement("div", { "data-testid": "location-fields" }),
}));

import { SignupForm } from "@/app/(auth)/registro/SignupForm";
import { completeIdentityAction, signupAction } from "@/app/actions/auth";

const noopAction = () => {};

let authState: AuthFormState = { error: null };
let identityState: IdentityFormState = { error: null };

beforeEach(() => {
  authState = { error: null };
  identityState = { error: null };
  mockUseActionState.mockImplementation((action: unknown) => {
    if (action === signupAction) return [authState, noopAction, false];
    if (action === completeIdentityAction) return [identityState, noopAction, false];
    throw new Error(`unexpected action passed to useActionState: ${String(action)}`);
  });
});

afterEach(cleanup);

function renderForm() {
  return render(<SignupForm intent={null} returnTo={null} />);
}

describe("SignupForm — step 1 (account) field state", () => {
  it("restores the typed email across React 19's post-action form reset (bug #46)", () => {
    const view = renderForm();
    const email = view.container.querySelector('input[name="email"]') as HTMLInputElement;
    const form = view.container.querySelector("form") as HTMLFormElement;

    fireEvent.change(email, { target: { value: "nueva@example.com" } });

    // A failed submit re-renders with the error AND the echoed-back email.
    authState = { error: "Faltan datos. Completá todos los campos.", email: "nueva@example.com" };
    view.rerender(<SignupForm intent={null} returnTo={null} />);

    // Simulate the React 19 reset. Without the defaultValue echo the field
    // would reset to empty; with it, the typed email survives.
    form.reset();
    expect(email.value).toBe("nueva@example.com");
  });

  it("does not echo the password across the reset", () => {
    const view = renderForm();
    const password = view.container.querySelector('input[name="password"]') as HTMLInputElement;
    const form = view.container.querySelector("form") as HTMLFormElement;

    fireEvent.change(password, { target: { value: "supersecreta" } });
    expect(password.value).toBe("supersecreta");

    authState = { error: "Las contraseñas no coinciden.", email: "nueva@example.com" };
    view.rerender(<SignupForm intent={null} returnTo={null} />);

    form.reset();
    // Password is never echoed in AuthFormState — the field has no
    // defaultValue seeded from server state, so it resets to empty like any
    // other unmanaged uncontrolled field.
    expect(password.value).toBe("");
  });
});

describe("SignupForm — step 2 (identity) field state", () => {
  it("restores the typed first/last name across React 19's post-action form reset (bug #46)", () => {
    // Step 1 already succeeded — the form is showing step 2.
    authState = { error: null, ok: true };
    const view = renderForm();

    const firstName = view.container.querySelector('input[name="firstName"]') as HTMLInputElement;
    const lastName = view.container.querySelector('input[name="lastName"]') as HTMLInputElement;
    const form = view.container.querySelector("form") as HTMLFormElement;

    fireEvent.change(firstName, { target: { value: "Juana" } });
    fireEvent.change(lastName, { target: { value: "Gómez" } });

    // A failed submit re-renders with the error AND the echoed-back name.
    //
    // The sample error used to be "El DNI debe tener 7 u 8 dígitos numéricos.",
    // a sentence the action can no longer produce: the DNI field left this form
    // on 2026-09-07. What this test is about is the ECHO — React 19 resets an
    // uncontrolled form when the action resolves, and bug #46 was people losing
    // their own typed name on a refusal — so the string only has to be a real
    // refusal this form can actually show. Using a dead one would quietly make
    // the fixture a lie about what a user sees here.
    identityState = {
      error: "No pudimos guardar tus datos. Revisá la información e intentá de nuevo.",
      firstName: "Juana",
      lastName: "Gómez",
    };
    view.rerender(<SignupForm intent={null} returnTo={null} />);

    form.reset();
    expect(firstName.value).toBe("Juana");
    expect(lastName.value).toBe("Gómez");
  });
});
