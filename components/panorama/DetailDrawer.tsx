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
// ACCESSIBILITY (WCAG 2.1):
//   - role="dialog" + aria-modal="true" + aria-labelledby (the title),
//   - Escape closes (keydown on the drawer; the backdrop is also a close target),
//   - focus moves INTO the drawer on open (the close button) and RETURNS to the
//     element that had focus before opening on close,
//   - a focus trap keeps Tab within the drawer while it is open.
//
// PRIVACY: this drawer renders ONLY the properties the layer already exposes.
// The denuncias feature carries a coarse centroid + kind/severity — never an
// exact coordinate — so there is nothing precise to leak here.

import { useEffect, useId, useRef } from "react";

import type { LayerId } from "@/src/modules/panorama/domain/types";

/** The payload the console hands the drawer when a feature is clicked. */
export type SelectedFeature = {
  layerId: LayerId;
  /** Human label of the layer (from the registry) for the drawer header. */
  layerLabel: string;
  /** The clicked feature's GeoJSON properties (shape varies per layer). */
  properties: Record<string, unknown>;
};

type Props = {
  /** The selected feature, or null when the drawer is closed. */
  selected: SelectedFeature | null;
  onClose: () => void;
};

// --- es-AR label maps (local; no shared helper exists for these enums) -------

const SPECIES_LABEL: Record<string, string> = {
  dog: "Perro",
  cat: "Gato",
  rabbit: "Conejo",
  guinea_pig: "Cobayo",
  ferret: "Hurón",
  other: "Otra",
};

const PET_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  lost: "Perdida",
  deceased: "Fallecida",
};

const INCIDENT_LABEL: Record<string, string> = {
  bite_inflicted: "Mordedura infligida",
  bite_suffered: "Mordedura sufrida",
};

const SEVERITY_LABEL: Record<string, string> = {
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

/** Format an ISO date string to es-AR short date; "—" when absent/invalid. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// --- a single definition row -------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-ln-op-line-2 py-2 last:border-b-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-ln-op-mute">{label}</dt>
      <dd className="text-[13px] text-ln-op-ink">{value ?? "—"}</dd>
    </div>
  );
}

const DRILL_CLS =
  "inline-flex items-center gap-1 rounded-[6px] bg-ln-op-azul px-3 py-1.5 text-[13px] font-medium text-white no-underline hover:bg-ln-op-azul-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul";

// --- per-layer body ----------------------------------------------------------

function FeatureBody({
  layerId,
  properties,
}: { layerId: LayerId; properties: Record<string, unknown> }) {
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
          <p className="rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-[12px] text-ln-op-ink-2">
            Ubicación aproximada (centroide de localidad). No se muestra la ubicación exacta de la
            denuncia.
          </p>
          <dl>
            <Row label="Zona" value={place || "—"} />
            <Row label="Tipo" value={kind ? (WELFARE_KIND_LABEL[kind] ?? kind) : "—"} />
            <Row label="Gravedad" value={severity ? (SEVERITY_LABEL[severity] ?? severity) : "—"} />
            <Row label="Ingreso" value={shortDate(str(properties, "createdAt"))} />
          </dl>
          <a href="/gob/maltrato" className={DRILL_CLS}>
            Ver bandeja de denuncias →
          </a>
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
          <a href="/gob/perdidas" className={DRILL_CLS}>
            Ver pérdidas →
          </a>
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
          <a href="/gob/vigilancia" className={DRILL_CLS}>
            Ver vigilancia →
          </a>
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
          <a href="/gob/vigilancia" className={DRILL_CLS}>
            Ver vigilancia →
          </a>
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
          <a href="/gob/organizaciones" className={DRILL_CLS}>
            Ver organizaciones →
          </a>
        </>
      );
    }

    case "cobertura":
    case "mortalidad": {
      // Choropleth cell. U5: province mode carries no locality + no suppression
      // (province cells are large); locality mode may be suppressed (k-anon).
      const isProvince = str(properties, "level") === "province";
      const suppressed = properties.suppressed === true;
      const value = properties.value;
      const place = isProvince
        ? (str(properties, "province") ?? "—")
        : [str(properties, "locality"), str(properties, "province")].filter(Boolean).join(", ");
      return (
        <>
          <dl>
            <Row label={isProvince ? "Provincia" : "Localidad"} value={place || "—"} />
            <Row
              label={layerId === "cobertura" ? "Perros vacunados" : "Mascotas fallecidas"}
              value={
                !isProvince && suppressed ? (
                  <span className="text-ln-op-mute">Suprimido (privacidad · k‑anon)</span>
                ) : (
                  String(value ?? 0)
                )
              }
            />
          </dl>
          <a href="/gob/analytics" className={DRILL_CLS}>
            Ver analítica →
          </a>
        </>
      );
    }

    default:
      return <p className="text-[13px] text-ln-op-mute">Sin detalle para esta capa.</p>;
  }
}

// --- the drawer shell --------------------------------------------------------

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
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
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
              className="rounded-[6px] border border-ln-op-line px-2 py-1 text-[13px] text-ln-op-ink-2 hover:bg-ln-op-stripe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ln-op-azul"
            >
              ✕
            </button>
          </header>

          <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
            <FeatureBody layerId={selected.layerId} properties={selected.properties} />
          </div>
        </>
      )}
    </dialog>
  );
}
