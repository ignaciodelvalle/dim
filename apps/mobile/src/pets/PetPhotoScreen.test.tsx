// `PetPhotoScreen` — the render tests, driven through the REAL flow.
//
// Only the endpoints are mocked; `runPetPhotoUpload`, `acceptPickedImage` and
// the copy run for real, so these cases prove the screen's wiring end to end:
// a tap on "Usar esta foto" must reach `requestPetPhotoTicket` with this pet's
// token and come back through every phase on the way.
//
// WHAT THESE HAVE TO PROVE
// ---------------------------------------------------------------------------
//   1. NO CONTROL IN A BUILD WITHOUT THE MODULE. The honest default port means
//      the callout names the web; a button whose only outcome is a shrug must
//      not render — the claim screen's scanner rule, applied here.
//   2. REVIEW BEFORE UPLOAD. A picked photo lands on a preview with the
//      decision, not in an upload.
//   3. A REFUSED PICK IS A SENTENCE, A CANCELLED ONE IS SILENCE.
//   4. EVERY FAILURE LANDS BACK ON REVIEW WITH THE PHOTO INTACT — the person
//      holds the photo, the retry is one tap, and re-picking would punish them
//      for a network error.
//   5. THE HAPPY WALK ENDS ON THE SERVER'S ANSWER, including whether an older
//      photo was replaced.

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockTicket = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPut = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockConfirm = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
}));

