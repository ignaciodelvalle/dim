// `IdentidadPendienteScreen` — signup step 2, now that it happens HERE.
//
// WHAT THIS HAS TO PROVE
// ---------------------------------------------------------------------------
//   1. THE REDIRECT STILL FIRES. The screen and the redirect are the SAME
//      component on purpose — `profilePending` is a prop, not a hook read,
//      precisely so this can be asserted without expo-router's real navigation
//      stack. Its absence was the redirect-loop bug fixed 2026-09-04, and the
//      form makes it MORE load-bearing rather than less: the success path has no
//      navigation call of its own, it just stops being pending.
//   2. NOTHING IS SENT UNTIL THE CONTRACT'S SCHEMA SAYS SO, and what is sent is
//      TRIMMED. A blank surname gets a field sentence, not a round trip.
//   3. A REFUSAL KEEPS THE TYPED VALUES. The web form had to fight React 19's
//      automatic reset for this property (bug #46) and echo the names back
//      through `IdentityFormState`; here they are component state, and the
//      assertion is what stops somebody "cleaning up" by clearing the draft.
//   4. THE BROWSER IS NEVER OPENED ON ITS OWN. The web door is still there for
//      the DNI — it is the only place one can be loaded — but it is a link
//      somebody taps, not something the screen does.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockOpenURL = jest.fn();
const mockSignOut = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCompleteIdentity =
  jest.fn<(...args: unknown[]) => Promise<{ ok: boolean; message?: string }>>();
const mockRedirect = jest.fn();

jest.mock("expo-linking", () => ({ openURL: (...args: unknown[]) => mockOpenURL(...args) }));

// A TEST DOUBLE, NOT THE REAL COMPONENT: expo-router's `Redirect` navigates
// through a live router context this render has none of. Recording its props and
// rendering nothing is enough to prove WHICH href this screen chose, without
// standing up a router.
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props);
    return null;
  },
}));

jest.mock("./session-store", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  completeIdentity: (...args: unknown[]) => mockCompleteIdentity(...args),
}));

import { IDENTITY_COMPLETION_URL } from "../config/api";
import { ROUTES } from "../ui/routes";
import { IdentidadPendienteScreen } from "./IdentidadPendienteScreen";

function fill(firstName = "Ana", lastName = "Pérez") {
  fireEvent.changeText(screen.getByLabelText("Nombre, obligatorio"), firstName);
  fireEvent.changeText(screen.getByLabelText("Apellido, obligatorio"), lastName);
}

beforeEach(() => {
  mockOpenURL.mockReset();
  mockSignOut.mockReset();
  mockRedirect.mockReset();
  mockCompleteIdentity.mockReset();
  mockCompleteIdentity.mockResolvedValue({ ok: true });
});

describe("the gate", () => {
  it("renders the form while profilePending is true", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);

    expect(screen.getByText("Completá tu registro")).toBeTruthy();
    expect(screen.getByLabelText("Nombre, obligatorio")).toBeTruthy();
    expect(screen.getByLabelText("Apellido, obligatorio")).toBeTruthy();
    expect(screen.getByText("Guardar")).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to mis mascotas instead of rendering, once profilePending is false", () => {
    // THE LOAD-BEARING CASE (2026-09-04). Reached via a deep link, a stale
    // back-stack entry, the sign-in round trip `return-to.ts` used to carry
    // `next=/identidad-pendiente` through — and now, most often, via the save
    // that just landed. All of them used to land back on this exact screen even
    // after the server answered `profilePending: false`, because nothing here
    // ever asked.
    render(<IdentidadPendienteScreen profilePending={false} />);

    expect(screen.queryByText("Completá tu registro")).toBeNull();
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith({ href: ROUTES.misMascotas });
  });
});

