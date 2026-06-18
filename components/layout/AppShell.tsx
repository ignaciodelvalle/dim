import type { ReactNode } from "react";

import { AppFooter } from "./AppFooter";
import { GobStripe } from "./GobStripe";

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
      {/* Thin Argentina institutional stripe (D7). */}
      <GobStripe />
      {masthead}
      <main id="main-content" className="flex-1 overflow-auto">
        {maxWidth ? <div className={`${maxWidth} mx-auto`}>{children}</div> : children}
      </main>
      {footer ?? <AppFooter />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// operator — navy control-room rail + topbar, no stripe / no footer
// ---------------------------------------------------------------------------

function OperatorShell({ rail, topbar, maxWidth, children }: OperatorProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-ln-op-page text-ln-op-ink text-[13px] leading-[1.45] [&_*]:box-border">
      {rail}
      <main id="main-content" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {topbar}
        <div className="flex-1 overflow-auto px-6 py-[22px]">
          {maxWidth ? <div className={`${maxWidth} mx-auto`}>{children}</div> : children}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// landing — minimal trust chrome for token-landing surfaces (D13)
// ---------------------------------------------------------------------------

function LandingShell({ returnSlot, children }: LandingProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-ln-paper)] text-[var(--color-ln-ink)]">
      <GobStripe />
      <header className="flex items-center gap-3 border-b border-ln-line bg-white px-4 py-3 md:px-6">
        <span className="text-lg font-bold text-ln-azul">MiMAR</span>
        <span className="hidden text-xs text-ln-mute sm:inline">
          Credencial verificada por MiMAR
        </span>
        {/* Discreet "back to my app" — present only for logged-in viewers (D13). */}
        {returnSlot && <div className="ml-auto">{returnSlot}</div>}
      </header>
      <main id="main-content" className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
