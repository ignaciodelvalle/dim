"use client";

// ContextSwitcher — renders the entitlement-filtered portal switcher (D6).
//
// Consumes `buildSwitcher(session, pathname)` from lib/shell-nav and renders
// the resulting destinations in the operator topbar's `actions` slot. The
// pathname makes the admin ⇄ gob pair surface-aware (back to /admin from /gob).
// A single-context user (empty switcher) renders nothing.
//
// Client component: uses usePathname to decide whether to close a popover
// after navigation. The switcher itself is a lightweight popover trigger;
// the entitlement decisions are pure (buildSwitcher).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ShellSession, SwitcherTarget } from "@/lib/ui/shell-nav";
import { buildSwitcher } from "@/lib/ui/shell-nav";

type Props = {
  session: ShellSession | null;
};

/** Chevron-down icon (inline SVG, no icon-lib dep). */
function ChevronIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="opacity-60"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Single destination row inside the dropdown. */
function SwitcherItem({
  target,
  onClick,
}: {
  target: SwitcherTarget;
  onClick: () => void;
}) {
  return (
    <Link
      href={target.href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-[7px] text-[12.5px] text-ln-op-ink no-underline transition-colors hover:bg-ln-op-page"
    >
      {target.label}
    </Link>
  );
}

/**
 * ContextSwitcher — operator topbar portal switcher (D6).
 *
 * Renders a compact dropdown button showing the available portal destinations
 * for the current user's entitlements. If `buildSwitcher` returns an empty
 * array (single-context user), this component renders nothing — the caller
 * does not need to guard against it.
 */
export function ContextSwitcher({ session }: Props) {
  const pathname = usePathname();
  const targets = buildSwitcher(session, pathname);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // "Where am I" affordance (task #17): when the current path is an org portal
  // the user belongs to, name that org in the trigger instead of a generic
  // "Portales". Off an org surface it stays "Portales".
  const currentOrg = targets.find(
    (t) => t.key === "org" && (pathname === t.href || pathname.startsWith(`${t.href}/`)),
  );
  const triggerLabel = currentOrg ? currentOrg.label : "Portales";

  // Close on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setOpen is React-stable
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // D6: single-context user — render nothing.
  if (targets.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-ln-op-line px-2.5 py-[5px] text-sm text-ln-op-ink-2 transition-colors hover:border-ln-op-line-2 hover:text-ln-op-ink"
      >
        <span className="max-w-[160px] truncate">{triggerLabel}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card py-1 shadow-md"
        >
          {targets.map((t) => (
            <SwitcherItem key={t.key + t.href} target={t} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}
