"use client";

import { Icon, type IconName } from "@/components/Icon";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, createContext, useContext } from "react";

/**
 * Tabs con persistencia en searchParam de la URL.
 *
 * - El tab activo se lee de `searchParams[paramKey]`; si está ausente se usa `defaultValue`.
 * - Al cambiar de tab se llama `router.replace` preservando el resto de los searchParams.
 * - `TabsContent` se monta dentro de `Tabs` y lee el tab activo por contexto; se oculta
 *   con `hidden` cuando su `value` no coincide con el activo.
 *
 * Accesibilidad:
 *  - Tab list: `role="tablist"` + `aria-label` opcional.
 *  - Tab buttons: `role="tab"`, `aria-selected`, `aria-controls` apuntando al panel.
 *  - Panels: `role="tabpanel"`, `id` correspondiente al `aria-controls`.
 *  - Touch target ≥44px (min-h-11 + px-4).
 *
 * @example
 * ```tsx
 * <Tabs paramKey="tab" defaultValue="info" tabs={[{ value: "info", label: "Info" }]}>
 *   <TabsContent value="info">Contenido info</TabsContent>
 * </Tabs>
 * ```
 */

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TabsContext = createContext<string>("");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TabItem = {
  value: string;
  label: string;
  icon?: IconName;
};

export type TabsProps = {
  paramKey: string;
  defaultValue: string;
  tabs: TabItem[];
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export type TabsContentProps = {
  value: string;
  children: ReactNode;
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs({
  paramKey,
  defaultValue,
  tabs,
  children,
  className = "",
  "aria-label": ariaLabel,
}: TabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get(paramKey) ?? defaultValue;

  function handleTabClick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <TabsContext.Provider value={activeTab}>
      <div className={className}>
        {/* Tab list */}
        <div role="tablist" aria-label={ariaLabel} className="flex border-b border-gob-border">
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
                  "inline-flex items-center gap-1.5 min-h-11 px-4 text-sm font-medium",
                  "transition-colors border-b-2 -mb-px",
                  isActive
                    ? "border-gob-primary text-gob-primary"
                    : "border-transparent text-gob-text-gray hover:text-gob-text",
                ]
                  .join(" ")
                  .trim()}
              >
                {tab.icon && <Icon name={tab.icon} size="1em" decorative />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div>{children}</div>
      </div>
    </TabsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// TabsContent
// ---------------------------------------------------------------------------

export function TabsContent({ value, children }: TabsContentProps) {
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
