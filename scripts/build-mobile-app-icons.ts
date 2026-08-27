// Generates the Expo client's launcher, adaptive and splash images from the ONE
// brand mark this project has.
//
// Run with: pnpm mobile:icons
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SCRIPT AND NOT THREE HAND-DRAWN FILES
// ---------------------------------------------------------------------------
// The mark already exists. `public/logo-dim.png` is the fingerprint oval with
// the dog and the cat inside it, and `public/icons/icon-512*.png` are the PWA
// icons already generated from it — the same picture a user sees when they
// install the web app to their home screen. The phone app must be that picture
// and not a second one, because two marks is a brand problem no amount of
// tooling fixes later.
//
// So nothing here is drawn. Everything is COMPOSED, from one source, by a
// recipe that is readable and re-runnable. What would otherwise be three opaque
// binaries "somebody made in Figma once" is instead three binaries whose
// provenance is fifty lines of arithmetic.
//
// The outputs ARE committed. EAS Build and CI both run `pnpm install
// --frozen-lockfile` and then read the config; neither runs this script, and a
// build that regenerated its own icons would be a build whose icons depend on
// which version of sharp the runner resolved. Committed pixels; reproducible
// recipe. Re-run it when the mark changes, and only then.
//
// ---------------------------------------------------------------------------
// THE NUMBERS, AND WHERE THEY CAME FROM
// ---------------------------------------------------------------------------
// Not invented — MEASURED off the shipped PWA icons, so the phone icon and the
// installed-PWA icon are the same composition and not merely the same artwork:
//
//   public/icons/icon-512.png           mark occupies 393 of 512 px  → 76.8%
//   public/icons/icon-512-maskable.png  mark occupies 294 of 512 px  → 57.4%
//
// THOSE ARE INK MEASUREMENTS, WHICH IS WHY THE SOURCE IS TRIMMED FIRST. Getting
// the mechanism behind that sentence right has now taken THREE authors, so the
// wrong answers are kept next to the right one — a corrected paragraph that
// deletes its own history is a paragraph the next reader gets wrong the same way.
//
//   ATTEMPT 1 (wrong): "both numbers came from trimming the PWA icon to its
//     non-transparent bounding box". Alpha is 255 at every pixel of both icons,
//     so their non-transparent bounding box IS the 512×512 canvas. A trim on
//     alpha could not produce 393 or 294.
//   ATTEMPT 2 (also wrong, 2026-08-26): "sharp trims on ALPHA when an alpha
//     channel is present, so `trim()` returns 512×512 and the numbers require an
//     explicit `{ background: '#FBFAF5', threshold: 10 }`". The first half is
//     false and the second half is redundant. Both icons DO carry an alpha
//     channel (`channels: 4`, `hasAlpha: true`) — they are opaque, not
//     alpha-less — and plain `trim()` on them does not return 512×512.
//
// WHAT SHARP ACTUALLY DOES, measured against the locked sharp 0.34.5 /
// libvips 8.17.3 before this paragraph was written:
//
//   sharp("public/icons/icon-512.png").trim()          → 393×286
//   sharp("public/icons/icon-512-maskable.png").trim() → 294×215
//   sharp("public/logo-dim.png").trim()                → 610×443
//
// ONE RULE, NOT TWO: default `trim()` trims against the TOP-LEFT PIXEL — its
// colour and its alpha together — at a default threshold of 10. It is not an
// alpha trim that happens to work on transparent images; alpha is just one of
// the channels it compares. This is what sharp documents for `trim()`'s
// `background` option ("defaults to that of the top-left pixel"), and the three
// measurements above are what confirmed it on THESE files rather than in
// general — both halves stated, because attempts 1 and 2 each had a plausible
// rule and neither had a measurement. That single rule explains all three lines
// above, and the corner pixels are why:
//
//   icon-512.png           top-left #FBFAF5, alpha 255  → trims the cream field
//   icon-512-maskable.png  top-left #FBFAF5, alpha 255  → trims the cream field
//   logo-dim.png           top-left #FFFFFF, alpha 0    → trims the transparency
//
// SO THE DEFAULT ALREADY YIELDS THE INK NUMBERS, and `{ background: "#FBFAF5",
// threshold: 10 }` is REDUNDANT on the icons rather than required: it names the
// colour the default would have inferred, and 10 is the default threshold. It is
// worse than redundant on the source mark — `sharp("public/logo-dim.png")
// .trim({ background: "#FBFAF5", threshold: 10 })` returns 637×463, the whole
// untrimmed canvas, because the mark's border is transparent and not cream.
// Attempt 2's "fix" would have destroyed the one trim this script actually runs.
//
// THRESHOLD MATTERS AND IS THE DEFAULT, which is the one thing worth pinning:
// at `threshold: 1` the same two files measure 394×288 and 296×217, at 50 they
// measure 392×286 and 294×214. 393 and 294 are the threshold-10 answers, so the
// reproducing recipe is bare `trim()` and nothing else.
//
// THE NUMBERS WERE ALWAYS RIGHT through all three attempts. What kept going
// wrong is a reflex worth naming, because it is what a plausible mechanism does
// to a reader: "the file has transparency, sharp trims transparency" is a rule
// that predicts the right answer on `logo-dim.png` and the wrong one on the
// icons, and both authors checked it against the file where it works.
//
// Either way all three figures describe how much of the canvas the ARTWORK
// covers, not how wide a rectangle containing it is. `public/logo-dim.png` is
// 637×463 with the oval painted across 610×443 of that, off-centre inside its
// own frame: 27px of transparent margin distributed unevenly.
//
// Scaling the untrimmed rectangle to those ratios therefore did two wrong
// things at once, and the test caught both. The ink came out SMALLER than the
// PWA icons it was supposed to match (the margin ate the difference), and
// centring the rectangle left the ink 10px off-centre — which on an adaptive
// icon is 10px of asymmetry inside a mask that assumes none. So every recipe
// below composes the TRIMMED mark, and `markWidth` means the width of the
// artwork, exactly as measured.
//
// The maskable ratio is the one Android's adaptive icon needs. Android composes
// a launcher icon from a foreground and a background layer, then lets the OEM
// mask it to whatever shape that launcher uses — circle, squircle, teardrop,
// rounded square. Only the CENTRE 66.6% of the layer is guaranteed to survive
// the mask; the rest is parallax margin the launcher may crop at will. 57.4%
// sits comfortably inside that, which is exactly why the maskable PWA icon was
// drawn to it.
//
// THE ONE PLACE PIXELS ARE INVENTED: the trimmed mark is 610×443, and a store
// icon must be 1024×1024. At 76.8% the mark lands at 786px wide — a 1.29×
// upscale, i.e. roughly a quarter of the pixels in the launcher icon are Lanczos
// interpolation. On a fingerprint, whose entire subject is fine parallel lines,
// that is the worst possible thing to interpolate. It is accepted here because
// the alternative is worse (a second, "cleaner" mark that does not match the
// web), and it is recorded here because the real fix is a vector or a
// higher-resolution scan of the original, not a better resampling filter. If
// one ever arrives, drop it in as SOURCE and re-run; nothing else changes.
//
// The other two outputs DOWNSCALE (588 from 610), which is why the splash
// deliberately reuses the adaptive icon's composition instead of getting its
// own larger one.
//
// ---------------------------------------------------------------------------
// WHY THERE IS NO adaptive-icon-background.png
// ---------------------------------------------------------------------------
// Android's adaptive icon takes two layers, and this script emits one. The
// background is declared in app.json as `adaptiveIcon.backgroundColor:
// "#fbfaf5"` — a flat paper fill — and that is a decision, not a shortcut.
//
// A background PNG buys exactly one thing: art that is not a flat colour. This
// brand's ground IS a flat colour; the identity is the mark, and every surface
// in both clients sits on `--color-ln-paper`. So the PNG would carry no
// information a hex string does not, and would cost three things that are not
// hypothetical:
//
//   1. A second file to keep in sync with the token when the paper ever moves.
//      A hex string in app.json is greppable and sits next to the foreground
//      it pairs with; a PNG's colour is invisible until somebody opens it.
//   2. Banding. Android scales and masks the background layer per launcher, and
//      a flat fill delivered as 8-bit PNG through that pipeline can band where
//      a declared colour cannot — the OS fills it exactly.
//   3. Weight in every APK, for a rectangle.
//
// The moment the background stops being a flat colour, it becomes a PNG and it
// becomes a fourth recipe below. Until then, the colour is the honest form.
//
// ---------------------------------------------------------------------------
// WHY THERE IS NO DARK SPLASH
// ---------------------------------------------------------------------------
// `expo-splash-screen` takes a `dark` variant. This app declares none, and that
// matches the product rather than skipping work: the design system is
// light-only by decision — `app/globals.css` disables dark mode outright and
// `pnpm lint:tokens` fails the build on any `dark:` prefix. The credential is a
// paper document; it does not have a night mode on the web and must not acquire
// one on the phone, least of all on the first screen a user sees.
//
// (`userInterfaceStyle: "automatic"` in app.json predates this work unit and
// disagrees with the above. Left alone here — changing it is a UI decision, not
// a release-plumbing one — but it is worth someone's attention.)
//
// ---------------------------------------------------------------------------
// WHY THE MARK IS NOT RECOLOURED
// ---------------------------------------------------------------------------
// It is black on transparent, and the animal silhouettes inside it are KNOCKED
// OUT — they are holes, not white paint. So whatever sits behind the mark shows
// through them. Every output below puts Libreta Nacional paper (#fbfaf5,
// `--color-ln-paper`) behind it, which is why the dog reads as cream in all
// three and matches the web icon exactly.
//
// The ink is pure #000 rather than the palette's `--color-ln-ink` (#1b2a33).
// That is the mark as it exists, and adjusting it here would make this file a
// second opinion about the brand — the exact failure `apps/mobile/src/ui/theme.ts`
// was rewritten to stop committing. If the mark should be ink, the mark should
// be ink, and that is one edit to one PNG upstream of this script.

