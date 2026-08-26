// The account-deletion card, held to the Play policy that produced it.
//
// These are not "it renders" assertions. Each one stands in for a rejection or
// a support ticket that has no other alarm:
//
//   · no control at all → Play rejects an app that offers account creation and
//     no in-app deletion route, and the rejection arrives after the upload;
//   · a link to the wrong path → the reviewer lands on a page that is not the
//     deletion page, which reads to them exactly like no deletion page;
//   · a link pinned to a hostname → a staging build pointing production users
//     at the wrong database's deletion form, or the reverse;
//   · the two costs going unsaid → somebody taps the link, hits a signed-out
//     browser, assumes the app is broken, and never deletes anything; or
//     deletes on the web, sees the app still logged in, and reports it as a
//     failed deletion.
//
// The URL is asserted against `API_BASE_URL` rather than a literal on purpose:
// a literal would pass while the constant drifted to a different origin, which
// is the whole failure this test is here to catch.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockOpenURL = jest.fn();

jest.mock("expo-linking", () => ({ openURL: (...args: unknown[]) => mockOpenURL(...args) }));

import { ACCOUNT_DELETION_URL, API_BASE_URL } from "../config/api";
import { AccountDeletionCard } from "./AccountDeletionCard";

describe("the deletion URL", () => {
  it("is the web account-privacy page on the SAME origin the app already talks to", () => {
    expect(ACCOUNT_DELETION_URL).toBe(`${API_BASE_URL}/cuenta/privacidad`);
  });

  it("carries no hardcoded hostname of its own", () => {
    expect(ACCOUNT_DELETION_URL.startsWith(API_BASE_URL)).toBe(true);
  });
});

beforeEach(() => {
  mockOpenURL.mockReset();
});

describe("the card", () => {
  it("offers a control that reaches account deletion", () => {
    render(<AccountDeletionCard />);
    expect(screen.getByText("Eliminar mi cuenta")).toBeTruthy();
    expect(screen.getByText("Eliminar mi cuenta en la web")).toBeTruthy();
  });

  it("shows the destination in full, so it can be read or typed", () => {
    render(<AccountDeletionCard />);
    expect(screen.getByText(ACCOUNT_DELETION_URL)).toBeTruthy();
  });

  it("says the browser will ask for the password again", () => {
    render(<AccountDeletionCard />);
    expect(screen.getByText(/el navegador no comparte la sesión de esta app/)).toBeTruthy();
  });

  it("says the app cannot notice the deletion by itself", () => {
    render(<AccountDeletionCard />);
    expect(screen.getByText(/esta app no se entera de la baja por su cuenta/)).toBeTruthy();
  });

  it("names what survives the deletion, rather than implying everything goes", () => {
    render(<AccountDeletionCard />);
    expect(screen.getByText(/se conservan como historial de salud del animal/)).toBeTruthy();
  });

  it("hands the URL to the system browser on press, and deletes nothing itself", () => {
    render(<AccountDeletionCard />);
    fireEvent.press(screen.getByText("Eliminar mi cuenta en la web"));
    expect(mockOpenURL).toHaveBeenCalledWith(ACCOUNT_DELETION_URL);
  });
});
