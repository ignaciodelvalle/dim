import type { ReactNode } from "react";
import { LnGuilloche } from "./DocElements";

/**
 * Libreta Nacional App Shell.
 *
 * LnMasthead — azul-900 institutional header bar:
 *   [crest] [wordmark (serif + mono)] [nav slot] — [bell + badge] [avatar + username]
 *   Compact/mobile: nav and username are hidden.
 *
 * LnSubBar   — white breadcrumb strip below masthead:
 *   [breadcrumb (mono)] — [doc code (mono, right-aligned)]
 *
 * LnShell    — full page shell composing Guilloche + Masthead + SubBar + body.
 *
 * All three are presentational. Nav items are passed as props; nothing is
 * wired to routing or authentication state.
 *
 * Uses ln-* semantic tokens from globals.css @theme.
 * Safe in components/ui/ (excluded from lint:tokens guard).
 */

// ---------- Nav item type -------------------------------------------------

export type LnNavItem = {
  key: string;
  label: string;
  href: string;
  active?: boolean;
};

// ---------- Masthead ------------------------------------------------------

export type LnMastheadProps = {
  /** Crest letter or element. Default: "R" */
  crest?: ReactNode;
  /** Primary wordmark line (serif bold). Default: "Libreta Nacional" */
  wordmark?: string;
  /** Mono sub-line below the wordmark. Default: "REGISTRO SANITARIO" */
  wordmarkSub?: string;
  /** Navigation items (hidden on compact/mobile). */
  nav?: LnNavItem[];
  /** Notification count shown on the bell badge. Hidden when 0 or undefined. */
  notificationCount?: number;
  /** Avatar initials (1–2 chars). */
  avatarInitials?: string;
  /** Username shown next to the avatar (hidden on compact/mobile). */
  userName?: string;
  /** When true, hides nav items and username (compact/mobile layout). */
  compact?: boolean;
  className?: string;
};

export function LnMasthead({
  crest = "R",
  wordmark = "Libreta Nacional",
  wordmarkSub = "REGISTRO SANITARIO",
  nav = [],
  notificationCount = 0,
  avatarInitials = "U",
  userName,
  compact = false,
  className = "",
}: LnMastheadProps) {
  return (
    <header
      className={[
        "flex flex-shrink-0 items-center gap-[18px] bg-[var(--color-ln-azul-900)] px-[32px] py-[12px] text-white",
        compact ? "px-[16px]" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Crest */}
      <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full border-[2px] border-white/50 bg-white/[0.06] font-[var(--font-ln-serif)] text-[17px] font-semibold tracking-[-0.02em]">
        {crest}
      </div>

      {/* Wordmark */}
      <div className="flex-shrink-0 leading-[1.1]">
        <span className="block font-[var(--font-ln-serif)] text-[19px] font-semibold tracking-[-0.01em]">
          {wordmark}
        </span>
        <span className="block font-[var(--font-ln-mono)] text-[9.5px] uppercase tracking-[.22em] text-[var(--color-ln-celeste)]">
          {wordmarkSub}
        </span>
      </div>

      {/* Nav (hidden in compact mode) */}
      {!compact && nav.length > 0 && (
        <nav aria-label="Navegación principal" className="ml-[24px] flex gap-[4px]">
          {nav.map((item) => (
            <a
              key={item.key}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={[
                "rounded-[4px] px-[14px] py-[8px] text-[13px] font-medium tracking-[.01em] no-underline transition-colors",
                item.active
                  ? "bg-white/10 text-white shadow-[inset_0_-2px_0_var(--color-ln-celeste)]"
                  : "text-white/72 hover:text-white",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-[16px]">
        {/* Bell */}
        <div className="relative text-white/80 text-base">
          <span
            aria-label={`Notificaciones${notificationCount > 0 ? `: ${notificationCount}` : ""}`}
          >
            🔔
          </span>
          {notificationCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-[7px] -top-[6px] min-w-[15px] rounded-full bg-[var(--color-ln-celeste)] px-[4px] text-center font-[var(--font-ln-mono)] text-[9px] font-bold leading-[15px] text-[var(--color-ln-azul-900)]"
            >
              {notificationCount}
            </span>
          )}
        </div>

        {/* Avatar + username */}
        <div className="flex items-center gap-[9px] border-l border-white/[0.18] pl-[16px]">
          <div className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full bg-[var(--color-ln-celeste)] font-[var(--font-ln-mono)] text-sm font-semibold text-[var(--color-ln-azul-900)]">
            {avatarInitials}
          </div>
          {!compact && userName && <span className="text-[12.5px] font-medium">{userName}</span>}
        </div>
      </div>
    </header>
  );
}

// ---------- SubBar --------------------------------------------------------

export type LnBreadcrumbItem = {
  key: string;
  label: string;
  /** If provided, renders as a link (presentational — not wired to router). */
  href?: string;
  active?: boolean;
};

export type LnSubBarProps = {
  breadcrumbs?: LnBreadcrumbItem[];
  /** Mono doc code shown on the right side (e.g. "LIB-2024-00142") */
  docCode?: string;
  className?: string;
};

export function LnSubBar({ breadcrumbs = [], docCode, className = "" }: LnSubBarProps) {
  return (
    <div
      className={[
        "flex flex-shrink-0 items-center gap-[10px] border-b border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[32px] py-[9px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav aria-label="Ruta de navegación">
          <ol className="m-0 flex list-none items-center gap-[6px] p-0 font-[var(--font-ln-mono)] text-[11px] tracking-[.02em] text-[var(--color-ln-mute)]">
            {breadcrumbs.map((crumb, idx) => (
              <li key={crumb.key} className="flex items-center gap-[6px]">
                {idx > 0 && <span aria-hidden="true">/</span>}
                {crumb.active || !crumb.href ? (
                  <span
                    className={crumb.active ? "font-semibold text-[var(--color-ln-ink)]" : ""}
                    aria-current={crumb.active ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <a href={crumb.href} className="no-underline hover:text-[var(--color-ln-ink-2)]">
                    {crumb.label}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Doc code */}
      {docCode && (
        <span className="ml-auto font-[var(--font-ln-mono)] text-[11px] tracking-[.04em] text-[var(--color-ln-faint)]">
          {docCode}
        </span>
      )}
    </div>
  );
}

// ---------- Shell ---------------------------------------------------------

export type LnShellProps = {
  mastheadProps?: LnMastheadProps;
  subBarProps?: LnSubBarProps;
  /** When false, the Guilloche band is omitted. Default: true */
  showGuilloche?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * LnShell — composes Guilloche + Masthead + SubBar + scrollable body.
 *
 * Pass mastheadProps and subBarProps to configure each layer.
 * The body slot (children) fills the remaining height.
 */
export function LnShell({
  mastheadProps,
  subBarProps,
  showGuilloche = true,
  children,
  className = "",
}: LnShellProps) {
  return (
    <div
      className={[
        "flex min-h-screen flex-col bg-[var(--color-ln-paper)] font-[var(--font-ln-sans)] text-[var(--color-ln-ink)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showGuilloche && <LnGuilloche />}
      <LnMasthead {...(mastheadProps ?? {})} />
      {subBarProps !== undefined && <LnSubBar {...subBarProps} />}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
