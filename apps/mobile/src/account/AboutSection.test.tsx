// The "Acerca de miMAR" block, held to the three ways it answers
// "¿qué versión tenés?": a real OTA update running, the build's own embedded
// code with no hotfix applied yet, and the dev client where expo-updates has
// nothing to say at all. Not "does it render" — a wrong answer here is a
// support reply that trusts a version nobody is actually running.

import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

let mockExpoConfig: { version?: string } | null;
let mockUpdateId: string | null;
let mockChannel: string | null;
let mockIsEmbeddedLaunch: boolean;

// Getters, not plain values — the same reason sentry.test.ts's expo-constants
// mock uses one for `expoConfig`: `import * as Updates from "expo-updates"`
// reads these fresh on every property access, so each test below can move
// the four variables without re-importing the module under test.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));
jest.mock("expo-updates", () => ({
  __esModule: true,
  get updateId() {
    return mockUpdateId;
  },
  get channel() {
    return mockChannel;
  },
  get isEmbeddedLaunch() {
    return mockIsEmbeddedLaunch;
  },
}));

import { AboutSection } from "./AboutSection";

describe("the about block", () => {
  it("shows the real version, the running update's id, and its channel", () => {
    mockExpoConfig = { version: "0.4.12" };
    mockIsEmbeddedLaunch = false;
    mockUpdateId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    mockChannel = "production";

    render(<AboutSection />);

    expect(screen.getByText("0.4.12")).toBeTruthy();
    expect(screen.getByText("a1b2c3d4")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
  });

  it("says 'integrada' for the build's own embedded code, not a truncated id", () => {
    // isEmbeddedLaunch wins even when expo-updates hands back a real UUID —
    // that UUID names the embedded update itself, and eight hex characters
    // for "no hotfix has ever applied" would be technically true and useless
    // to a tester reading it out loud.
    mockExpoConfig = { version: "0.4.12" };
    mockIsEmbeddedLaunch = true;
    mockUpdateId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    mockChannel = "preview";

    render(<AboutSection />);

    expect(screen.getByText("integrada")).toBeTruthy();
    expect(screen.getByText("preview")).toBeTruthy();
  });

  it("falls back to em dashes and 'integrada' in the dev client, where expo-updates has nothing", () => {
    mockExpoConfig = null;
    mockIsEmbeddedLaunch = false;
    mockUpdateId = null;
    mockChannel = null;

    render(<AboutSection />);

    // Both the version and the channel fall back to the SAME em dash, so the
    // two absences are asserted together rather than with a `getByText` that
    // would throw on finding more than one match.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("integrada")).toBeTruthy();
  });
});