import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/** Repo root, from `scripts/`. */
const ROOT = path.resolve(import.meta.dirname, "..");

/** The single home of the brand mark. */
const SOURCE = path.join(ROOT, "public", "logo-dim.png");

const OUT_DIR = path.join(ROOT, "apps", "mobile", "assets");

/**
 * `--color-ln-paper`, restated as a literal.
 *
 * NOT imported from `@dim/contract/tokens`: this script runs under tsx from the
 * repo root, the token module is an ESM workspace package, and buying that
 * resolution for one hex string is not worth it.
 *
 * BE HONEST ABOUT WHAT GUARDS IT, WHICH IS NOT MUCH. `pnpm lint:token-parity`
 * fences `--color-ln-paper` between app/globals.css and the contract; it has
 * never heard of this file. `release-config.test.ts` asserts that app.json's
 * two `#fbfaf5` literals match each other, so the ground under the mark and the
 * adaptive background cannot diverge — but all three of those literals could
 * drift away from the token together and nothing would notice.
 *
 * That is a small, contained risk (paper has not moved since the Libreta
 * Nacional handoff, and a wrong ground is visible on the first launch), and the
 * fix if it stops being small is a fence, not a comment. Do not read this
 * paragraph as saying the value is protected.
 */
const PAPER = { r: 0xfb, g: 0xfa, b: 0xf5, alpha: 1 } as const;

