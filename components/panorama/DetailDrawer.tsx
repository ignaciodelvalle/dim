"use client";

// DetailDrawer — the Panorama console's slide-in feature inspector.
//
// When a map feature is clicked (SituationalMap → PanoramaConsole →
// onFeatureClick), the console sets the selected feature and renders this
// drawer. It shows the feature's properties plus a layer-specific drill action:
//
//   - decomisos → "Abrir expediente →" linking the unified case detail route
//     (/casos/{publicCode}) using the publicCode the layer already carries.
//   - denuncias → states the location is APPROXIMATE (locality centroid) and
//     links to the welfare/maltrato bandeja. NEVER reveals an exact coordinate
//     (privacy=coarse, spec §8 — Slice 5 gates exact welfare coordinates).
//   - perdidas / mordeduras / zoonosis / refugios / choropleth → show the
//     feature's properties + a link to the relevant dashboard when one exists.
//
// F4 UNIT HISTORY (§6 detail on-demand):
//   Clicking an AGGREGATED unit (province/locality symbol or choropleth cell)
//   opens a "Historia de la unidad" section below the existing FeatureBody.
//   It fetches /api/panorama/unit-history with AbortController (cancels stale),
//   then renders: a Sparkline of the daily trend, a recent-events list, and a
//   byType breakdown. Reference layers (refugios, decomisos) keep their existing
//   body only — no unit-history fetch for individual pins.
//
// ACCESSIBILITY (WCAG 2.1):
//   - role="dialog" + aria-modal="true" + aria-labelledby (the title),
//   - Escape closes (keydown on the drawer; the backdrop is also a close target),
//   - focus moves INTO the drawer on open (the close button) and RETURNS to the
//     element that had focus before opening on close,
//   - a focus trap keeps Tab within the drawer while it is open.
//
// PRIVACY: this drawer renders ONLY the properties the layer already exposes.
// The denuncias feature carries a coarse centroid + kind/severity — never an
// exact coordinate — so there is nothing precise to leak here. The unit-history
// fetch respects the same privacy rules as the repository (denuncias: kind/
// severity only, no coordinates; govt scope always intersected server-side).

import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";

import { AR_TIME_ZONE } from "@/lib/utils/format";
import type { LayerId } from "@/src/modules/panorama/domain/types";

import { Sparkline } from "./Sparkline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The payload the console hands the drawer when a feature is clicked. */
export type SelectedFeature = {
  layerId: LayerId;
  /** Human label of the layer (from the registry) for the drawer header. */
  layerLabel: string;
  /** The clicked feature's GeoJSON properties (shape varies per layer). */
  properties: Record<string, unknown>;
  /**
   * The raw query-string from the console's active searchParams (period/scope).
   * Forwarded to /api/panorama/unit-history so the history window matches the
   * map's current time window. Omit for reference-pin layers (no history fetch).
   */
  periodQs?: string;
};

type Props = {
  /** The selected feature, or null when the drawer is closed. */
  selected: SelectedFeature | null;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Unit-history API response shape (mirrors UnitHistoryResult in repository.ts)
// ---------------------------------------------------------------------------

type UnitHistoryEvent = {
  date: string;
  type: string;
  label: string;
};

type TrendBucket = {
  date: string;
  count: number;
};

type UnitHistoryResult = {
  /** True when the locality's total event count is below the k-anon threshold (k=5). */
  suppressed?: boolean;
  events: UnitHistoryEvent[];
  trend: TrendBucket[];
  byType: Record<string, number>;
};

// ---------------------------------------------------------------------------
// es-AR label maps (local; no shared helper exists for these enums)
// ---------------------------------------------------------------------------

const SPECIES_LABEL: Record<string, string> = {
  dog: "Perro",
  cat: "Gato",
  rabbit: "Conejo",
  guinea_pig: "Cobayo",
  ferret: "Hurón",
  other: "Otra",
};

export const PET_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  lost: "Perdida",
  deceased: "Fallecida",
};

export const INCIDENT_LABEL: Record<string, string> = {
  bite_inflicted: "Mordedura infligida",
  bite_suffered: "Mordedura sufrida",
};

export const SEVERITY_LABEL: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

const WELFARE_KIND_LABEL: Record<string, string> = {
  neglect: "Abandono / negligencia",
  abuse: "Maltrato",
  hoarding: "Acumulación",
  abandonment: "Abandono",
  other: "Otra",
};

