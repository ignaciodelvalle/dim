import type { ReactNode } from "react";
import type { OpRail } from "./OpRail";
import type { OpTopbar } from "./OpTopbar";

type Props = {
  /** The OpRail element to render (pass as JSX so the parent can configure it). */
  rail: ReactNode;
  /** The OpTopbar element to render. */
  topbar: ReactNode;
  /** Page content. */
  children: ReactNode;
  /** Visual variant — used to set the page canvas color. */
  variant?: "gob" | "org";
  /**
   * Optional max-width constraint on the scroll area inner wrapper.
   * e.g. "max-w-6xl", "max-w-[1440px]". Defaults to no constraint.
   */
  maxWidth?: string;
};

/**
 * Root compositor for the Operador tier.
 *
 * Layout: flex h-screen (no position:absolute/inset:0 — avoids Next layout conflicts).
 *   ├── OpRail (224px, hidden on mobile)
 *   └── main (flex-col, flex-1)
 *       ├── OpTopbar (sticky)
 *       └── scroll area (flex-1 overflow-auto)
 *           └── inner wrapper (px-6 py-[22px], optional maxWidth)
 *               └── children
 *
 * Server component only. Client interactivity lives in OpRailNav + OpMobileDrawer.
 */
export function OpShell({ rail, topbar, children, variant = "gob", maxWidth }: Props) {
  const pageBg = variant === "org" ? "bg-ln-op-page" : "bg-ln-op-page";

  return (
    <div
      className={[
        "flex h-screen overflow-hidden",
        pageBg,
        "text-ln-op-ink",
        // 13px base — matches handoff ultra-dense control-room aesthetic
        "text-[13px] leading-[1.45]",
        "[&_*]:box-border",
      ].join(" ")}
    >
      {/* Rail — server-rendered, client nav island inside */}
      {rail}

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        {topbar}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-auto px-6 py-[22px]">
          {maxWidth ? <div className={`${maxWidth} mx-auto`}>{children}</div> : children}
        </div>
      </main>
    </div>
  );
}
