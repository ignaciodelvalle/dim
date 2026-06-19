// shell-nav — the single auth-aware navigation decision for the unified
// AppShell (Item 7, spec §3 / D3 / D4 / D6 / D13).
//
// This is a PURE module: no React, no DB, no `headers()`, no async. It takes a
// plain description of the current request (who is logged in + the pathname +
// the role's nav source) and returns which shell variant to render, which nav
// to show, the guaranteed return target, and the context-switcher entitlements.
//
// Why it exists: today the public `(public)` layout hard-replaces the role nav
// with PUBLIC_NAV, so a logged-in owner who lands on `/adoptar` is *stranded* —
// the only way back is a truncated name chip that reads like "account", not
// "back to my pets". `resolveShellNav` fixes that: the nav is chosen by auth
// state, NOT by route-group. A public surface never replaces the role nav.
//
// Phase A note (strangler): this resolver is the decision core. The layouts are
// NOT migrated yet — they keep using LnOwnerNav / AppHeader / OpShell. Wiring
// happens in Phases B/C. Having the pure decision land first (with its tests)
// makes the later layout cut mechanical and low-risk.

import type { NavItem } from "@/components/layout/HeaderNav";
import { ADMIN_NAV, GOB_NAV, OWNER_NAV, PUBLIC_NAV } from "@/components/layout/nav-presets";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export type ShellVariant = "citizen" | "operator" | "landing";

/** A role recognised by the shell. Mirrors `profiles.role`. */
export type ShellRole = "owner" | "vet" | "govt" | "admin";

/**
 * Minimal session shape the resolver needs. The caller (a server layout) is
 * responsible for fetching this; the resolver stays pure and synchronous.
 */
export type ShellSession = {
  role: ShellRole;
  displayName: string;
  /**
   * Pre-built FLAT org nav for the active `/org/[orgToken]` context, when the
   * user is operating inside one. Supplied by the org layout via
   * `buildOrgNavFlat` (the sectioned `buildOrgNav` is for the rail renderer).
   */
  orgNav?: NavItem[];
  /**
   * True when the user holds at least one `govt_assignments` entitlement, i.e.
   * an admin who may also operate the `/gob` surface. Feeds the switcher (D6).
   */
  govtAssignments?: boolean;
  /**
   * Org tokens the user is a member of (for the citizen→org switcher). Only the
   * presence/identity is needed here; capability checks stay in the layout.
   */
  orgMemberships?: { token: string; name: string }[];
};

export type ShellNavInput = {
  /** Null when anonymous. */
  session: ShellSession | null;
  /** The current pathname (e.g. from `usePathname()` or the request URL). */
  pathname: string;
};

/** A single destination offered by the context switcher (D6). */
export type SwitcherTarget = {
  key: "citizen" | "gob" | "admin" | "org";
  label: string;
  href: string;
};

export type ShellNavResult = {
  /** Which shell chrome to render. */
  variant: ShellVariant;
  /** The flat nav to show. Empty for `landing`. */
  nav: NavItem[];
  /** Whether a guaranteed role-return affordance must be shown (D4). */
  showReturn: boolean;
  /** Where the return affordance points, when `showReturn` is true. */
  returnHref?: string;
  /** Context-switcher destinations — only entitled ones, never empty-rendered (D6). */
  switcher: SwitcherTarget[];
};

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

/** Operator route-group prefixes — these force the `operator` variant. */
const OPERATOR_PREFIXES = ["/gob", "/admin", "/org/"] as const;

/**
 * Token-landing surfaces (D13): credential / share / invite pages that must
 * render the minimal trust chrome, NOT the public browse chrome. This decision
 * is auth-independent — a logged-in owner scanning a QR still sees `landing`.
 *
 * Matched as `/p/<token>` (+ sub-actions), `/libreta/compartir/<token>`, and
 * `/r/invite/<token>`. Note the owner libreta surface is exactly `/libreta`
 * (browse), which must NOT match — only `/libreta/compartir/...` is a landing.
 */
export function isTokenLandingPath(pathname: string): boolean {
  if (pathname === "/p" || pathname.startsWith("/p/")) return true;
  if (pathname.startsWith("/libreta/compartir/")) return true;
  if (pathname === "/r/invite" || pathname.startsWith("/r/invite/")) return true;
  return false;
}

function isOperatorPath(pathname: string): boolean {
  return OPERATOR_PREFIXES.some((p) => pathname.startsWith(p));
}

