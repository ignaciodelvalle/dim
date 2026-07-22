// lib/ui/screen-manifest.ts — the screen-decision manifest (C6a primitive).
//
// docs/reviews/results/2026-07-22-plan-maestro-integridad.md §C6: "Toda
// pantalla declara su decisión dueña (manifest por pantalla — la lente D3 de
// nuestro audit, ahora obligatoria); si no hay decisión, es reporte o cola,
// no dashboard." This module is the first primitive of that fence: a typed
// registry mapping every gob/admin route to (a) the 5-layer + bandeja model
// it belongs to and (b) the ONE es-AR sentence describing what the operator
// DECIDES there. Queue-shaped screens (Bandeja operativa) get an action
// sentence ("¿tomo/apruebo/resuelvo X?") instead of an analytical question —
// that IS their decision.
//
// SCOPE (2026-07-22, C6a first cut): populated for every top-level gob nav
// route (the 27 items regrouped in components/layout/nav-presets.ts) plus
// their admin twins/admin-only equivalents. Nested detail/form/export routes
// ([id], [publicCode], /nuevo, /export…) are NOT covered here — they are
// grandfathered in scripts/screen-manifest-baseline.json until a future sweep
// gives them their own entries (most are drill-downs FROM an already-declared
// decision, not new dashboard surfaces).
//
// Fence: scripts/check-screen-manifest.ts (pnpm lint:screens) — every
// app/gob/**/page.tsx and app/admin/**/page.tsx route must resolve to an
// entry here OR be listed in the baseline. It also cross-checks that a
// route's `layer` here agrees with the NAV SECTION it actually renders under
// in nav-presets.ts (manifest↔nav consistency — see that script's comments
// for why the two stay separate modules instead of one reading the other).

/** The 5 layers + the cross-cutting queue layer (C6 primitive concept). */
export type ScreenLayer =
  | "briefing"
  | "situacion"
  | "programa"
  | "intervencion"
  | "bandeja"
  | "profundidad";

export type ScreenManifestEntry = {
  /** The route this entry describes, e.g. "/gob/casos". */
  route: string;
  layer: ScreenLayer;
  /**
   * ONE es-AR sentence: what the operator DECIDES on this screen. Analytical
   * surfaces phrase it as a question ("¿dónde se concentra el riesgo?");
   * queue-shaped surfaces phrase it as the action itself ("¿apruebo o
   * rechazo esta solicitud?") — a bandeja's decision IS its per-row action.
   */
  decision: string;
};

/**
 * Reuses a gob entry's decision text for its admin twin (portal-follows-
 * viewer routes: same screen, same question, different chrome/scope). Keeps
 * the two portals' decisions from silently drifting apart — see the module
 * header for why this stays a helper instead of collapsing nav-presets.ts
 * into reading this manifest directly.
 */
function twin(
  adminRoute: string,
  gobEntry: ScreenManifestEntry,
  layer: ScreenLayer,
): ScreenManifestEntry {
  return { route: adminRoute, layer, decision: gobEntry.decision };
}

// ---------------------------------------------------------------------------
// /gob — the 27 top-level nav routes (C6a regroup), grouped by layer to
// mirror components/layout/nav-presets.ts's GOB_NAV_SECTIONS order.
// ---------------------------------------------------------------------------

const GOB_PANEL: ScreenManifestEntry = {
  route: "/gob",
  layer: "briefing",
  // C6b (2026-07-22, plan-maestro-integridad.md §C6): the home page IS the
  // briefing now — a ranked, capped-at-5 "Alertas priorizadas" hero
  // (lib/metrics/briefing-alerts.ts) instead of a KPI wall. This decision
  // sentence names the bounded shape ("3 cosas", not an open-ended list) the
  // PO locked for the briefing layer.
  decision: "¿Qué 3 cosas priorizo hoy?",
};

