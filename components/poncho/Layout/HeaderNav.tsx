"use client";

import { Icon } from "@/components/Icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  matchPrefix?: string;
};

type Props = {
  nav: NavItem[];
  user?: { name: string; href?: string } | null;
};

function isActive(item: NavItem, currentPath: string | null): boolean {
  if (!currentPath) return false;
  if (item.matchPrefix) return currentPath.startsWith(item.matchPrefix);
  return currentPath === item.href;
}

/** SVGs inline para hamburguesa y cerrar — icono-arg no los incluye. */
function HamburgerIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CloseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Nav del header — desktop inline + drawer mobile.
 * Marca el link activo automáticamente con usePathname() (sin necesidad de middleware).
 */
export function HeaderNav({ nav, user }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Cerrar drawer al navegar. The dependency on `pathname` is intentional —
  // we want the effect to re-fire on every navigation; biome's exhaustive-deps
  // rule wants stable setters too but those are guaranteed stable by React.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setOpen is React-stable
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Nav desktop */}
      <nav
        className="ml-6 hidden flex-1 items-center gap-1 md:flex"
        aria-label="Navegación principal"
      >
        {nav.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-semibold no-underline transition-colors ${
                active
                  ? "bg-gob-surface-alt text-gob-primary"
                  : "text-gob-text-gray hover:bg-gob-surface-alt hover:text-gob-primary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* CTA derecha desktop */}
      <div className="ml-auto hidden items-center gap-3 md:flex">
        {user ? (
          <Link
            href={user.href ?? "/cuenta"}
            className="flex items-center gap-2 rounded-full border border-gob-border px-3 py-2 text-sm font-semibold text-gob-primary no-underline hover:border-gob-border-strong"
          >
            <Icon name="usuarios" size={18} decorative />
            <span className="max-w-[14ch] truncate">{user.name}</span>
          </Link>
        ) : (
          <Link
            href="/auth/login"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gob-primary px-6 text-sm font-semibold text-white no-underline hover:bg-gob-primary-hover"
          >
            Iniciar sesión
          </Link>
        )}
      </div>

      {/* Botón mobile */}
      <div className="ml-auto md:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-gob-border text-gob-primary hover:border-gob-border-strong"
        >
          {open ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </div>

      {/* Drawer mobile — uses role+aria-modal instead of HTMLDialogElement because
          the latter requires imperative open/close APIs incompatible with React's
          declarative state-driven rendering. */}
      {open && (
        // biome-ignore lint/a11y/useSemanticElements: see drawer mobile comment above
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú principal"
          id={panelId}
          className="fixed inset-0 z-50 md:hidden"
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gob-border px-4 py-3">
              <span className="text-lg font-bold text-gob-primary">MiMAR</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gob-text-gray hover:bg-gob-surface-alt"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <nav aria-label="Navegación principal" className="flex flex-col px-2 py-3">
              {nav.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block min-h-12 rounded-md px-4 py-3 text-base font-semibold no-underline ${
                      active
                        ? "bg-gob-surface-alt text-gob-primary"
                        : "text-gob-text-gray hover:bg-gob-surface-alt"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-gob-border px-4 py-4">
              {user ? (
                <Link
                  href={user.href ?? "/cuenta"}
                  className="flex items-center gap-2 rounded-full border border-gob-border px-4 py-3 text-sm font-semibold text-gob-primary no-underline"
                >
                  <Icon name="usuarios" size={18} decorative />
                  Mi cuenta · {user.name}
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gob-primary px-6 text-sm font-semibold text-white no-underline"
                >
                  Iniciar sesión
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
