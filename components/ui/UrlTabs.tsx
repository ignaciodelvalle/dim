"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, createContext, useContext } from "react";

import { Icon, type IconName } from "@/components/Icon";

/**
 * Libreta Nacional URL-driven Tabs (with content panels).
 *
 * The LN-idiom counterpart of the old poncho Tabs: same API, same behavior
 * (active tab persists in a searchParam, panels mount via UrlTabsContent),
 * restyled to LN tokens. For a simple controlled tab bar with no URL/panels,
 * use LnTabs from ./Tabs instead.
 *
 * - Active tab is read from `searchParams[paramKey]`; falls back to `defaultValue`.
 * - Switching tabs navigates via a full document navigation, preserving the
 *   other searchParams (see design note below).
 * - `UrlTabsContent` reads the active tab from context; hidden when inactive.
 *
 * Accessibility: role="tablist"/"tab"/"tabpanel", aria-selected, aria-controls.
 *
 * Design note (router-drop defect, same cure as components/gob/JurisdictionSwitcher.tsx):
 * Next 15.5.18's App Router can silently drop a client transition's own fetch in
 * production — the RSC request resolves 200 but the URL and UI never update.
 * The consumer pages (app/gob/maltrato, app/gob/perdidas) server-render the tab
 * content from this searchParam on every request, so a `router.replace`
 * transition is exposed to the drop. A full document navigation
 * (`window.location.assign`) is the one mechanism proven immune — the
 * browser's native GET cannot be silently dropped, and it always re-runs the
 * server component with the new searchParams.
 */

const TabsContext = createContext<string>("");

export type UrlTabItem = {
  value: string;
  label: string;
  icon?: IconName;
  /** Optional count badge. Rendered in seal (red) tone when > 0. */
  badge?: number;
};

export type UrlTabsProps = {
  paramKey: string;
  defaultValue: string;
  tabs: UrlTabItem[];
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export type UrlTabsContentProps = {
  value: string;
  children: ReactNode;
};

export function UrlTabs({
  paramKey,
  defaultValue,
  tabs,
  children,
  className = "",
  "aria-label": ariaLabel,
}: UrlTabsProps) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get(paramKey) ?? defaultValue;

  function handleTabClick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, value);
    window.location.assign(`?${params.toString()}`);
  }

  return (
    <TabsContext.Provider value={activeTab}>
      <div className={className}>
        <div
          role="tablist"
          aria-label={ariaLabel}
          className="flex border-b border-[var(--color-ln-line)]"
        >
          {tabs.map((tab) => {
            const isActive = tab.value === activeTab;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.value}`}
                id={`tab-${tab.value}`}
                onClick={() => handleTabClick(tab.value)}
                className={[
                  "inline-flex items-center gap-[7px] min-h-11 px-[18px] text-[13px] font-semibold",
                  "transition-colors border-b-2 -mb-px",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]",
                  isActive
                    ? "border-b-[var(--color-ln-azul)] text-[var(--color-ln-azul)]"
                    : "border-b-transparent text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink-2)]",
                ].join(" ")}
              >
                {tab.icon && <Icon name={tab.icon} size="1em" decorative />}
                {tab.label}
                {tab.badge !== undefined && (
                  <span
                    className={[
                      "ml-1 rounded-full px-[6px] py-[1px] font-[var(--font-ln-mono)] text-xs leading-none",
                      tab.badge > 0
                        ? "bg-[var(--color-ln-seal)] text-white"
                        : "bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]",
                    ].join(" ")}
                    aria-label={`${tab.badge} urgente${tab.badge !== 1 ? "s" : ""}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div>{children}</div>
      </div>
    </TabsContext.Provider>
  );
}

export function UrlTabsContent({ value, children }: UrlTabsContentProps) {
  const activeTab = useContext(TabsContext);
  const isActive = value === activeTab;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!isActive}
    >
      {children}
    </div>
  );
}
