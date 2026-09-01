// `ContactRow` — the phone-or-email contact row. `contact-link.test.ts` pins
// the pure decision; this pins what actually reaches the screen reader and
// the dialer/mail client, which is the part a fossilized "PhoneRow" name and
// a hardcoded `tel:` used to get wrong for an email value.

import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

const mockOpenURL = jest.fn<(url: string) => Promise<unknown>>();

jest.mock("expo-linking", () => ({ openURL: (url: string) => mockOpenURL(url) }));

import { ContactRow } from "./components";

describe("email value", () => {
  it("renders a link labeled 'Escribir a …', not 'Llamar al …'", () => {
    render(<ContactRow label="Contacto" value="juan@example.com" />);
    const link = screen.getByRole("link", { name: /^escribir a juan@example\.com$/i });
    expect(link).toBeOnTheScreen();
  });
});

describe("phone value", () => {
  it("renders a link labeled 'Llamar al …'", () => {
    render(<ContactRow label="Contacto" value="+54 294 412-3456" />);
    const link = screen.getByRole("link", { name: /^llamar al \+54 294 412-3456$/i });
    expect(link).toBeOnTheScreen();
  });
});

describe("unlinkable value", () => {
  it("renders no link role — the plain Row fallback", () => {
    render(<ContactRow label="Contacto" value="abc" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("abc")).toBeOnTheScreen();
  });
});