describe("the form", () => {
  it("sends the TRIMMED names and lets the store take the person onward", async () => {
    const view = render(<IdentidadPendienteScreen profilePending={true} />);
    fill("  Ana  ", " Pérez ");

    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(mockCompleteIdentity).toHaveBeenCalledTimes(1));
    expect(mockCompleteIdentity).toHaveBeenCalledWith({ firstName: "Ana", lastName: "Pérez" });

    // THE SCREEN NAMES NO DESTINATION OF ITS OWN. `completeIdentity` swaps the
    // stored user, the route re-renders with `profilePending: false`, and the
    // redirect above is what moves. Re-rendering with the new prop is that, in a
    // test that has no store.
    view.rerender(<IdentidadPendienteScreen profilePending={false} />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: ROUTES.misMascotas });
  });

  it("keeps the button dead until both fields have something in them", () => {
    const saveDisabled = () =>
      screen.getByRole("button", { name: "Guardar" }).props.accessibilityState.disabled;

    render(<IdentidadPendienteScreen profilePending={true} />);
    expect(saveDisabled()).toBe(true);

    fireEvent.changeText(screen.getByLabelText("Nombre, obligatorio"), "Ana");
    expect(saveDisabled()).toBe(true);

    fireEvent.changeText(screen.getByLabelText("Apellido, obligatorio"), "Pérez");
    expect(saveDisabled()).toBe(false);
  });

  it("refuses an empty surname from the return key, without spending a request", () => {
    // THE RETURN KEY IS A SECOND SUBMIT PATH and it does not consult the
    // button's disabled state — `useReturnKeyChain`'s last field calls `onDone`
    // directly. So the presence rules still have to be enforced by the verdict,
    // and the sentence still has to name the empty box.
    render(<IdentidadPendienteScreen profilePending={true} />);
    fireEvent.changeText(screen.getByLabelText("Nombre, obligatorio"), "Ana");

    fireEvent(screen.getByLabelText("Apellido, obligatorio"), "submitEditing");

    expect(mockCompleteIdentity).not.toHaveBeenCalled();
    expect(screen.getByText("Escribí tu apellido.")).toBeTruthy();
  });

  it("submits from the return key on Apellido, so nothing has to be tapped under the keyboard", async () => {
    render(<IdentidadPendienteScreen profilePending={true} />);
    fill();

    fireEvent(screen.getByLabelText("Apellido, obligatorio"), "submitEditing");

    await waitFor(() => expect(mockCompleteIdentity).toHaveBeenCalledTimes(1));
  });

  it("refuses a name past the shared display-name bound, with the length sentence", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);
    fill("A".repeat(200), "Pérez");

    fireEvent.press(screen.getByText("Guardar"));

    expect(mockCompleteIdentity).not.toHaveBeenCalled();
    expect(screen.getByText(/hasta \d+ caracteres cada uno/)).toBeTruthy();
  });

  it("renders the server's refusal and KEEPS what the person typed", async () => {
    mockCompleteIdentity.mockResolvedValue({
      ok: false,
      message: "Ese nombre no nos sirve para identificarte. Escribí tu nombre y apellido reales.",
    });
    render(<IdentidadPendienteScreen profilePending={true} />);
    fill("Ana", "Pérez");

    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() =>
      expect(screen.getByText(/Ese nombre no nos sirve para identificarte/)).toBeTruthy(),
    );
    // The values survive. Somebody whose save was refused must not have to retype
    // their own name — the web form needed an explicit echo for this and this one
    // needs an assertion that nobody clears the draft "on failure".
    expect(screen.getByLabelText("Nombre, obligatorio").props.value).toBe("Ana");
    expect(screen.getByLabelText("Apellido, obligatorio").props.value).toBe("Pérez");
    // And the screen stays: a refused save is not a completed identity.
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does not send twice while a save is in flight", async () => {
    // Held in an object rather than a `let`: TypeScript narrows a `let` assigned
    // only inside a callback to `never` at the call site below, and the test
    // would not compile.
    const inFlight: { release: () => void } = { release: () => {} };
    mockCompleteIdentity.mockReturnValue(
      new Promise((resolve) => {
        inFlight.release = () => resolve({ ok: true });
      }),
    );
    render(<IdentidadPendienteScreen profilePending={true} />);
    fill();

    fireEvent.press(screen.getByText("Guardar"));
    await waitFor(() => expect(screen.getByText("Guardando…")).toBeTruthy());

    // Dead while in flight, from BOTH submit paths. A second one here would be a
    // second request against a per-user budget, for an act already under way.
    fireEvent.press(screen.getByText("Guardando…"));
    fireEvent(screen.getByLabelText("Apellido, obligatorio"), "submitEditing");

    expect(mockCompleteIdentity).toHaveBeenCalledTimes(1);
    inFlight.release();
  });
});

describe("the web door and the way out", () => {
  it("keeps the browser handoff as a secondary link, for the DNI", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);
    expect(screen.getByText("Prefiero completarlo en la web")).toBeTruthy();

    fireEvent.press(screen.getByText("Prefiero completarlo en la web"));
    expect(mockOpenURL).toHaveBeenCalledWith(IDENTITY_COMPLETION_URL);
  });

  it("never opens the browser on its own", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("still offers Cerrar sesión", () => {
    render(<IdentidadPendienteScreen profilePending={true} />);
    fireEvent.press(screen.getByText("Cerrar sesión"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
