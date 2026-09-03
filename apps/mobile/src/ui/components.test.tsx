// `ContactRow` — the phone-or-email contact row. `contact-link.test.ts` pins
// the pure decision; this pins what actually reaches the screen reader and
// the dialer/mail client, which is the part a fossilized "PhoneRow" name and
// a hardcoded `tel:` used to get wrong for an email value.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

// Resolved by default: the component chains `.catch()` off the return value,
// and an unmocked `jest.fn()` resolves that call against `undefined`, not a
// promise.
const mockOpenURL = jest.fn<(url: string) => Promise<unknown>>().mockResolvedValue(undefined);

jest.mock("expo-linking", () => ({ openURL: (url: string) => mockOpenURL(url) }));

import { ContactRow } from "./components";

// The mock is module-scoped, so without this every `toHaveBeenCalledWith`
// assertion below is satisfied by ANY earlier test's press. That is not
// hypothetical bookkeeping: the two-contact block presses a tel: row and a
// mailto: row in separate tests, so a row that stopped opening anything at all
// would still pass on a call another test made.
beforeEach(() => {
  mockOpenURL.mockClear();
});

describe("email value", () => {
  it("renders a link labeled 'Escribir a …', not 'Llamar al …'", () => {
    render(<ContactRow label="Contacto" value="juan@example.com" />);
    const link = screen.getByRole("link", { name: /^escribir a juan@example\.com$/i });
    expect(link).toBeOnTheScreen();
  });

  it("opens mailto: on press, not tel: — the failure mode this row used to have", () => {
    render(<ContactRow label="Contacto" value="juan@example.com" />);
    fireEvent.press(screen.getByRole("link", { name: /^escribir a juan@example\.com$/i }));
    expect(mockOpenURL).toHaveBeenCalledWith("mailto:juan@example.com");
  });
});

describe("phone value", () => {
  it("renders a link labeled 'Llamar al …'", () => {
    render(<ContactRow label="Contacto" value="+54 294 412-3456" />);
    const link = screen.getByRole("link", { name: /^llamar al \+54 294 412-3456$/i });
    expect(link).toBeOnTheScreen();
  });

  it("opens tel: on press, sanitized to digits and a leading +", () => {
    render(<ContactRow label="Contacto" value="+54 294 412-3456" />);
    fireEvent.press(screen.getByRole("link", { name: /^llamar al \+54 294 412-3456$/i }));
    expect(mockOpenURL).toHaveBeenCalledWith("tel:+542944123456");
  });
});

describe("phone AND email in one value", () => {
  // The shape `app/(public)/p/[publicToken]/encontre/action.ts` writes into the
  // single finderContact column when a finder leaves both, joined by
  // CONTACT_SEPARATOR. One row per contact, each opening its own
  // scheme — before the split, the whole string went into a single mailto:.
  const BOTH = "11 4123-4567 / ana@example.com";

  it("renders one link per contact, each with its own accessible name", () => {
    render(<ContactRow label="Contacto" value={BOTH} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /^llamar al 11 4123-4567$/i })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: /^escribir a ana@example\.com$/i })).toBeOnTheScreen();
  });

  it("shows each contact on its own row, never the joined string", () => {
    render(<ContactRow label="Contacto" value={BOTH} />);
    expect(screen.getByText("11 4123-4567")).toBeOnTheScreen();
    expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
    expect(screen.queryByText(BOTH)).toBeNull();
  });

  it("opens tel: from the phone row", () => {
    render(<ContactRow label="Contacto" value={BOTH} />);
    fireEvent.press(screen.getByRole("link", { name: /^llamar al 11 4123-4567$/i }));
    expect(mockOpenURL).toHaveBeenCalledWith("tel:1141234567");
  });

  it("opens mailto: from the email row — with no phone number inside the address", () => {
    render(<ContactRow label="Contacto" value={BOTH} />);
    fireEvent.press(screen.getByRole("link", { name: /^escribir a ana@example\.com$/i }));
    expect(mockOpenURL).toHaveBeenCalledWith("mailto:ana@example.com");
  });

  it("still SHOWS a half that cannot become a link, next to the half that can", () => {
    // Rendering per part rather than per link is what keeps this text on the
    // screen. Dropping it would hide a contact in the one flow whose whole
    // point is reaching the person holding the animal.
    render(<ContactRow label="Contacto" value="abc / ana@example.com" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("abc")).toBeOnTheScreen();
  });
});

describe("unlinkable value", () => {
  it("renders no link role — the plain Row fallback", () => {
    render(<ContactRow label="Contacto" value="abc" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("abc")).toBeOnTheScreen();
  });

  it("keeps a joined value VERBATIM when neither half links — no cosmetic split", () => {
    render(<ContactRow label="Contacto" value="abc / def" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("abc / def")).toBeOnTheScreen();
  });
});