const GOB_PANORAMA: ScreenManifestEntry = {
  route: "/gob/panorama",
  layer: "situacion",
  decision: "¿Dónde se concentra el riesgo ahora mismo en el mapa de mi jurisdicción?",
};

const GOB_VIGILANCIA: ScreenManifestEntry = {
  route: "/gob/vigilancia",
  layer: "situacion",
  decision: "¿Hay brotes o zoonosis activos que requieren intervención epidemiológica?",
};

const GOB_PERDIDAS: ScreenManifestEntry = {
  route: "/gob/perdidas",
  layer: "situacion",
  decision: "¿Qué mascotas perdidas siguen sin reunificar y necesitan seguimiento?",
};

const GOB_PROGRAMA: ScreenManifestEntry = {
  route: "/gob/programa",
  layer: "programa",
  decision: "¿El programa cumple sus metas de cobertura este período, y dónde no?",
};

const GOB_POBLACION: ScreenManifestEntry = {
  route: "/gob/poblacion",
  layer: "programa",
  decision: "¿La población de mascotas crece dentro de la meta de control poblacional?",
};

const GOB_CENSO: ScreenManifestEntry = {
  route: "/gob/censo",
  layer: "programa",
  decision: "¿Qué tan completo y saludable está el registro censal de mi jurisdicción?",
};

const GOB_CAMPANAS: ScreenManifestEntry = {
  route: "/gob/campanas",
  layer: "programa",
  decision: "¿Qué campaña rindió mejor y cuál necesito reforzar?",
};

const GOB_MORTALIDAD: ScreenManifestEntry = {
  route: "/gob/mortalidad",
  layer: "programa",
  decision: "¿La disposición de fallecimientos es trazable y está dentro de la meta legal?",
};

const GOB_ADOPCIONES: ScreenManifestEntry = {
  route: "/gob/adopciones",
  layer: "programa",
  decision: "¿El ciclo de custodia y adopción fluye o se traba en algún punto?",
};

const GOB_OUTREACH: ScreenManifestEntry = {
  route: "/gob/outreach",
  layer: "intervencion",
  decision: "¿A qué zona sin cobertura asigno el próximo operativo de alcance comunitario?",
};

const GOB_DECOMISOS: ScreenManifestEntry = {
  route: "/gob/decomisos",
  layer: "intervencion",
  decision: "¿Qué decomiso necesito registrar o completar en su trámite?",
};

const GOB_RUPGA: ScreenManifestEntry = {
  route: "/gob/rupga",
  layer: "intervencion",
  decision: "¿Qué credencial RUPGA necesito revocar por incumplimiento?",
};

const GOB_DENUNCIAS: ScreenManifestEntry = {
  route: "/gob/denuncias",
  layer: "bandeja",
  decision: "¿En qué etapa del recorrido (moderación, triage, caso) tengo trabajo pendiente?",
};

const GOB_MODERACION: ScreenManifestEntry = {
  route: "/gob/moderacion",
  layer: "bandeja",
  decision: "¿Esta denuncia anónima es válida para pasar a triage, o es spam?",
};

const GOB_MALTRATO: ScreenManifestEntry = {
  route: "/gob/maltrato",
  layer: "bandeja",
  decision: "¿Qué denuncia de maltrato sin asignar necesito tomar ahora?",
};

const GOB_COLA: ScreenManifestEntry = {
  route: "/gob/cola",
  layer: "bandeja",
  decision: "¿Apruebo o rechazo esta solicitud pendiente (matrícula, organización, credencial)?",
};

const GOB_CASOS: ScreenManifestEntry = {
  route: "/gob/casos",
  layer: "bandeja",
  decision: "¿Qué caso regulatorio necesita mi próxima acción?",
};

const GOB_DISPUTAS: ScreenManifestEntry = {
  route: "/gob/disputas",
  layer: "bandeja",
  decision: "¿Cómo resuelvo esta disputa de tenencia?",
};

const GOB_OUTBOX: ScreenManifestEntry = {
  route: "/gob/outbox",
  layer: "bandeja",
  decision: "¿Qué notificación (ENO u otra) quedó sin entregar y necesito reintentar?",
};

