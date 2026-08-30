// The IMAGE PICKER SEAM — everything this app can write without the EAS build.
//
// WHY A SEAM AND NOT AN IMPORT
// ---------------------------------------------------------------------------
// Choosing a photo needs `expo-image-picker`, which is a NATIVE module. Under
// `runtimeVersion: { policy: "fingerprint" }` (app.config.ts) adding one changes
// the fingerprint, which means a new EAS build and a store release — the
// pipeline the board records as six builds with five distinct root causes,
// three of them invisible to every local gate. That pipeline is PO-gated.
//
// So the module sits behind this port, the same arrangement
// `lib/observability/sink.ts` uses for the telemetry transport: an interface,
// a DEFAULT that says honestly that the module is not in this build, and one
// `setImagePickerPort()` call at app start the day the adapter exists. Every
// screen, state machine, error sentence and upload call is written and tested
// TODAY against this port; the only untestable-without-a-build code is the
// adapter itself, which is why it does not live in this repo yet — a static
// `import "expo-image-picker"` of a package that is not installed fails
// typecheck and Metro alike, so it CANNOT be committed ahead of the install.
// The adapter's full source, the install command and the build order are in
// `docs/mobile/camera-modules-handback.md`.
//
// WHAT AN ADAPTER MUST PROMISE (the contract the doc restates)
// ---------------------------------------------------------------------------
//   · `bytes` is the ENCODED IMAGE FILE, not raw pixels, and `contentType` is
//     what those bytes actually are. The pet-photo bucket accepts only
//     jpeg/png/webp (migration 0206) and the server re-checks the magic bytes
//     at `confirm`, so an adapter that hands over an iPhone HEIC unconverted
//     produces an upload the PUT refuses. The recommended adapter re-encodes
//     to JPEG via `expo-image-manipulator` — which also strips EXIF, closing
//     the known GPS leak a phone photo carries (the same leak the denuncia
//     work declared for HEIC on the web).
//   · `cancelled` is not an error. The person changed their mind.
//   · The default port answers `unavailable` and nothing else. A screen must
//     read `available` BEFORE offering a pick control, so nobody hunts for a
//     button that cannot work — the rule the claim screen already follows for
//     the scanner.
//
// `previewUri` is a device-local `file://` (or `content://`) URI the screen may
// hand to `<Image>` for a preview. It is display-only: the bytes that travel
// are `bytes`, never something re-read from the URI at upload time.

/** What one pick attempt produced. */
export type ImagePickResult =
  | {
      outcome: "picked";
      /** The encoded image file, ready to PUT. */
      bytes: Blob;
      /** What `bytes` actually are — the adapter's promise, re-checked by the screen. */
      contentType: string;
      /** Device-local URI for an `<Image>` preview, when the module offers one. */
      previewUri: string | null;
    }
  | { outcome: "cancelled" }
  /** The module is not in this build. The honest default's only answer. */
  | { outcome: "unavailable" }
  | { outcome: "failed"; detail: string };

export type ImagePickerPort = {
  /** Stable identifier, e.g. "module-missing" or "expo-image-picker". */
  readonly name: string;
  /**
   * Whether a pick can possibly succeed in this build. A screen reads this to
   * decide whether to DRAW the control at all — offering a button whose only
   * outcome is `unavailable` is the dead end this field exists to prevent.
   */
  readonly available: boolean;
  pickImage(): Promise<ImagePickResult>;
};

/**
 * The default: this build carries no image picker, and says so.
 *
 * NOT a no-op and NOT a promise — the `consoleSink` argument, verbatim: a
 * default that pretended to pick (or silently did nothing) would let a screen
 * ship a control that lies. `available: false` is the truthful answer to "can
 * this build choose a photo", and it stays the answer until an EAS build with
 * `expo-image-picker` ships and `setImagePickerPort()` runs at app start.
 */
export const moduleMissingImagePicker: ImagePickerPort = {
  name: "module-missing",
  available: false,
  pickImage: async () => ({ outcome: "unavailable" }),
};

let activePort: ImagePickerPort = moduleMissingImagePicker;

/**
 * Installs the process-wide port. Called once during app bootstrap
 * (`app/_layout.tsx`), by the wiring line the handback doc specifies.
 * Returns the port it replaced so a test can restore it.
 */
export function setImagePickerPort(port: ImagePickerPort): ImagePickerPort {
  const previous = activePort;
  activePort = port;
  return previous;
}

/** The currently installed port. */
export function getImagePickerPort(): ImagePickerPort {
  return activePort;
}

/** Restores the honest default. Primarily for tests. */
export function resetImagePickerPort(): void {
  activePort = moduleMissingImagePicker;
}
