import type { ReactNode } from "react";

import { AppFooter } from "./AppFooter";
import { GobStripe } from "./GobStripe";
import { ScrollReset } from "./ScrollReset";

/**
 * AppShell — the single, role-variant application chrome (Item 7, spec §3).
 *
 * One shell, three variants, replacing the three legacy chrome systems
 * (`LnOwnerNav` / `AppHeader` / `OpShell`):
 *
 *   - `citizen`  → top horizontal masthead. Owner + public + public-logged-in.
 *                  Carries the thin Argentina institutional stripe (D7) and a
 *                  minimal footer (D9).
 *   - `operator` → left navy control-room rail + topbar. gob / admin / org.
 *                  No stripe, no footer (D7/D9). Absorbs OpShell/OpRail/OpTopbar.
 *   - `landing`  → minimal trust chrome for token-landing surfaces (D13):
 *                  brand + stripe + "Credencial verificada por MiMAR", and NO
 *                  browse nav / footer. Protects the scan→action moment.
 *
 * STRANGLER (Phase A): this component defines the structural contract for all
 * three variants and is wired on a LIMITED surface alongside the old chromes.
 * The legacy layouts are migrated onto it in Phases B/C, and the old chromes
 * are deleted in Phase D. AppShell is intentionally presentational: the
 * auth-aware decision of WHICH variant + nav to render lives in
 * `lib/shell-nav.ts` (`resolveShellNav`), which the caller invokes first.
 *
 * Server component. Any client interactivity (active-state nav, mobile drawer,
 * context switcher) lives in the slotted children, not here.
 */

type CommonProps = {
  children: ReactNode;
};

type CitizenProps = CommonProps & {
  variant: "citizen";
  /** The masthead element (brand + role/public nav + switcher + user). */
  masthead: ReactNode;
  /** Optional footer override; defaults to the minimal AppFooter (D9). */
  footer?: ReactNode;
  /** Optional max-width for the main content wrapper. */
  maxWidth?: string;
};

type OperatorProps = CommonProps & {
  variant: "operator";
  /** The left rail element (brand + sectioned nav + user). */
  rail: ReactNode;
  /** The sticky topbar element (crumbs + scope + switcher + user). */
  topbar: ReactNode;
  /**
   * Optional full-width banner rendered INSIDE the 100vh shell, above the
   * rail+main row (e.g. the demo-mode banner). Keeping it inside the shell —
   * rather than as a sibling above it — means the document stays exactly 100vh
   * (no external scroll, no clipped rail footer). PR-1 V1.
   */
  banner?: ReactNode;
  /** Optional max-width for the scroll-area inner wrapper. */
  maxWidth?: string;
};

type LandingProps = CommonProps & {
  variant: "landing";
  /**
   * Optional discreet "back to my app" return for a logged-in viewer (D13).
   * Anonymous viewers pass nothing.
   */
  returnSlot?: ReactNode;
};

type AppShellProps = CitizenProps | OperatorProps | LandingProps;

export function AppShell(props: AppShellProps) {
  switch (props.variant) {
    case "operator":
      return <OperatorShell {...props} />;
    case "landing":
      return <LandingShell {...props} />;
    case "citizen":
      return <CitizenShell {...props} />;
  }
}

// ---------------------------------------------------------------------------
// citizen — top masthead + institutional stripe + minimal footer
// ---------------------------------------------------------------------------

function CitizenShell({ masthead, footer, maxWidth, children }: CitizenProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-ln-paper)] text-[var(--color-ln-ink)]">
      {/* Skip-link: visually hidden until focused; first focusable element (a11y). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded focus:bg-ln-azul focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      {/* Thin Argentina institutional stripe (D7). */}
      <GobStripe />
      {masthead}
      {/* pb-safe: keep the last content row clear of the iOS home indicator
          now that viewport-fit=cover lets the PWA draw under it. */}
      <main id="main-content" data-scroll-reset className="pb-safe flex-1 overflow-auto">
        <ScrollReset />
        {maxWidth ? <div className={`${maxWidth} mx-auto`}>{children}</div> : children}
      </main>
      {footer ?? <AppFooter />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// operator — navy control-room rail + topbar, no stripe / no footer
// ---------------------------------------------------------------------------

function OperatorShell({ rail, topbar, banner, maxWidth, children }: OperatorProps) {
  return (
    // Viewport-locked column: `fixed inset-0` pins the operator chrome to the
    // viewport and takes it OUT of document flow, so the document itself can
    // never scroll (the inner area scrolls instead). Scoped to the operator
    // shell — citizen/landing surfaces keep normal body-level scrolling.
    // Optional banner on top; the rail+main row fills the rest (min-h-0 so the
    // inner scroll area — not the document — scrolls).
    <div className="op-surface fixed inset-0 flex flex-col overflow-hidden bg-ln-op-page text-ln-op-ink text-[13px] leading-[1.45] [&_*]:box-border">
      {/* Skip-link: visually hidden until focused; first focusable element (a11y). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded focus:bg-ln-azul focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      {banner}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {rail}
        <main id="main-content" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {topbar}
          <div data-scroll-reset className="min-h-0 flex-1 overflow-auto px-6 py-[22px]">
            <ScrollReset />
            {maxWidth ? <div className={`${maxWidth} mx-auto`}>{children}</div> : children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// landing — minimal trust chrome for token-landing surfaces (D13)
// ---------------------------------------------------------------------------

function LandingShell({ returnSlot, children }: LandingProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-ln-paper)] text-[var(--color-ln-ink)]">
      {/* Skip-link: visually hidden until focused; first focusable element (a11y). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded focus:bg-ln-azul focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      <GobStripe />
      {/* pt-safe: QR-scan landings open full-screen in the installed PWA too —
          keep the trust header clear of the notch/status bar. */}
      <header className="pt-safe flex items-center gap-3 border-b border-ln-line bg-white px-4 py-3 md:px-6">
        <span className="text-lg font-bold text-ln-azul">MiMAR</span>
        <span className="hidden text-xs text-ln-mute sm:inline">
          Credencial verificada por MiMAR
        </span>
        {/* Discreet "back to my app" — present only for logged-in viewers (D13). */}
        {returnSlot && <div className="ml-auto">{returnSlot}</div>}
      </header>
      <main id="main-content" data-scroll-reset className="pb-safe flex-1 overflow-auto">
        <ScrollReset />
        {children}
      </main>
    </div>
  );
}
