"use client";

// WelfareRowLink — the client interaction wrapper for a denuncia row (task #12).
//
// Keeps the real `<a href="/gob/maltrato/[id]">` (right-click "open in new tab"
// and the no-JS fallback both still work), but intercepts a plain left-click to
// SELECT the row into the inspector via shallow history instead of navigating:
//   - preventDefault the anchor,
//   - selectCaso(...) writes `?caso=<id>` with native pushState/replaceState so
//     the queue Server Component never re-runs (tab + cursor + scroll survive).
//
// The row reads `?caso=` reactively to render the selected marker (left border +
// stripe fill — same visual language as the hover state). Only the interactive
// shell is a client component; the row's PII-free content is passed as children
// from the Server Component row, so no report fields cross to the browser.

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { selectCaso } from "../_inspector/inspector-nav";

export function WelfareRowLink({
  reportId,
  href,
  children,
}: {
  reportId: string;
  href: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("caso") === reportId;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Respect modifier/middle clicks and right-click — let the browser open the
    // full page / new tab as usual.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const currentHasCaso = params.has("caso");
    params.set("caso", reportId);
    params.delete("mascota");
    selectCaso(`${pathname}?${params.toString()}`, currentHasCaso);
  }

  return (
    <a
      href={href}
      data-caso-row={reportId}
      aria-current={selected ? "true" : undefined}
      onClick={handleClick}
      className={`block px-4 py-3 transition ${
        selected
          ? "border-l-2 border-l-ln-op-azul bg-ln-op-stripe"
          : "border-l-2 border-l-transparent hover:bg-ln-op-stripe"
      }`}
    >
      {children}
    </a>
  );
}
