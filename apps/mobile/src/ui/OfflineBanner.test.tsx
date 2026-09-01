// `OfflineBanner` — a definite NO shows it; anything else shows nothing.
//
// NetInfo answers `isConnected: null` while it does not know, and a banner
// that cries offline during "unknown" trains people to ignore it. These pin
// the strict-false rule, the recovery, and the unsubscribe.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";

type Listener = (state: { isConnected: boolean | null }) => void;

let listener: Listener | null = null;
const mockUnsubscribe = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: (cb: Listener) => {
      listener = cb;
      return mockUnsubscribe;
    },
  },
}));

import { OfflineBanner } from "./OfflineBanner";

function fire(isConnected: boolean | null) {
  act(() => listener?.({ isConnected }));
}

beforeEach(() => {
  listener = null;
  mockUnsubscribe.mockReset();
});

describe("the strict-false rule", () => {
  it("shows the banner on a definite NO", () => {
    render(<OfflineBanner />);
    fire(false);
    expect(screen.getByText("Sin conexión a internet")).toBeOnTheScreen();
  });

  it("shows NOTHING while connected — and nothing on UNKNOWN, which is not a no", () => {
    render(<OfflineBanner />);
    fire(true);
    expect(screen.queryByText("Sin conexión a internet")).toBeNull();
    fire(null);
    expect(screen.queryByText("Sin conexión a internet")).toBeNull();
  });

  it("clears the banner the moment the network comes back", () => {
    render(<OfflineBanner />);
    fire(false);
    expect(screen.getByText("Sin conexión a internet")).toBeOnTheScreen();
    fire(true);
    expect(screen.queryByText("Sin conexión a internet")).toBeNull();
  });
});

describe("lifecycle", () => {
  it("unsubscribes from NetInfo when unmounted", () => {
    const view = render(<OfflineBanner />);
    view.unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