/** The home surface for a given role (D5: the role's "Inicio"). */
function roleHome(role: ShellRole): string {
  switch (role) {
    case "owner":
    case "vet":
      return "/inicio";
    case "govt":
      return "/gob";
    case "admin":
      return "/admin";
  }
}

/**
 * The citizen nav for a personal role. owner + vet both navigate the citizen
 * world via OWNER_NAV (their personal pets surface). Institutional roles never
 * reach the citizen branch, so a single source is correct here; the parameter
 * is kept so a future vet-specific nav can diverge without a signature change.
 */
function citizenNavFor(_role: ShellRole): NavItem[] {
  return OWNER_NAV;
}

// ---------------------------------------------------------------------------
// Context switcher (D6)
// ---------------------------------------------------------------------------

/**
 * Build the entitlement-filtered context-switcher destinations (D6). Exported
 * so a future `ContextSwitcher` component (Phase B) can reuse the exact same
 * entitlement logic without re-deriving it. Returns `[]` for a single-context
 * user — the caller renders nothing in that case.
 */
export function buildSwitcher(session: ShellSession | null): SwitcherTarget[] {
  if (!session) return [];

  const targets: SwitcherTarget[] = [];
  const { role, govtAssignments, orgMemberships } = session;

  const isOperatorRole = role === "govt" || role === "admin";

  // From an operator context, always offer a way back to the citizen world.
  if (isOperatorRole) {
    targets.push({
      key: "citizen",
      label: "Volver a ciudadano",
      href: "/mis-mascotas",
    });
  }

  // admin ⇄ gob: an admin who also holds govt assignments may hop to /gob.
  if (role === "admin" && govtAssignments) {
    targets.push({ key: "gob", label: "Ir a Gobierno", href: "/gob" });
  }

  // owner/vet who belongs to one or more orgs may hop into the org operator
  // surface. Only entitled orgs are listed.
  if ((role === "owner" || role === "vet") && orgMemberships?.length) {
    for (const m of orgMemberships) {
      targets.push({
        key: "org",
        label: m.name,
        href: `/org/${m.token}`,
      });
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export function resolveShellNav(input: ShellNavInput): ShellNavResult {
  const { session, pathname } = input;
  const switcher = buildSwitcher(session);

  // D13 — token-landing wins over everything, regardless of auth state.
  if (isTokenLandingPath(pathname)) {
    return {
      variant: "landing",
      nav: [],
      // A logged-in user still gets a discreet "back to my app"; an anon user
      // gets no return (there is nowhere to return to).
      showReturn: Boolean(session),
      returnHref: session ? roleHome(session.role) : undefined,
      switcher,
    };
  }

  // Anonymous — citizen browse chrome with the public nav.
  if (!session) {
    return {
      variant: "citizen",
      nav: PUBLIC_NAV,
      showReturn: false,
      switcher,
    };
  }

  const { role } = session;
  const onOperatorPath = isOperatorPath(pathname);

  // Institutional roles (govt/admin) live in the operator variant. They keep it
  // even when they wander onto a public browse surface — they don't "fall" to
  // citizen-public; instead they get an explicit return (D3, §3 last bullet).
  if (role === "govt" || role === "admin") {
    const nav = role === "admin" ? ADMIN_NAV : GOB_NAV;
    if (onOperatorPath) {
      return { variant: "operator", nav, showReturn: false, switcher };
    }
    // Operator stranded on a public surface → keep operator chrome, offer a
    // return to the citizen world (their personal escape hatch).
    return {
      variant: "operator",
      nav,
      showReturn: true,
      returnHref: "/mis-mascotas",
      switcher,
    };
  }

  // Personal roles operating inside an org context use the operator rail with
  // the supplied org nav (D1: operator variant absorbs the org chrome).
  if (onOperatorPath && pathname.startsWith("/org/") && session.orgNav) {
    return {
      variant: "operator",
      nav: session.orgNav,
      showReturn: true,
      returnHref: "/mis-mascotas",
      switcher,
    };
  }

  // Personal role on any non-operator surface — including public browse pages.
  // THE STRANDED-USER FIX (D3/D4): the role nav is kept, never replaced by
  // PUBLIC_NAV, and a guaranteed 1-click return to the role home is present
  // whenever the user is off their own home surface.
  const home = roleHome(role);
  const offHome = !(pathname === home || pathname.startsWith(`${home}/`));
  return {
    variant: "citizen",
    nav: citizenNavFor(role),
    showReturn: offHome,
    returnHref: offHome ? home : undefined,
    switcher,
  };
}