/** The measured ratios. See the header. */
const RATIO_LAUNCHER = 393 / 512;
const RATIO_MASKABLE = 294 / 512;

/** Store icon canvas. Non-negotiable: both stores want 1024×1024. */
const CANVAS = 1024;

/**
 * Google Play's feature graphic. Also non-negotiable, and unlike the icon
 * canvas it is NOT square — 1024×500, the only LANDSCAPE output this script
 * produces. Play rejects anything else outright, PNG or JPEG, ≤15 MB.
 */
const FEATURE_GRAPHIC_WIDTH = 1024;
const FEATURE_GRAPHIC_HEIGHT = 500;

type Recipe = {
  readonly file: string;
  readonly what: string;
  /**
   * Canvas the mark is centred on, or `null` (both fields) to crop tight to
   * the mark. Two fields rather than one square number because the feature
   * graphic below is not square — width and height diverge for it.
   */
  readonly canvasWidth: number | null;
  readonly canvasHeight: number | null;
  /**
   * How the mark is resized onto that canvas: `sharp` derives the other axis
   * from the source aspect ratio either way, so this is just which axis is
   * the BINDING one. For the three square outputs it is `width` — on a
   * square canvas either axis gives the same answer, so `width` was picked
   * arbitrarily. It stops being arbitrary for the feature graphic: 1024×500
   * is wide and short, height (500) is the dimension that runs out first, and
   * sizing off width there would either overflow the canvas or require a
   * second, undocumented shrink to compensate.
   */
  readonly markSize: { readonly by: "width" | "height"; readonly px: number };
  /** `null` means a transparent ground. */
  readonly ground: typeof PAPER | null;
};