const GOB_SUSCRIPCIONES: ScreenManifestEntry = {
  route: "/gob/suscripciones",
  layer: "bandeja",
  decision: "¿Qué umbral de alerta necesito crear o ajustar para mi jurisdicción?",
};

const GOB_ANALYTICS: ScreenManifestEntry = {
  route: "/gob/analytics",
  layer: "profundidad",
  decision: "¿Qué tendencia de fondo explica el número que vi en Programa?",
};

const GOB_HISTORIAL: ScreenManifestEntry = {
  route: "/gob/historial",
  layer: "profundidad",
  decision: "¿Qué hice yo (o mi equipo) en los últimos días, para auditar mi propia actividad?",
};

const GOB_REGLAS: ScreenManifestEntry = {
  route: "/gob/reglas",
  layer: "profundidad",
  decision: "¿Qué regla de negocio (SLA, umbral) necesito configurar para mi jurisdicción?",
};

const GOB_ORGANIZACIONES: ScreenManifestEntry = {
  route: "/gob/organizaciones",
  layer: "profundidad",
  decision: "¿Qué organización necesito verificar o dar de baja?",
};

const GOB_USUARIOS: ScreenManifestEntry = {
  route: "/gob/usuarios",
  layer: "profundidad",
  decision: "¿A quién le doy de alta, asciendo de rol o desactivo?",
};

const GOB_SERVICIOS: ScreenManifestEntry = {
  route: "/gob/servicios",
  layer: "profundidad",
  decision: "¿Qué oferta de servicio necesito publicar o retirar?",
};

// ---------------------------------------------------------------------------
// /admin — twins reuse the gob decision text (portal-follows-viewer); the
// admin-only surfaces (no gob equivalent) get their own entry.
// ---------------------------------------------------------------------------

const ADMIN_PANEL = twin("/admin", GOB_PANEL, "briefing");
const ADMIN_PANORAMA = twin("/admin/panorama", GOB_PANORAMA, "situacion");
const ADMIN_PROGRAMA = twin("/admin/programa", GOB_PROGRAMA, "programa");
const ADMIN_CENSO = twin("/admin/censo", GOB_CENSO, "programa");
const ADMIN_ADOPCIONES = twin("/admin/adopciones", GOB_ADOPCIONES, "programa");
const ADMIN_POBLACION = twin("/admin/poblacion", GOB_POBLACION, "programa");
const ADMIN_COLA = twin("/admin/cola", GOB_COLA, "bandeja");
const ADMIN_CASOS = twin("/admin/casos", GOB_CASOS, "bandeja");
const ADMIN_MODERACION = twin("/admin/moderacion", GOB_MODERACION, "bandeja");
const ADMIN_OUTBOX = twin("/admin/outbox", GOB_OUTBOX, "bandeja");
const ADMIN_SUSCRIPCIONES = twin("/admin/suscripciones", GOB_SUSCRIPCIONES, "bandeja");
const ADMIN_USUARIOS = twin("/admin/usuarios", GOB_USUARIOS, "profundidad");
const ADMIN_ORGANIZACIONES = twin("/admin/organizaciones", GOB_ORGANIZACIONES, "profundidad");
const ADMIN_REGLAS = twin("/admin/reglas", GOB_REGLAS, "profundidad");
const ADMIN_SERVICIOS = twin("/admin/servicios", GOB_SERVICIOS, "profundidad");
const ADMIN_HISTORIAL = twin("/admin/historial", GOB_HISTORIAL, "profundidad");

const ADMIN_ALERTAS: ScreenManifestEntry = {
  route: "/admin/alertas",
  layer: "bandeja",
  decision: "¿Reconozco, investigo o cierro esta alerta de umbral?",
};

const ADMIN_OBSERVACIONES: ScreenManifestEntry = {
  route: "/admin/observaciones",
  layer: "situacion",
  decision: "¿Qué observación de rabia en curso necesita seguimiento o cierre?",
};

