// AdminSiteMap — a compact map of every admin route grouped by the existing
// nav sections (Epic D).
//
// WHY: the admin surface spans ~24 routes across five nav sections, but the
// home offered only a handful of ad-hoc account cards + analytics callouts. A
// single grouped site map turns the home into an orientation hub: every
// destination, grouped exactly as the rail groups it, each with a one-line
// purpose so an operator can jump straight to the right tool.
//
// PRESENTATIONAL / server component. The route list is derived from the SAME
// ADMIN_NAV_SECTIONS the rail renders, so the map can never drift from the nav.
// Purposes live in a local es-AR dictionary keyed by href.

import Link from "next/link";

import { ADMIN_NAV_SECTIONS } from "@/components/layout/nav-presets";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";

// One-line purpose per route (es-AR). Keyed by href so it stays in lockstep
// with ADMIN_NAV_SECTIONS — a new nav item simply renders with no subtitle
// until a purpose is added here.
const ROUTE_PURPOSE: Record<string, string> = {
  "/admin": "Este panel: cockpit de colas y mapa del sitio.",
  "/admin/panorama": "Consola geoespacial de eventos y capas.",
  "/admin/programa": "Resumen ejecutivo del programa a nivel nacional.",
  "/admin/censo": "Censo de mascotas registradas por jurisdicción.",
  "/admin/adopciones": "Métricas del embudo de adopciones.",
  "/admin/poblacion": "Estimaciones y cobertura poblacional.",
  "/admin/inteligencia": "Inteligencia territorial: índice compuesto y calidad de datos.",
  "/admin/cola": "Cola de aprobaciones: matrículas, organizaciones y RUPGA.",
  "/admin/alertas": "Alertas de vigilancia disparadas por reglas.",
  "/admin/casos": "Expedientes abiertos en todo el sistema.",
  "/admin/moderacion": "Denuncias anónimas marcadas para revisión previa.",
  "/admin/observaciones": "Observaciones antirrábicas de 10 días en curso.",
  "/admin/sistema": "Salud operativa: usuarios, decisiones, SLA y crons.",
  "/admin/outbox": "Bandeja de salida ENO y breaches de SLA.",
  "/admin/auditoria": "Registro de auditoría de acciones sensibles.",
  "/admin/usuarios": "Búsqueda y gestión de cuentas de usuario.",
  "/admin/govts": "Cuentas de gobierno: alta, localidades y revocación.",
  "/admin/admins": "Cuentas de administrador con acceso universal.",
  "/admin/organizaciones": "Organizaciones registradas y su verificación.",
  "/admin/reglas": "Reglas y parámetros por jurisdicción.",
  "/admin/historial": "Historial de mi actividad como operador.",
  "/admin/libro": "Libro de eventos (event-sourcing, solo lectura).",
  "/admin/servicios": "Catálogo de servicios ofrecidos.",
};

// The root nav section has an empty label (Dashboard + Panorama sit above the
// groups on the rail); give it a heading here so every group reads clearly.
function sectionHeading(label: string): string {
  return label === "" ? "General" : label;
}

export function AdminSiteMap() {
  return (
    <OpCard>
      <OpCardHead title="Mapa del sitio" />
      <OpCardBody>
        <p className="mb-4 text-[var(--text-md)] text-ln-op-ink-2">
          Todas las secciones del portal admin, agrupadas como en el menú lateral. Cada destino
          incluye para qué sirve.
        </p>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_NAV_SECTIONS.map((section) => (
            <section key={section.label || "general"} className="space-y-2">
              <h4 className="text-[var(--text-sm)] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
                {sectionHeading(section.label)}
              </h4>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group block no-underline"
                      aria-label={item.label}
                    >
                      <span className="text-[var(--text-md)] font-semibold text-ln-op-ink group-hover:text-ln-op-azul">
                        {item.label}
                      </span>
                      {ROUTE_PURPOSE[item.href] ? (
                        <span className="block text-[var(--text-sm)] leading-snug text-ln-op-mute">
                          {ROUTE_PURPOSE[item.href]}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </OpCardBody>
    </OpCard>
  );
}