const CASE_STATUS_LABEL: Record<string, string> = {
  open: "Abierto",
  in_progress: "En curso",
  escalated: "Escalado",
  closed: "Cerrado",
  resolved: "Resuelto",
};

/** Read a string-ish property safely. */
function str(props: Record<string, unknown>, key: string): string | null {
  const v = props[key];
  return v === null || v === undefined ? null : String(v);
}

/**
 * Row label for the administrative unit of a FOLDED detail cell (PO "Option A"):
 * the detail tier aggregates at the departamento/partido (the barrio in CABA), so
 * the value carried in `locality` is a DIVISION, never a bare locality — labeling
 * it "Localidad" would misname it. Province level keeps "Provincia". Used by the
 * folded layers (sintomas + the division-fill choropleths); reunificacion is not
 * folded and keeps "Localidad".
 */
function unitRowLabel(properties: Record<string, unknown>, isProvince: boolean): string {
  if (isProvince) return "Provincia";
  return str(properties, "province") === "CABA" ? "Barrio" : "Departamento/partido";
}

/** Format an ISO date string to es-AR short date; "—" when absent/invalid. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: AR_TIME_ZONE,
  });
}

// ---------------------------------------------------------------------------
// A single definition row
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-ln-op-line-2 py-2 last:border-b-0">
      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ln-op-mute">{label}</dt>
      <dd className="text-[13px] text-ln-op-ink">{value ?? "—"}</dd>
    </div>
  );
}

const DRILL_CLS =
  "inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white no-underline hover:bg-ln-op-azul-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul";

/**
 * map-QOL no-silent-crossing: drill links to /gob/* surfaces get an explicit
 * "abre en portal Gobierno" suffix when the drawer is mounted on the ADMIN
 * portal (/admin/panorama) — the operator must never cross portals silently.
 * On the Gobierno portal the link is same-portal and renders unchanged.
 */
function DrillLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const crossesPortal = href.startsWith("/gob/") && (pathname?.startsWith("/admin") ?? false);
  return (
    <a href={href} className={DRILL_CLS}>
      {children}
      {crossesPortal && (
        <span className="text-xs font-normal opacity-90">· abre en portal Gobierno ↗</span>
      )}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Per-layer body (individual-feature detail; no unit history)
// ---------------------------------------------------------------------------

// Exported for unit tests: the layer-specific drawer body renders the honest
// k-anon copy ("Suprimido …") for a suppressed cell instead of a bogus "0".
export function FeatureBody({
  layerId,
  properties,
}: { layerId: LayerId; properties: Record<string, unknown> }) {
  // This drawer is shared by /admin/panorama and /gob/panorama (both render the
  // same layer registry). "organizaciones" is one of the dual-portal surfaces
  // (cola/usuarios/organizaciones/reglas/servicios — portal-follows-viewer,
  // 2026-07-02): it exists under BOTH /admin and /gob, so its drill link must
  // follow the viewer's current portal instead of hardcoding /gob (server twin:
  // lib/ui/portal-base.ts; this is the client-side derivation since DetailDrawer
  // is a client component and cannot call headers()).
  //
  // The other drill links below (maltrato/perdidas/vigilancia/analytics) stay
  // hardcoded to /gob — those pages have NO /admin copy, so deriving the portal
  // for them would 404 for an admin viewer instead of fixing anything.
  const pathname = usePathname();
  const portal = pathname?.startsWith("/admin") ? "/admin" : "/gob";

  switch (layerId) {
    case "decomisos": {
      const code = str(properties, "code");
      const status = str(properties, "status");
      return (
        <>
          <dl>
            <Row label="Expediente" value={code ?? "—"} />
            <Row label="Estado" value={status ? (CASE_STATUS_LABEL[status] ?? status) : "—"} />
            <Row label="Apertura" value={shortDate(str(properties, "openedAt"))} />
          </dl>
          {code && (
            <a href={`/casos/${encodeURIComponent(code)}`} className={DRILL_CLS}>
              Abrir expediente →
            </a>
          )}
        </>
      );
    }

    case "denuncias": {
      // COARSE location — never a precise spot. We surface kind/severity and a
      // link to the bandeja, but no code is carried by this layer (the welfare
      // report id never leaves the repository), so we cannot deep-link a record.
      const kind = str(properties, "kind");
      const severity = str(properties, "severity");
      const place = [str(properties, "locality"), str(properties, "province")]
        .filter(Boolean)
        .join(", ");
      return (
        <>
          <p className="rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-sm text-ln-op-ink-2">
            Ubicación aproximada (centroide de localidad). No se muestra la ubicación exacta de la
            denuncia.
          </p>
          <dl>
            <Row label="Zona" value={place || "—"} />
            <Row label="Tipo" value={kind ? (WELFARE_KIND_LABEL[kind] ?? kind) : "—"} />
            <Row label="Gravedad" value={severity ? (SEVERITY_LABEL[severity] ?? severity) : "—"} />
            <Row label="Ingreso" value={shortDate(str(properties, "createdAt"))} />
          </dl>
          <DrillLink href="/gob/maltrato">Ver bandeja de denuncias →</DrillLink>
        </>
      );
    }

    case "perdidas": {
      const status = str(properties, "status");
      const species = str(properties, "species");
      return (
        <>
          <dl>
            <Row label="Mascota" value={str(properties, "name") ?? "—"} />
            <Row label="Especie" value={species ? (SPECIES_LABEL[species] ?? species) : "—"} />
            <Row label="Estado" value={status ? (PET_STATUS_LABEL[status] ?? status) : "—"} />
            <Row label="Visto por última vez" value={shortDate(str(properties, "lastSeenAt"))} />
          </dl>
          <DrillLink href="/gob/perdidas">Ver pérdidas →</DrillLink>
        </>
      );
    }

    case "mordeduras": {
      const incident = str(properties, "incidentType");
      const severity = str(properties, "severity");
      return (
        <>
          <dl>
            <Row
              label="Incidente"
              value={incident ? (INCIDENT_LABEL[incident] ?? incident) : "—"}
            />
            <Row label="Gravedad" value={severity ? (SEVERITY_LABEL[severity] ?? severity) : "—"} />
            <Row label="Fecha" value={shortDate(str(properties, "occurredAt"))} />
          </dl>
          <DrillLink href="/gob/vigilancia">Ver vigilancia →</DrillLink>
        </>
      );
    }

    case "zoonosis": {
      return (
        <>
          <dl>
            <Row
              label="Enfermedad"
              value={str(properties, "diseaseLabel") ?? str(properties, "diseaseCode") ?? "—"}
            />
            <Row label="Detectado" value={shortDate(str(properties, "occurredAt"))} />
          </dl>
          <DrillLink href="/gob/vigilancia">Ver vigilancia →</DrillLink>
        </>
      );
    }

    case "sintomas": {
      // Aggregated point cell — sintomas has no near-zoom individual-dot mode
      // (unlike perdidas/mordeduras), so this always renders a unit summary
      // (place + reported-symptom count), same shape as the choropleth cells.
      const isProvince = str(properties, "level") === "province";
      const suppressed = properties.suppressed === true;
      const place =
        str(properties, "place") ??
        (isProvince
          ? (str(properties, "province") ?? "—")
          : [str(properties, "locality"), str(properties, "province")].filter(Boolean).join(", "));
      return (
        <>
          <dl>
            <Row label={unitRowLabel(properties, isProvince)} value={place || "—"} />
            <Row
              label="Síntomas reportados"
              value={
                suppressed ? (
                  <span className="text-ln-op-mute">Suprimido (privacidad · k‑anon)</span>
                ) : (
                  String(properties.count ?? 0)
                )
              }
            />
          </dl>
          <DrillLink href="/gob/vigilancia">Ver vigilancia →</DrillLink>
        </>
      );
    }

    case "reunificacion": {
      // Aggregated signal cell — the graduated-symbol count IS the D4
      // reunification ratePct (0–100), not an event count (see loadReunificacionByUnit).
      const isProvince = str(properties, "level") === "province";
      const suppressed = properties.suppressed === true;
      const place =
        str(properties, "place") ??
        (isProvince
          ? (str(properties, "province") ?? "—")
          : [str(properties, "locality"), str(properties, "province")].filter(Boolean).join(", "));
      return (
        <>
          <dl>
            <Row label={isProvince ? "Provincia" : "Localidad"} value={place || "—"} />
            <Row
              label="Tasa de reunificación"
              value={
                suppressed ? (
                  <span className="text-ln-op-mute">Suprimido (privacidad · k‑anon)</span>
                ) : (
                  `${properties.count ?? 0}%`
                )
              }
            />
          </dl>
          <DrillLink href="/gob/perdidas">Ver pérdidas →</DrillLink>
        </>
      );
    }

    case "refugios": {
      const verified = properties.verified === true;
      return (
        <>
          <dl>
            <Row label="Refugio" value={str(properties, "name") ?? "—"} />
            <Row label="Verificación" value={verified ? "Verificado" : "Sin verificar"} />
          </dl>
          {/* Organizaciones has an /admin twin (portal parity) — portal-aware
              href keeps the viewer in-portal; DrillLink adds the cross-portal
              suffix only for surfaces without a twin. */}
          <DrillLink href={`${portal}/organizaciones`}>Ver organizaciones →</DrillLink>
        </>
      );
    }

    case "cobertura":
    case "mortalidad":
    case "microchip":
    case "ppp": {
      // Choropleth cell. U5: province mode carries no locality + no suppression
      // (province cells are large); locality mode may be suppressed (k-anon).
      const isProvince = str(properties, "level") === "province";
      const suppressed = properties.suppressed === true;
      const value = properties.value;
      const place = isProvince
        ? (str(properties, "province") ?? "—")
        : [str(properties, "locality"), str(properties, "province")].filter(Boolean).join(", ");
      const valueLabel = {
        cobertura: "Perros vacunados",
        mortalidad: "Mascotas fallecidas",
        microchip: "Mascotas con microchip activo",
        ppp: "Mascotas PPP registradas",
      }[layerId];
      return (
        <>
          <dl>
            <Row label={unitRowLabel(properties, isProvince)} value={place || "—"} />
            <Row
              label={valueLabel}
              value={
                !isProvince && suppressed ? (
                  <span className="text-ln-op-mute">Suprimido (privacidad · k‑anon)</span>
                ) : (
                  String(value ?? 0)
                )
              }
            />
          </dl>
          <DrillLink href="/gob/analytics">Ver analítica →</DrillLink>
        </>
      );
    }

    default:
      return <p className="text-[13px] text-ln-op-mute">Sin detalle para esta capa.</p>;
  }
}

// ---------------------------------------------------------------------------
// F4 Unit history section
// ---------------------------------------------------------------------------

// Layers that carry individual-feature pins (NOT aggregated units). These never
// trigger a unit-history fetch — they have their own FeatureBody only.
const REFERENCE_LAYER_IDS = new Set<LayerId>(["refugios", "decomisos"]);

/** Determine whether the selected feature should trigger a unit-history fetch.
 * True for aggregated (density/signal/choropleth) units that carry a province. */
function shouldFetchHistory(layerId: LayerId, properties: Record<string, unknown>): boolean {
  if (REFERENCE_LAYER_IDS.has(layerId)) return false;
  // Aggregated point cells and choropleth cells carry `province` in properties.
  const province = properties.province;
  return typeof province === "string" && province.length > 0;
}

/** Build the /api/panorama/unit-history URL for the given selected feature. */
function buildHistoryUrl(
  layerId: LayerId,
  properties: Record<string, unknown>,
  periodQs: string,
): string {
  const province = String(properties.province ?? "");
  const locality =
    typeof properties.locality === "string" && properties.locality ? properties.locality : null;

  const params = new URLSearchParams();
  params.set("layer", layerId);
  params.set("province", province);
  if (locality) params.set("locality", locality);

  // Thread the active period (from the console's searchParams) so the history
  // window matches the map's current filters.
  if (periodQs) {
    const existing = new URLSearchParams(periodQs);
    for (const [k, v] of existing.entries()) {
      if (k === "province" || k === "locality" || k === "layer") continue;
      params.set(k, v);
    }
  }

  return `/api/panorama/unit-history?${params.toString()}`;
}

type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: UnitHistoryResult };