jest.mock("../api/endpoints", () => ({
  requestPetPhotoTicket: (...args: unknown[]) => mockTicket(...args),
  uploadPetPhotoBytes: (...args: unknown[]) => mockPut(...args),
  confirmPetPhoto: (...args: unknown[]) => mockConfirm(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import {
  type ImagePickResult,
  resetImagePickerPort,
  setImagePickerPort,
} from "../native/image-picker-port";
import { PetPhotoScreen } from "./PetPhotoScreen";

const TOKEN = "DIM-PAMP-0001";
const STAGED = "22222222-2222-4222-8222-222222222222/333.jpg";

const ticket = {
  uploadUrl: "https://storage.test/sign/x?token=tok",
  token: "tok",
  stagedPath: STAGED,
  bucket: "uploads-staging",
  validForSeconds: 7200,
};

/** What the NEXT pick returns. Each test sets the camera roll it needs. */
let nextPick: ImagePickResult;

function installPicker() {
  setImagePickerPort({ name: "fake", available: true, pickImage: async () => nextPick });
}

function aPick(over: Partial<Extract<ImagePickResult, { outcome: "picked" }>> = {}) {
  return {
    outcome: "picked" as const,
    bytes: new Blob(["photo-bytes"]),
    contentType: "image/jpeg",
    previewUri: "file:///cache/a.jpg",
    ...over,
  };
}

beforeEach(() => {
  nextPick = { outcome: "cancelled" };
  mockBack.mockReset();
  mockTicket.mockReset().mockResolvedValue({ outcome: "ok", payload: ticket });
  mockPut.mockReset().mockResolvedValue({ outcome: "ok" });
  mockConfirm.mockReset().mockResolvedValue({
    outcome: "ok",
    payload: { photoUrl: "https://s.test/p.jpg", replacedPrevious: false },
  });
});

afterEach(() => {
  resetImagePickerPort();
});

// THE TEST CEILING MUST OUTRANK THE `waitFor` CEILING, and until 2026-08-31 it
// did not: `pickInto` waited up to 5000 ms while Jest's own per-test default is
// also 5000 ms. Two consequences, and the second is why this kept coming back.
//
// One: the `waitFor` could never fail with its own message. Jest killed the test
// first, so the report always read "Exceeded timeout of 5000 ms for a test" —
// which names no label, no step and no cause — instead of "Abriendo tus fotos…
// is still on screen", which names all three.
//
// Two: there was NO margin left for the rest of the test. `pickInto` renders,
// presses and waits; everything after it — the asserts, and for the upload cases
// a second `waitFor` — had to fit inside whatever the first wait did not spend.
// A run where the pick took 4.2 s left 800 ms for the other half.
//
// Measured on this machine 2026-08-31: the two slowest cases in this file take
// **2244 ms and 2211 ms in isolation**, so an isolated run already spends 45% of
// a 5000 ms budget. Under `pnpm verify` — which is where this actually failed,
// with the build and the lint chain competing for the same cores — that margin
// is gone. The suite alone never reproduces it: `npx jest` in this package
// passed 66/66 on the same tree minutes after `verify` failed this one file.
//
// 15000 is derived, not borrowed: 3× the `waitFor` ceiling it has to contain.
// The previous value was borrowed — the docblock below said 5000 because
// `PetDocumentScreen.test.tsx` used 5000 — and a number chosen by imitation is
// how both ceilings ended up equal.
jest.setTimeout(15_000);

/**
 * Render, pick a photo, land wherever the pick leads. The common opening move.
 *
 * The explicit `timeout` is load-bearing: this waits on a NEGATIVE (the
 * transient "Abriendo tus fotos…" label vanishing), and under a fully parallel
 * suite the default 1s ceiling was measured flaking — 2 of 11 on one full run,
 * 1 on the next, always these, always green in isolation.
 *
 * It stays at 5000 and the TEST ceiling moved instead — see the block above.
 * Raising this one again would recreate the equality that hid the real message.
 */
async function pickInto(result: ImagePickResult) {
  nextPick = result;
  render(<PetPhotoScreen publicToken={TOKEN} />);
  fireEvent.press(screen.getByText("Elegir una foto"));
  await waitFor(() => expect(screen.queryByText("Abriendo tus fotos…")).toBeNull(), {
    timeout: 5000,
  });
}

describe("the build without the module", () => {
  it("draws the callout naming the web, and no control at all", () => {
    // The default port — no `installPicker()`. The rule the claim screen set
    // for its scanner: a missing module is a sentence, never a dead button.
    render(<PetPhotoScreen publicToken={TOKEN} />);
    expect(screen.getByText("Todavía no se puede subir una foto desde la app")).toBeTruthy();
    expect(screen.queryByText("Elegir una foto")).toBeNull();
  });
});

describe("the pick", () => {
  it("lands an accepted photo on the REVIEW step, not in an upload", async () => {
    installPicker();
    await pickInto(aPick());

    expect(screen.getByText("¿Usar esta foto?")).toBeTruthy();
    expect(screen.getByLabelText("Vista previa de la mascota")).toBeTruthy();
    // NOTHING has been uploaded: the decision is the person's, and the bytes
    // have not cost them a byte of their plan yet.
    expect(mockTicket).not.toHaveBeenCalled();
  });

  it("says nothing about a cancelled pick", async () => {
    installPicker();
    await pickInto({ outcome: "cancelled" });

    expect(screen.getByText("Elegir una foto")).toBeTruthy();
    expect(screen.queryByText(/no pudimos/i)).toBeNull();
  });

  it("refuses an iPhone HEIC with the sentence naming the export fix", async () => {
    installPicker();
    await pickInto(aPick({ contentType: "image/heic" }));

    expect(screen.getByText(/HEIC/)).toBeTruthy();
    expect(screen.queryByText("¿Usar esta foto?")).toBeNull();
  });

  it("shows an honest box when the adapter offers no preview URI", async () => {
    installPicker();
    await pickInto(aPick({ previewUri: null }));

    expect(screen.getByText("Sin vista previa")).toBeTruthy();
    expect(screen.getByText("Usar esta foto")).toBeTruthy();
  });
});

describe("the upload", () => {
  it("walks ticket → PUT → confirm for THIS pet and ends on the server's answer", async () => {
    installPicker();
    await pickInto(aPick());
    fireEvent.press(screen.getByText("Usar esta foto"));

    await waitFor(() => expect(screen.getByText("Foto actualizada")).toBeTruthy());
    expect(mockTicket).toHaveBeenCalledWith({}, TOKEN, "image/jpeg");
    expect(mockPut).toHaveBeenCalledWith(ticket, expect.any(Blob), "image/jpeg");
    expect(mockConfirm).toHaveBeenCalledWith({}, TOKEN, STAGED);
  });

  it("says when the new photo REPLACED one, and when it did not", async () => {
    installPicker();
    mockConfirm.mockResolvedValue({
      outcome: "ok",
      payload: { photoUrl: "https://s.test/p.jpg", replacedPrevious: true },
    });
    await pickInto(aPick());
    fireEvent.press(screen.getByText("Usar esta foto"));

    await waitFor(() => expect(screen.getByText(/Reemplaza a la que estaba/)).toBeTruthy());
  });

  it("lands an EXPIRED ticket back on review, photo intact, promising a fresh permission", async () => {
    installPicker();
    mockPut.mockResolvedValue({ outcome: "expired" });
    await pickInto(aPick());
    fireEvent.press(screen.getByText("Usar esta foto"));

    await waitFor(() => expect(screen.getByText(/permiso venció/)).toBeTruthy());
    // The photo is still there and the retry is one tap — re-picking would
    // punish the person for the network's failure.
    expect(screen.getByText("Usar esta foto")).toBeTruthy();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("lands a dead PUT back on review naming the connection", async () => {
    installPicker();
    mockPut.mockResolvedValue({ outcome: "failed", detail: "HTTP 503" });
    await pickInto(aPick());
    fireEvent.press(screen.getByText("Usar esta foto"));

    await waitFor(() => expect(screen.getByText(/Revisá tu conexión/)).toBeTruthy());
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("shows the server's own sentence when confirm refuses the file", async () => {
    installPicker();
    mockConfirm.mockResolvedValue({
      outcome: "api-error",
      code: "photo_not_an_image",
      retryAfterSeconds: null,
    });
    await pickInto(aPick());
    fireEvent.press(screen.getByText("Usar esta foto"));

    // `photo_not_an_image`'s copy: the FILE is the problem, retrying the same
    // one cannot work — so the person is back where "Elegir otra" is.
    await waitFor(() => expect(screen.getByText(/no es una foto que podamos usar/)).toBeTruthy());
    expect(screen.getByText("Elegir otra")).toBeTruthy();
  });

  it("a second pick from review replaces the photo under consideration", async () => {
    installPicker();
    await pickInto(aPick());

    nextPick = aPick({ previewUri: "file:///cache/b.jpg", contentType: "image/png" });
    fireEvent.press(screen.getByText("Elegir otra"));

    await waitFor(() =>
      expect(screen.getByLabelText("Vista previa de la mascota").props.source).toEqual({
        uri: "file:///cache/b.jpg",
      }),
    );
  });
});