const RECIPES: readonly Recipe[] = [
  {
    file: "icon.png",
    what: "iOS app icon and the Android legacy/fallback launcher icon",
    canvasWidth: CANVAS,
    canvasHeight: CANVAS,
    markSize: { by: "width", px: Math.round(CANVAS * RATIO_LAUNCHER) },
    // OPAQUE, and this is a hard requirement rather than a preference: the App
    // Store rejects an icon with an alpha channel outright, and Android's
    // legacy launcher composites it over an unknown ground. Paper is also what
    // the knocked-out silhouettes need behind them to read at all.
    ground: PAPER,
  },
  {
    file: "adaptive-icon-foreground.png",
    what: "Android adaptive icon, foreground layer",
    canvasWidth: CANVAS,
    canvasHeight: CANVAS,
    markSize: { by: "width", px: Math.round(CANVAS * RATIO_MASKABLE) },
    // TRANSPARENT on purpose. The background layer is a flat paper fill
    // declared in app.json as `backgroundColor` — see the note there for why a
    // colour and not a second PNG.
    ground: null,
  },
  {
    file: "splash-icon.png",
    what: "expo-splash-screen image",
    // Tight crop, no canvas. expo-splash-screen renders this at `imageWidth`
    // dp; padding baked into the file would just shrink the mark inside its own
    // declared width and force a compensating number in the config.
    canvasWidth: null,
    canvasHeight: null,
    markSize: { by: "width", px: Math.round(CANVAS * RATIO_MASKABLE) },
    ground: null,
  },
  {
    file: "feature-graphic.png",
    what: "Google Play Store listing feature graphic",
    canvasWidth: FEATURE_GRAPHIC_WIDTH,
    canvasHeight: FEATURE_GRAPHIC_HEIGHT,
    // RATIO_LAUNCHER, not RATIO_MASKABLE: this graphic answers to nobody's
    // safe-zone mask, so there is no 66.6%-survives-the-crop ceiling pulling
    // it down to the maskable ratio. It is a marketing surface arguing for
    // the credential's identity at a glance, which is what the full-bleed
    // icon ratio is FOR — reusing it here is reusing a measurement, not
    // inventing a new fraction for this one canvas.
    //
    // Sized BY HEIGHT (500px), the binding dimension of a 1024×500 rectangle:
    // 500 × 0.768 ≈ 384px of mark height, which at the source's 610:443 ink
    // ratio comes out to roughly 529px wide — comfortably inside the 1024px
    // canvas, with margin on the left and right rather than the mark
    // spanning edge to edge.
    markSize: { by: "height", px: Math.round(FEATURE_GRAPHIC_HEIGHT * RATIO_LAUNCHER) },
    // OPAQUE. Play's feature graphic spec requires no alpha channel — same
    // requirement as icon.png above, different store. See the fence in
    // release-config.test.ts for why this one additionally cannot borrow the
    // adaptive icon's or splash's transparent posture: THIS asset is Play's,
    // and Play's rule, not this app's convention, governs it.
    ground: PAPER,
  },
];

