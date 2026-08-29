// "Editar mis datos" — the first native screen that writes a person's own row.
//
// WHAT THESE CASES STAND IN FOR
// ---------------------------------------------------------------------------
//   · a form that does not re-read after saving → the writer trims the display
//     name, so the field keeps showing what was typed while the server holds
//     something else, and the next save posts the untrimmed value again;
//   · a save button live on a two-character name → the server refuses with
//     `invalid_request` and the person is told their request was malformed,
//     about a field their own screen could have flagged;
//   · a phone warning that BLOCKS → the server accepts older landlines,
//     satellite numbers and foreign numbers by explicit decision
//     (`update-profile.ts`), and a native form refusing them would be inventing
//     a rule on behalf of somebody in Salta;
//   · a failure that renders nothing → a blank where an explanation should be.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSave = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../api/endpoints", () => ({
  fetchMyProfile: (...args: unknown[]) => mockFetch(...args),
  saveMyProfile: (...args: unknown[]) => mockSave(...args),
}));

jest.mock("../auth/session-store", () => ({
  sessionPort: { accessToken: async () => "t" },
}));

import { EditProfileScreen } from "./EditProfileScreen";

const STORED = {
  displayName: "Lucía",
  phone: "+54 9 11 1234-5678",
  preferredVetName: "Vet Bariloche",
  preferredVetPhone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

function payload(profile: typeof STORED = STORED) {
  return {
    outcome: "ok",
    payload: {
      payloadVersion: 1,
      issuedAt: "2026-08-29T12:00:00.000Z",
      staleAfter: "2026-08-29T12:01:00.000Z",
      profile,
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset();
  mockFetch.mockResolvedValue(payload());
  mockSave.mockResolvedValue({ outcome: "ok", payload: { saved: true } });
});

describe("loading", () => {
  it("pre-fills every field from the server", async () => {
    render(<EditProfileScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Nombre, obligatorio").props.value).toBe("Lucía");
      expect(screen.getByLabelText("Teléfono").props.value).toBe("+54 9 11 1234-5678");
      expect(screen.getByLabelText("Veterinaria de cabecera").props.value).toBe("Vet Bariloche");
    });
  });

  it("says why it failed, with a way back in", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable" });
    render(<EditProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("No pudimos conectarnos. Revisá tu conexión.")).toBeTruthy();
      expect(screen.getByText("Reintentar")).toBeTruthy();
    });
  });
});

describe("saving", () => {
  it("posts all six fields, with the empties intact", async () => {
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    fireEvent.press(screen.getByText("Guardar cambios"));

    await waitFor(() => {
      const [, input] = mockSave.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(Object.keys(input).sort()).toEqual([
        "displayName",
        "emergencyContactName",
        "emergencyContactPhone",
        "phone",
        "preferredVetName",
        "preferredVetPhone",
      ]);
      expect(input.preferredVetPhone).toBe("");
    });
  });

  it("RE-READS after a save rather than trusting the draft", async () => {
    // The mutation this catches: dropping the reload. The writer trims the
    // display name, so a form that kept its own state would go on showing
    // "  Lucía  " while the server holds "Lucía" — and would post the untrimmed
    // value again on the next save.
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText("Guardar cambios"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it("says so when it worked", async () => {
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    fireEvent.press(screen.getByText("Guardar cambios"));

    await waitFor(() => expect(screen.getByText("Tus datos fueron actualizados.")).toBeTruthy());
  });

  it("renders the server's refusal instead of a blank", async () => {
    mockSave.mockResolvedValue({ outcome: "api-error", code: "profile_failed" });
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    fireEvent.press(screen.getByText("Guardar cambios"));

    await waitFor(() =>
      expect(screen.getByText("No pudimos guardar los cambios. Volvé a intentar.")).toBeTruthy(),
    );
  });

  it("refuses to save a display name under the contract's minimum", async () => {
    // The mutation this catches: dropping `!nameUsable` from the button. The
    // server refuses anyway — with `invalid_request`, which says "your client
    // sent nonsense" to somebody who can fix one visible field.
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Nombre, obligatorio"), "L");
    fireEvent.press(screen.getByText("Guardar cambios"));

    expect(mockSave).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only name as too short", async () => {
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Nombre, obligatorio"), "    ");
    fireEvent.press(screen.getByText("Guardar cambios"));

    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("the phone hint", () => {
  it("warns about an unusual format WITHOUT blocking the save", async () => {
    // The server accepts these by explicit decision. A native form that refused
    // what the server accepts would be inventing a rule on behalf of somebody
    // with an old landline.
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Teléfono"), "no es un teléfono");

    expect(screen.getByText(/Formato inusual para Argentina/)).toBeTruthy();

    fireEvent.press(screen.getByText("Guardar cambios"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
  });

  it("stays quiet for an empty field and for a valid one", async () => {
    render(<EditProfileScreen />);
    await waitFor(() => expect(screen.getByText("Guardar cambios")).toBeTruthy());

    // Seeded value is a well-formed AR number, and the three contact phones are
    // empty — so nothing should be warning about anything.
    expect(screen.queryByText(/Formato inusual para Argentina/)).toBeNull();
  });
});
