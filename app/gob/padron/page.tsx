// /gob/padron — the Padrón hub.
//
// F8 fusion (2026-07-22, PO-approved route unification: both are
// registry-derived Programa surfaces the registry manager reads together):
// the hub ABSORBS Población + Censo as TABBED VISTAS (`?vista=poblacion|
// censo`) of one screen.
//
// /gob/poblacion and /gob/censo now permanently redirect here (query params
// preserved — see lib/ui/padron-hub-redirect.ts). The admin portal has its
// OWN hub at /admin/padron (app/admin/padron/page.tsx) — NOT a thin
// re-export, since the admin bodies genuinely diverge (national ranked
// tables, no jurisdiction filter); /admin/poblacion and /admin/censo
// redirect into THAT admin-scoped hub, not this one.
//
// Default vista = "poblacion" — the higher-priority POLICY question (an
// explicit programmatic target: 70% sterilization coverage, the accountable
// "are we containing the population" read leadership tracks); censo is the
// registry-health backstop (growth + data quality), read on demand rather
// than daily.
//
// The two vista screens are IMPORTED, not rewritten — this is a relocation,
// not a redesign. Each keeps its own searchParams contract, its own auth
// guard, its own query logic, byte-identical to the former standalone pages
// (see PoblacionScreen / CensoScreen).

import { Suspense } from "react";

import { type UrlTabItem, UrlTabs, UrlTabsContent } from "@/components/ui/UrlTabs";

import { CensoScreen } from "@/app/gob/censo/CensoScreen";
import { PoblacionScreen } from "@/app/gob/poblacion/PoblacionScreen";

export const dynamic = "force-dynamic";

type Vista = "poblacion" | "censo";
const DEFAULT_VISTA: Vista = "poblacion";

function parseVista(raw: string | undefined): Vista {
  return raw === "censo" ? "censo" : DEFAULT_VISTA;
}

const VISTA_TABS: UrlTabItem[] = [
  { value: "poblacion", label: "Población" },
  { value: "censo", label: "Censo" },
];

// A vista switch does NOT need to reset anything: poblacion and censo share
// the EXACT same searchParams contract (period/from/to/province/locality/
// species) — both fetch through the same resolveJurisdictionScope +
// resolveAnalyticsPeriod pipeline, so staying on e.g. a selected province
// while switching vistas is a feature, not a bug (unlike Casos/Disputas,
// which diverge on kind/province/cursor).
const VISTA_RESET_PARAMS: readonly string[] = [];

export default async function GobPadronPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const vista = parseVista(sp.vista);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Padrón</p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          ¿Crece sano el padrón y contenemos la población?
        </h1>
        <p className="max-w-prose text-[var(--text-md)] text-ln-op-ink-2">
          Población (cobertura de esterilización vs. meta) y Censo (crecimiento y calidad del
          registro) leen el mismo padrón desde dos preguntas distintas. Elegí la vista en la que
          querés trabajar ahora.
        </p>
      </header>

      <Suspense>
        <UrlTabs
          paramKey="vista"
          defaultValue={DEFAULT_VISTA}
          tabs={VISTA_TABS}
          resetParamsOnChange={VISTA_RESET_PARAMS}
          aria-label="Vista del Padrón"
        >
          <UrlTabsContent value={vista}>
            {vista === "censo" ? (
              <CensoScreen searchParams={sp} />
            ) : (
              <PoblacionScreen searchParams={sp} />
            )}
          </UrlTabsContent>
        </UrlTabs>
      </Suspense>
    </div>
  );
}
