// The two native-module seams — what the DEFAULTS promise.
//
// These tests pin the honest-default contract both screens build on:
//
//   1. THE DEFAULT PICKER SAYS `unavailable`, AND SAYS IT BEFORE BEING CALLED.
//      `available: false` is what a screen reads to not draw the control;
//      `pickImage()` answering `unavailable` anyway is the defensive half. A
//      default that answered anything else would let a control ship that lies
//      about what this build can do — the `consoleSink` argument.
//   2. THE DEFAULT SCANNER IS `null`, NOT AN APOLOGY COMPONENT. A screen must
//      be unable to mount a scanner that is not there.
//   3. `set…Port` RETURNS WHAT IT REPLACED and `reset…Port` restores the
//      default — the seam's whole job is that wiring is one reversible call.
//
// MUTATIONS THAT MUST GO RED HERE (applied while writing, then reverted):
//   · `moduleMissingImagePicker.available: false → true` — test 1.
//   · its `pickImage` returning `{ outcome: "cancelled" }` — test 2.
//   · `moduleMissingChipScanner.ScanView: null → () => null` — test 5.
//   · `setImagePickerPort` returning the NEW port instead of the previous —
//     test 3.

import { afterEach, describe, expect, it } from "@jest/globals";

import {
  getChipScannerPort,
  moduleMissingChipScanner,
  resetChipScannerPort,
  setChipScannerPort,
} from "./chip-scanner-port";
import {
  type ImagePickerPort,
  getImagePickerPort,
  moduleMissingImagePicker,
  pickImageSafely,
  resetImagePickerPort,
  setImagePickerPort,
} from "./image-picker-port";

afterEach(() => {
  resetImagePickerPort();
  resetChipScannerPort();
});

describe("the image-picker seam", () => {
  it("defaults to a port that declares itself unavailable", () => {
    expect(getImagePickerPort()).toBe(moduleMissingImagePicker);
    expect(getImagePickerPort().available).toBe(false);
    expect(getImagePickerPort().name).toBe("module-missing");
  });

  it("answers `unavailable` even when called anyway — the defensive half", async () => {
    // A screen reads `available` first; this is what happens if one does not.
    await expect(moduleMissingImagePicker.pickImage()).resolves.toEqual({
      outcome: "unavailable",
    });
  });

  it("set returns the replaced port, and reset restores the default", async () => {
    const fake: ImagePickerPort = {
      name: "fake",
      available: true,
      pickImage: async () => ({ outcome: "cancelled" }),
    };
    const previous = setImagePickerPort(fake);
    expect(previous).toBe(moduleMissingImagePicker);
    expect(getImagePickerPort()).toBe(fake);
    await expect(getImagePickerPort().pickImage()).resolves.toEqual({ outcome: "cancelled" });

    resetImagePickerPort();
    expect(getImagePickerPort()).toBe(moduleMissingImagePicker);
  });
});

describe("`pickImageSafely` — the never-throws half, enforced", () => {
  it("passes a well-behaved port's answer through untouched", async () => {
    setImagePickerPort({
      name: "fake",
      available: true,
      pickImage: async () => ({ outcome: "cancelled" }),
    });

    await expect(pickImageSafely()).resolves.toEqual({ outcome: "cancelled" });
  });

  it("turns a port that THROWS into `failed`, naming which port broke", async () => {
    // Until this function the "never throws" promise was a sentence in a
    // header and enforced nowhere. Both screens bare-await the pick after
    // setting a "picking" phase, so a rejection stranded them on a spinner
    // with no sentence and no retry — the one answer a tap may not get.
    setImagePickerPort({
      name: "throwing-adapter",
      available: true,
      pickImage: async () => {
        throw new Error("null is not an object");
      },
    });

    await expect(pickImageSafely()).resolves.toEqual({
      outcome: "failed",
      detail: "throwing-adapter threw: null is not an object",
    });
  });

  it("survives a port that throws something that was never an Error", async () => {
    setImagePickerPort({
      name: "rude-adapter",
      available: true,
      pickImage: async () => {
        // A non-Error throw, on purpose: `failureDetail` has to survive one.
        throw "just a string";
      },
    });

    await expect(pickImageSafely()).resolves.toEqual({
      outcome: "failed",
      detail: "rude-adapter threw: just a string",
    });
  });

  it("reads the port at CALL time, so the default's `unavailable` still arrives", async () => {
    await expect(pickImageSafely()).resolves.toEqual({ outcome: "unavailable" });
  });
});

describe("the chip-scanner seam", () => {
  it("defaults to NO scan view at all — null, not a stub component", () => {
    expect(getChipScannerPort()).toBe(moduleMissingChipScanner);
    // `toBeNull` and not falsy: a component that renders nothing would still
    // be mountable, and mountable is exactly what the missing module must not be.
    expect(getChipScannerPort().ScanView).toBeNull();
  });

  it("set returns the replaced port, and reset restores the default", () => {
    const FakeView = () => null;
    const previous = setChipScannerPort({ name: "fake", ScanView: FakeView });
    expect(previous).toBe(moduleMissingChipScanner);
    expect(getChipScannerPort().ScanView).toBe(FakeView);

    resetChipScannerPort();
    expect(getChipScannerPort()).toBe(moduleMissingChipScanner);
  });
});
