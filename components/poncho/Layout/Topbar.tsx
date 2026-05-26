import type { ReactNode } from "react";
import type { NavItem } from "./HeaderNav";
import { MobileDrawer } from "./MobileDrawer";

type Props = {
  /** Page section title shown in the top-left (optional). */
  title?: string;
  /** Right-side slot: action buttons, badges, meta-strip content. */
  actions?: ReactNode;
  /** Nav items forwarded to MobileDrawer for the hamburger menu. */
  mobileDrawerNav: NavItem[];
  /** Brand title forwarded to MobileDrawer. */
  brandTitle?: string;
};

/**
 * Top bar above page content.
 *
 * On desktop it is offset md:ml-60 to clear the fixed sidebar.
 * On mobile it renders the MobileDrawer hamburger trigger on the left.
 *
 * This is a lightweight server component; MobileDrawer is the client island
 * inside it.
 */
export function Topbar({ title, actions, mobileDrawerNav, brandTitle }: Props) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gob-border bg-white px-4 py-3 md:ml-60 md:px-8">
      <div className="flex items-center gap-3">
        {/* Hamburger only visible on mobile — MobileDrawer is client */}
        <MobileDrawer nav={mobileDrawerNav} brandTitle={brandTitle} />
        {title && (
          <h1 className="text-base font-semibold text-gob-text-strong">{title}</h1>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