async function main(): Promise<void> {
  const meta = await sharp(SOURCE).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read dimensions from ${SOURCE}`);
  }

  // THE TRIM IS THE FIRST OPERATION, and everything downstream measures against
  // its result rather than against the file. See "THOSE ARE INK MEASUREMENTS"
  // in the header: the mark is painted off-centre inside its own frame, so the
  // rectangle's dimensions and its centre are both the wrong thing to compose
  // with.
  //
  // Threshold 10 rather than 0: the source's margin is not perfectly clean, and
  // a handful of near-transparent stray pixels would otherwise defeat the trim
  // entirely and silently — the failure would be a mark 27px smaller than
  // intended, which nobody sees on a phone.
  //
  // WRITTEN OUT EVEN THOUGH 10 IS ALSO SHARP'S DEFAULT (measured, 0.34.5: bare
  // `trim()` reproduces the threshold-10 result on all three files the header
  // cites, and differs at 1 and at 50). The explicit value is a pin, not an
  // override: a default that changes in a minor release would move the ink
  // measurement under a script whose whole claim is that its outputs are
  // reproducible. What is NOT passed is `background` — the default compares
  // against the top-left pixel, which on this file is transparent, and naming
  // the icons' cream `#FBFAF5` here would return the untrimmed 637×463.
  const trimmed = await sharp(SOURCE).trim({ threshold: 10 }).png().toBuffer();
  const ink = await sharp(trimmed).metadata();
  if (!ink.width || !ink.height) {
    throw new Error(`Could not measure the trimmed mark from ${SOURCE}`);
  }

  console.log(
    `source: ${path.relative(ROOT, SOURCE)} — ${meta.width}×${meta.height}, ` +
      `ink ${ink.width}×${ink.height} after trim`,
  );
  mkdirSync(OUT_DIR, { recursive: true });

  for (const recipe of RECIPES) {
    // Only ONE axis is ever passed to `resize` — sharp derives the other from
    // the source aspect ratio. The mark is landscape and squashing it by a
    // rounding pixel is the one distortion nobody would notice until it was
    // on 12 phones. Which axis is passed is `markSize.by`; see the Recipe
    // type for why that stops being arbitrary once the canvas is not square.
    const mark = await sharp(trimmed)
      .resize(
        recipe.markSize.by === "width"
          ? { width: recipe.markSize.px, kernel: "lanczos3" }
          : { height: recipe.markSize.px, kernel: "lanczos3" },
      )
      .png()
      .toBuffer();

    const out = path.join(OUT_DIR, recipe.file);
    const scaleBasis = recipe.markSize.by === "width" ? ink.width : ink.height;
    const scale = recipe.markSize.px / scaleBasis;
    const scaleLabel = scale >= 1 ? `↑${scale.toFixed(2)}×` : `↓${scale.toFixed(2)}×`;

    if (recipe.canvasWidth === null || recipe.canvasHeight === null) {
      await sharp(mark).png({ compressionLevel: 9 }).toFile(out);
    } else {
      let canvas = sharp({
        create: {
          width: recipe.canvasWidth,
          height: recipe.canvasHeight,
          channels: 4,
          background: recipe.ground ?? { r: 0, g: 0, b: 0, alpha: 0 },
        },
      }).composite([{ input: mark, gravity: "centre" }]);

      // THE ALPHA CHANNEL IS DROPPED, NOT MERELY FILLED. App Store Connect
      // rejects an app icon that HAS an alpha channel — it does not look at
      // whether every pixel in it happens to be opaque, which is what a
      // composite over a solid ground produces. Two separate calls because
      // they answer two separate questions: `flatten` decides what shows
      // through the knocked-out silhouettes, `removeAlpha` decides how many
      // channels the file declares.
      if (recipe.ground !== null) {
        canvas = canvas.flatten({ background: recipe.ground }).removeAlpha();
      }

      await canvas.png({ compressionLevel: 9 }).toFile(out);
    }

    // Reported from the file on disk, never from the intent above it: `resize`
    // rounds the derived height, and a log that prints the requested number is
    // a log that cannot tell you it got something else.
    const written = await sharp(out).metadata();
    console.log(
      `  ${recipe.file.padEnd(30)} ${written.width}×${written.height}` +
        `  mark ${recipe.markSize.px}px-${recipe.markSize.by} ${scaleLabel}` +
        `  alpha=${written.hasAlpha}  ${recipe.what}`,
    );
  }

  console.log(`\nwrote ${RECIPES.length} file(s) to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
