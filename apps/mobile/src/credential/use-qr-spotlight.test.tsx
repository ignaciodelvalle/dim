// `useQrSpotlight` — capture, raise, restore, and never crash.
//
// The contract worth pinning is the RESTORE: a hook that raises brightness
// and forgets to put it back leaves somebody's phone at 100% in a dark
// room. And the failure path matters as much — the emulator and the
// pre-D2-build phone have no brightness service, and the credential screen
// must not care.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";

const mockGet = jest.fn<() => Promise<number>>();
const mockSet = jest.fn<(value: number) => Promise<void>>();
const mockKeepAwake = jest.fn();

jest.mock("expo-brightness", () => ({
  getBrightnessAsync: () => mockGet(),
  setBrightnessAsync: (value: number) => mockSet(value),
}));

jest.mock("expo-keep-awake", () => ({
  useKeepAwake: () => mockKeepAwake(),
}));

import { useQrSpotlight } from "./use-qr-spotlight";

function Harness() {
  useQrSpotlight();
  return null;
}

/** Let the mount effect's async capture-and-raise settle. */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(0.35);
  mockSet.mockReset().mockResolvedValue(undefined);
  mockKeepAwake.mockReset();
});

describe("the spotlight", () => {
  it("keeps the screen awake and raises the window to full brightness", async () => {
    render(<Harness />);
    await flush();
    expect(mockKeepAwake).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(1);
  });

  it("RESTORES the level it captured when the screen goes away", async () => {
    const screen = render(<Harness />);
    await flush();
    screen.unmount();
    await flush();
    expect(mockSet).toHaveBeenLastCalledWith(0.35);
  });

  it("restores nothing it never captured — the failed-read path stays silent", async () => {
    mockGet.mockRejectedValue(new Error("no brightness service"));
    const screen = render(<Harness />);
    await flush();
    expect(mockSet).not.toHaveBeenCalled();
    screen.unmount();
    await flush();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("survives a set that rejects — the screen behaves as always, no crash", async () => {
    mockSet.mockRejectedValue(new Error("no brightness service"));
    const screen = render(<Harness />);
    await flush();
    expect(() => screen.unmount()).not.toThrow();
    await flush();
  });
});
