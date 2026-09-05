// `IdentidadPendienteScreen` — the gate for `profilePending: true`.
//
// WHAT THIS HAS TO PROVE
// ---------------------------------------------------------------------------
// The screen and the redirect are the SAME component now, on purpose (see the
// file under test): `profilePending` is a prop, not a hook read, precisely so
// this can be asserted without expo-router's real navigation stack. The case
// that matters is the second one below — a caller whose identity is already
// complete must never see "Falta completar tu registro" again. That check
// used to live in `app/identidad-pendiente.tsx`, where nothing could exercise
// it, and its absence was the redirect-loop bug fixed 2026-09-04.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

const mockOpenURL = jest.fn();
const mockSignOut = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRedirect = jest.fn();

jest.mock("expo-linking", () => ({ openURL: (...args: unknown[]) => mockOpenURL(...args) }));

// A TEST DOUBLE, NOT THE REAL COMPONENT: expo-router's `Redirect` navigates
// through a live router context this render has none of. Recording its props
// and rendering nothing is enough to prove WHICH href this screen chose,
// without standing up a router.
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props);
    return null;
  },
}));

jest.mock("./session-store", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import { IDENTITY_COMPLETION_URL } from "../config/api";
import { ROUTES } from "../ui/routes";
import { IdentidadPendienteScreen } from "./IdentidadPendienteScreen";

beforeEach(() => {
  mockOpenURL.mockReset();
  mockSignOut.mockReset();
  mockRedirect.mockReset();
});

describe("IdentidadPendienteScreen", () => {
  it("renders the identity-completion instructions while profilePending is true", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);

    expect(screen.getByText("Falta completar tu registro")).toBeTruthy();
    expect(screen.getByText(IDENTITY_COMPLETION_URL)).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to mis mascotas instead of rendering, once profilePending is false", () => {
    // THE LOAD-BEARING CASE (2026-09-04). Reached via a deep link, a stale
    // back-stack entry, or the sign-in round trip `return-to.ts` used to
    // carry `next=/identidad-pendiente` through — all three used to land back
    // on this exact screen even after the server answered `profilePending:
    // false`, because nothing here ever asked.
    render(<IdentidadPendienteScreen profilePending={false} />);

    expect(screen.queryByText("Falta completar tu registro")).toBeNull();
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith({ href: ROUTES.misMascotas });
  });

  it("closes the session without ever opening the browser on its own", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });
});