function UnitHistorySection({
  layerId,
  properties,
  periodQs,
}: {
  layerId: LayerId;
  properties: Record<string, unknown>;
  periodQs: string;
}) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    const controller = new AbortController();
    const url = buildHistoryUrl(layerId, properties, periodQs);

    fetch(url, { signal: controller.signal, headers: { accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UnitHistoryResult>;
      })
      .then((data) => {
        setState({ status: "ok", data });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ status: "error", message: "No se pudo cargar el historial." });
      });

    return () => controller.abort();
  }, [layerId, properties, periodQs]);

  const place = [
    typeof properties.locality === "string" && properties.locality ? properties.locality : null,
    typeof properties.province === "string" ? properties.province : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section aria-labelledby="unit-history-heading" className="border-t border-ln-op-line pt-3">
      <h3
        id="unit-history-heading"
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ln-op-mute"
      >
        Historia de la unidad
        {place ? <span className="font-normal normal-case"> · {place}</span> : null}
      </h3>

      {state.status === "loading" && (
        <output aria-busy="true" className="text-sm text-ln-op-mute">
          Cargando historial…
        </output>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-sm text-ln-op-warn">
          {state.message}
        </p>
      )}

      {state.status === "ok" && state.data.suppressed && (
        <p className="rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-sm text-ln-op-ink-2">
          Suprimido por k-anonimato (menos de 5 eventos en el período).
        </p>
      )}

      {state.status === "ok" && !state.data.suppressed && (
        <div className="flex flex-col gap-3">
          {/* Sparkline — daily trend over the active period */}
          {state.data.trend.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-ln-op-mute">Tendencia diaria</p>
              <Sparkline
                points={state.data.trend.map((b) => b.count)}
                width={288}
                height={40}
                ariaLabel={`Tendencia de ${layerId}: ${state.data.trend.length} días`}
              />
            </div>
          )}

          {/* Recent events list */}
          {state.data.events.length > 0 ? (
            <div>
              <p className="mb-1 text-xs text-ln-op-mute">
                Eventos recientes ({state.data.events.length})
              </p>
              <ul className="flex flex-col gap-1">
                {state.data.events.map((ev, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 text-ln-op-mute">{shortDate(ev.date)}</span>
                    <span className="text-ln-op-ink-2">{ev.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ln-op-mute">Sin eventos en el período.</p>
          )}

          {/* byType breakdown */}
          {Object.keys(state.data.byType).length > 0 && (
            <div>
              <p className="mb-1 text-xs text-ln-op-mute">Por tipo</p>
              <dl className="flex flex-col gap-0.5">
                {Object.entries(state.data.byType).map(([type, n]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <dt className="text-ln-op-ink-2">{type}</dt>
                    <dd className="font-medium text-ln-op-ink">{n}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The drawer shell
// ---------------------------------------------------------------------------

// The drawer is a native <dialog> opened with showModal() — same proven pattern
// as components/ui/ConfirmDialog.tsx. The browser then provides, for free:
//   - a real focus trap (Tab stays inside the dialog),
//   - Escape dismissal via the native `cancel` event,
//   - the dialog role + aria-modal semantics (no role="dialog" hack → no
//     useSemanticElements lint error),
//   - focus restoration to the trigger on close.
// We only style it as a right-anchored, full-height sliding panel.
export function DetailDrawer({ selected, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = selected !== null;

  // Open/close the native dialog imperatively to match React state.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  // Sync the native cancel event (Escape) back to React state. preventDefault so
  // the browser does not close the dialog before our state updates.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onClose={onClose}
      // Right-anchored full-height panel. `ml-auto mr-0` + max-h/h-full slides it
      // to the right edge; the native ::backdrop dims the rest.
      className="ml-auto mr-0 h-full max-h-full w-full max-w-[360px] border-l border-ln-op-line bg-ln-op-card p-0 shadow-[0_18px_50px_rgba(20,40,60,.22)] [&::backdrop]:bg-black/40 open:flex open:flex-col"
    >
      {selected && (
        <>
          <header className="flex items-start justify-between gap-3 border-b border-ln-op-line px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
                Detalle de capa
              </p>
              <h2 id={titleId} className="text-[15px] font-semibold text-ln-op-ink">
                {selected.layerLabel}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-[var(--radius-md)] border border-ln-op-line px-2 py-1 text-[13px] text-ln-op-ink-2 hover:bg-ln-op-stripe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul"
            >
              ✕
            </button>
          </header>

          <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
            <FeatureBody layerId={selected.layerId} properties={selected.properties} />

            {/* F4: unit-history section — only for aggregated units that carry a province */}
            {shouldFetchHistory(selected.layerId, selected.properties) && (
              <UnitHistorySection
                layerId={selected.layerId}
                properties={selected.properties}
                periodQs={selected.periodQs ?? ""}
              />
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
