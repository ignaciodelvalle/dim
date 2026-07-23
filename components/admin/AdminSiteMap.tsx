// AdminSiteMap — the admin home's dispatch board (Cowork M1 + PO "más amor").
//
// WHY: the admin surface spans ~24 routes across the nav sections. W1 made the
// map clickable; this makes it EARN its place: structure IS the information.
// Each destination is a quiet card row with (a) its Icon-registry icon, (b) the
// name, (c) ONE plain-es-AR line saying what you DO there, and (d) a live count
// badge where the page already fetched that queue's pending number. The badges
// turn the map into a status board — everything else stays quiet (existing ln-*
// card, hairline dividers, no new colours, no animation).
//
// PRESENTATIONAL / server component. The route list is derived from the SAME
// ADMIN_NAV_SECTIONS the rail renders, so the map can never drift from the nav.
// Counts are passed in by the page (reusing fetchQueueCockpit) — this component
// adds NO queries of its own.

import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { ADMIN_NAV_SECTIONS } from "@/components/layout/nav-presets";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";

// One active-voice es-AR line per route: what the operator DOES there (what they
// control), not how it's built. Keyed by href so it stays in lockstep with
// ADMIN_NAV_SECTIONS — a new nav item renders with no line until one is added.
const ROUTE_ACTION: Record<string, string> = {
  "/admin": "Volvés a este panel: las colas del día y el mapa del portal.",
  "/admin/panorama": "Explorás eventos y capas sobre el mapa nacional.",
  "/admin/programa": "Leés el resumen ejecutivo del programa a nivel país.",
  // F8 fusion (2026-07-22): Censo + Población collapse into ONE Padrón hub row.
  "/admin/padron":
    "Consultás el padrón: registro por jurisdicción, estimaciones y cobertura poblacional.",
  "/admin/adopciones": "Seguís el embudo de adopciones y sus métricas.",
  "/admin/inteligencia": "Comparás jurisdicciones por índice y calidad de datos.",
  "/admin/cola": "Aprobás o rechazás matrículas, organizaciones y RUPGA.",
  "/admin/alertas": "Revisás las alertas de vigilancia que dispararon las reglas.",
  "/admin/suscripciones": "Configurás tus umbrales de alerta y gestionás tus suscripciones.",
  "/admin/casos": "Seguís los expedientes abiertos en todo el sistema.",
  "/admin/moderacion": "Moderás las denuncias anónimas antes de derivarlas.",
  "/admin/observaciones": "Controlás las observaciones antirrábicas de 10 días.",
  "/admin/sistema": "Vigilás usuarios, decisiones, SLA y procesos automáticos.",
  "/admin/outbox": "Reintentás notificaciones ENO y ves los vencimientos de SLA.",
  "/admin/auditoria": "Auditás quién hizo qué sobre las acciones sensibles.",
  "/admin/govts": "Das de alta gobiernos, asignás localidades y revocás accesos.",
  "/admin/admins": "Gestionás las cuentas de administrador con acceso universal.",
  // F3+F7 fusion (2026-07-22): Usuarios/Organizaciones/Servicios collapse
  // into the Directorio hub — one dispatch-board row for all four registers.
  "/admin/directorio":
    "Buscás y gestionás usuarios, organizaciones, servicios y credenciales RUPGA.",
  "/admin/reglas": "Configurás las reglas y parámetros por jurisdicción.",
  "/admin/historial": "Revisás tu propia actividad como operador.",
  "/admin/libro": "Recorrés el libro de eventos (solo lectura).",
};

// Icon-registry glyph per route (components/Icon.tsx ICON_MAP names only).
const ROUTE_ICON: Record<string, IconName> = {
  "/admin": "dashboard",
  "/admin/panorama": "capas",
  "/admin/programa": "chart-line",
  "/admin/padron": "huella",
  "/admin/adopciones": "corazon",
  "/admin/inteligencia": "microscopio",
  "/admin/cola": "check-circle",
  "/admin/alertas": "alerta",
  "/admin/suscripciones": "bell",
  "/admin/casos": "solicitud",
  "/admin/moderacion": "shield-alert",
  "/admin/observaciones": "vet",
  "/admin/sistema": "laptop",
  "/admin/outbox": "mail",
  "/admin/auditoria": "ojo",
  "/admin/govts": "edificio",
  "/admin/admins": "shield-check",
  "/admin/directorio": "usuarios",
  "/admin/reglas": "settings",
  "/admin/historial": "linea-tiempo",
  "/admin/libro": "libreta",
};

// The root nav section has an empty label (Dashboard + Panorama sit above the
// groups on the rail); give it a heading here so every group reads clearly.
function sectionHeading(label: string): string {
  return label === "" ? "General" : label;
}

export function AdminSiteMap({
  /**
   * Live pending counts keyed by route href, reused from the page's
   * `fetchQueueCockpit` — NOT fetched here. A route with a count > 0 shows a
   * warn badge; zero (or an unlisted route) renders nothing (no noise).
   */
  counts = {},
}: {
  counts?: Record<string, number>;
}) {
  return (
    <OpCard>
      <OpCardHead title="Mapa del sitio" />
      <OpCardBody>
        <p className="mb-4 text-[var(--text-md)] text-ln-op-ink-2">
          Todas las secciones del portal admin, agrupadas como en el menú lateral. Cada destino te
          dice qué podés hacer ahí; el número marca lo que está pendiente ahora.
        </p>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_NAV_SECTIONS.map((section) => (
            <section key={section.label || "general"} className="space-y-1">
              <h4 className="mb-1 text-[var(--text-sm)] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
                {sectionHeading(section.label)}
              </h4>
              <ul className="divide-y divide-ln-op-line-2">
                {section.items.map((item) => {
                  const count = counts[item.href] ?? 0;
                  const action = ROUTE_ACTION[item.href];
                  const icon = ROUTE_ICON[item.href];
                  return (
                    <li key={item.href}>
                      {/* Plain <a> (not next/link) — operator-trust T2. On these
                          dense operator lists a soft <Link> navigation could
                          silently drop under the Next 15.5 client-router defect
                          (see lib/ui/sheet-nav.ts): the row focused but the page
                          never changed. A real anchor hard-navigates, so the
                          click always lands. */}
                      <a
                        href={item.href}
                        className="group -mx-2 flex items-start gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 no-underline transition-colors hover:bg-ln-op-card"
                        aria-label={item.label}
                      >
                        {icon ? (
                          <span className="mt-0.5 shrink-0 text-ln-op-mute group-hover:text-ln-op-azul">
                            <Icon name={icon} size={16} decorative />
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[var(--text-md)] font-semibold text-ln-op-ink group-hover:text-ln-op-azul">
                              {item.label}
                            </span>
                            {count > 0 ? (
                              <span
                                className="shrink-0 rounded-full bg-ln-op-warn-bg px-1.5 py-0.5 text-[var(--text-xs)] font-bold tabular-nums text-ln-op-warn"
                                aria-label={`${count} pendientes`}
                              >
                                {count}
                              </span>
                            ) : null}
                          </span>
                          {action ? (
                            <span className="mt-0.5 block text-[var(--text-sm)] leading-snug text-ln-op-mute">
                              {action}
                            </span>
                          ) : null}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </OpCardBody>
    </OpCard>
  );
}