const ADMIN_INTELIGENCIA: ScreenManifestEntry = {
  route: "/admin/inteligencia",
  layer: "profundidad",
  decision: "¿Qué provincia se aparta del índice compuesto y por qué (política, calidad de dato)?",
};

const ADMIN_SISTEMA: ScreenManifestEntry = {
  route: "/admin/sistema",
  layer: "profundidad",
  decision: "¿Algún cron dejó de correr y necesito reintentarlo o escalarlo?",
};

const ADMIN_AUDITORIA: ScreenManifestEntry = {
  route: "/admin/auditoria",
  layer: "profundidad",
  decision: "¿Quién hizo qué cambio sensible, y necesito investigarlo?",
};

const ADMIN_GOVTS: ScreenManifestEntry = {
  route: "/admin/govts",
  layer: "profundidad",
  decision: "¿Qué cuenta de gobierno necesito dar de alta o reasignar de jurisdicción?",
};

const ADMIN_ADMINS: ScreenManifestEntry = {
  route: "/admin/admins",
  layer: "profundidad",
  decision: "¿A quién le doy o retiro acceso de administrador?",
};

const ADMIN_LIBRO: ScreenManifestEntry = {
  route: "/admin/libro",
  layer: "profundidad",
  decision: "¿Qué evento de dominio necesito auditar en su forma cruda (event-sourcing)?",
};

/**
 * The full registry — every entry above, in one array. Order is cosmetic
 * (portal, then layer); lookups are by `route` via {@link getScreenManifestEntry}.
 */
export const SCREEN_MANIFEST: readonly ScreenManifestEntry[] = [
  // /gob
  GOB_PANEL,
  GOB_PANORAMA,
  GOB_VIGILANCIA,
  GOB_PERDIDAS,
  GOB_PROGRAMA,
  GOB_POBLACION,
  GOB_CENSO,
  GOB_CAMPANAS,
  GOB_MORTALIDAD,
  GOB_ADOPCIONES,
  GOB_OUTREACH,
  GOB_DECOMISOS,
  GOB_RUPGA,
  GOB_DENUNCIAS,
  GOB_MODERACION,
  GOB_MALTRATO,
  GOB_COLA,
  GOB_CASOS,
  GOB_DISPUTAS,
  GOB_OUTBOX,
  GOB_SUSCRIPCIONES,
  GOB_ANALYTICS,
  GOB_HISTORIAL,
  GOB_REGLAS,
  GOB_ORGANIZACIONES,
  GOB_USUARIOS,
  GOB_SERVICIOS,
  // /admin
  ADMIN_PANEL,
  ADMIN_PANORAMA,
  ADMIN_OBSERVACIONES,
  ADMIN_PROGRAMA,
  ADMIN_CENSO,
  ADMIN_ADOPCIONES,
  ADMIN_POBLACION,
  ADMIN_COLA,
  ADMIN_ALERTAS,
  ADMIN_SUSCRIPCIONES,
  ADMIN_CASOS,
  ADMIN_MODERACION,
  ADMIN_OUTBOX,
  ADMIN_INTELIGENCIA,
  ADMIN_SISTEMA,
  ADMIN_AUDITORIA,
  ADMIN_USUARIOS,
  ADMIN_GOVTS,
  ADMIN_ADMINS,
  ADMIN_ORGANIZACIONES,
  ADMIN_REGLAS,
  ADMIN_HISTORIAL,
  ADMIN_LIBRO,
  ADMIN_SERVICIOS,
];

const BY_ROUTE: ReadonlyMap<string, ScreenManifestEntry> = new Map(
  SCREEN_MANIFEST.map((e) => [e.route, e]),
);

/** Look up a route's manifest entry, if one exists. */
export function getScreenManifestEntry(route: string): ScreenManifestEntry | undefined {
  return BY_ROUTE.get(route);
}
