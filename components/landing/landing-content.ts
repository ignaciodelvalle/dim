// Landing content model — miMAR public landing ("una mascota, muchas manos").
//
// Ported from docs/design_handoff_landing/landing2/data2.js (prototype content
// model). Copy is es-AR (voseo); identifiers in English. Event types are the
// REAL system event types, verbatim, as they appear in the event log.
//
// PAMPA is the narrative pet of the story AND the real seeded flagship pet the
// hero QR points at (see DEMO_PUBLIC_TOKEN below): portada name, QR target and
// /p all resolve to the same animal, scannable against /p/[publicToken].

import type { IconName } from "@/components/Icon";

// ---------------------------------------------------------------------------
// Narrative pet + demo QR target
// ---------------------------------------------------------------------------

export const PAMPA = {
  name: "Pampa",
  sex: "Hembra",
  age: "4 años",
} as const;

/**
 * Stable seeded flagship pet for the scannable hero QR — this IS Pampa. Seeded
 * by scripts/seed-flagship-pampa.ts with a fixed token so re-seeds recreate her:
 * a female dog owned by owner@dim.test ("Martín"), her `pampa-hero.jpg` portada
 * photo as primary_photo_id, a vet-signed antirrábica (so /p reads "verificada"
 * and al día), and the full LIBRETA_EVENTS story ending ALIVE + RECOVERED.
 * Must stay a LIVE, presentable pet: the hero is a funcionario's first
 * impression, so never point it at a deceased/lost pet. Portada name (Pampa),
 * QR target and /p now all agree — what you see is what the QR resolves to.
 */
export const DEMO_PUBLIC_TOKEN = "DIM-PAMP-0001";

// ---------------------------------------------------------------------------
// Cast — the four hands around the pet (CastFila, PO-locked variant)
// ---------------------------------------------------------------------------

export type LandingActor = {
  key: string;
  /** Chapter id this hand scrolls to (cap-{chapter}). */
  chapter: string;
  tone: "warm" | "neutral" | "official";
  icon: IconName;
  name: string;
  does: string;
};

export const ACTORS: LandingActor[] = [
  {
    key: "dueno",
    chapter: "dueno",
    tone: "warm",
    icon: "corazon",
    name: "Dueño",
    does: "Registra, comparte, activa el modo perdido.",
  },
  {
    key: "vet",
    chapter: "vet",
    tone: "neutral",
    icon: "vet",
    name: "Veterinario",
    does: "Firma vacunas y diagnósticos.",
  },
  {
    key: "org",
    chapter: "refugio",
    tone: "neutral",
    icon: "casa",
    name: "Organización",
    does: "Custodia, tránsitos y adopciones verificadas.",
  },
  {
    key: "estado",
    chapter: "estado",
    tone: "official",
    icon: "edificio",
    name: "Estado",
    does: "Vigila tendencias con datos reales.",
  },
];

// ---------------------------------------------------------------------------
// Chapters — Pampa's story, one hand per chapter
// ---------------------------------------------------------------------------

export type LandingChapter = {
  key: string;
  hand: string;
  /** Rail dot tone — drives the rail state (Pampa turns red on "anon"). */
  state: "registered" | "ok" | "lost" | "navy";
  /** Device side on desktop; the "estado" chapter is full-width. */
  side?: "l" | "r";
  full?: boolean;
  title?: string;
  lead?: string;
};

export const CHAPTERS: LandingChapter[] = [
  {
    key: "dueno",
    hand: "Dueño",
    state: "registered",
    side: "r",
    title: "Empieza en casa.",
    lead: "Martín registra a Pampa: identidad pública con QR y un historial listo para escribirse. Gratuito, en cinco minutos.",
  },
  {
    key: "vet",
    hand: "Veterinaria",
    state: "ok",
    side: "l",
    title: "El turno salió de la app.",
    lead: "Martín reservó por miMAR. La Dra. Romero — matrícula verificada — la vacunó y firmó el evento. Dato fiable, de origen.",
  },
  {
    key: "anon",
    hand: "Anónimo",
    state: "lost",
    side: "r",
    title: "Un martes, se pierde.",
    lead: "Alguien la encuentra en la plaza y escanea su QR. Sin cuenta y sin app: ve lo justo para ayudar y avisa.",
  },
  {
    key: "refugio",
    hand: "Refugio",
    state: "ok",
    side: "l",
    title: "La recibe el refugio más cercano.",
    lead: "Verifican el chip, miMAR dice quién es, y Martín ya está en camino. Custodia devuelta — y registrada.",
  },
  {
    key: "libreta",
    hand: "miMAR",
    state: "ok",
    side: "r",
    title: "Todo quedó escrito.",
    lead: "Cuatro manos, una sola historia. La línea de vida es de Pampa: inmutable — nada se edita, nada se borra.",
  },
  { key: "estado", hand: "Estado", state: "navy", full: true },
];

// ---------------------------------------------------------------------------
// Pampa's libreta — REAL system event types only, as seen in the app
// ---------------------------------------------------------------------------

export type LibretaEvent = {
  year: string;
  month: string;
  tone: "" | "ok" | "warn" | "err" | "warm" | "navy";
  title: string;
  meta: string;
  /** event_type verbatim (English, system vocabulary). */
  type: string;
  by: string;
  flag?: "lost" | "ok" | "sick";
  stamp?: "ok";
};

export const LIBRETA_EVENTS: LibretaEvent[] = [
  {
    year: "2022",
    month: "mar",
    tone: "warm",
    title: "Alta en el registro",
    meta: "Registrada por Martín · adopción particular",
    type: "pet_registered",
    by: "Martín · dueño",
  },
  {
    year: "2022",
    month: "abr",
    tone: "",
    title: "Microchip implantado",
    meta: "941 000 100 000 001 · interescapular",
    type: "microchip_implanted",
    by: "Dra. Romero · vet",
  },
  {
    year: "2022",
    month: "abr",
    tone: "ok",
    title: "Vacunación: antirrábica",
    meta: "Lote AR-2214 · refuerzo anual",
    type: "vaccination_administered",
    by: "Dra. Romero · vet",
    stamp: "ok",
  },
  {
    year: "2023",
    month: "feb",
    tone: "ok",
    title: "Castración",
    meta: "Sin complicaciones · Vet. Belgrano",
    type: "sterilization_performed",
    by: "Dra. Romero · vet",
  },
  {
    year: "2024",
    month: "mar",
    tone: "err",
    title: "Reportada perdida",
    meta: "Barrancas de Belgrano · alerta a vecinos en 1 km",
    type: "status_changed",
    by: "Martín · dueño",
    flag: "lost",
  },
  {
    year: "2024",
    month: "mar",
    tone: "",
    title: "Credencial escaneada",
    meta: "Un vecino escaneó su QR y avisó",
    type: "credential_scanned",
    by: "Anónimo · vía QR",
  },
  {
    year: "2024",
    month: "mar",
    tone: "",
    title: "Ingresó a un refugio",
    meta: "Refugio Patitas del Barrio · chip verificado",
    type: "shelter_intake_recorded",
    by: "Refugio · org",
  },
  {
    year: "2024",
    month: "mar",
    tone: "ok",
    title: "Volvió a casa",
    meta: "Custodia devuelta a su dueño",
    type: "status_changed",
    by: "Refugio · org",
    flag: "ok",
  },
  {
    year: "2024",
    month: "ago",
    tone: "warn",
    title: "Diagnóstico registrado",
    meta: "Dermatitis atópica · plan de tratamiento",
    type: "clinical_info_logged",
    by: "Dra. Romero · vet",
    flag: "sick",
  },
  {
    year: "2026",
    month: "jun",
    tone: "navy",
    title: "Refuerzo antirrábico",
    meta: "Campaña oficial · Comuna 13",
    type: "vaccination_administered",
    by: "Campaña · Estado",
    stamp: "ok",
  },
];

// ---------------------------------------------------------------------------
// Estado console — 24-jurisdiction cartogram (silhouette layout, celeste tint)
// ---------------------------------------------------------------------------

export type MapTile = {
  ab: string;
  name: string;
  /** Grid column (0-based) — schematic Argentina silhouette layout. */
  c: number;
  /** Grid row (0-based). */
  r: number;
  /** Zoonotic signals per 100k inhabitants, last 12 months (demo data). */
  v: number;
};

export const MAP_TILES: MapTile[] = [
  { ab: "JUJ", name: "Jujuy", c: 1, r: 0, v: 7.1 },
  { ab: "SAL", name: "Salta", c: 1, r: 1, v: 8.4 },
  { ab: "FOR", name: "Formosa", c: 3, r: 1, v: 9.2 },
  { ab: "MIS", name: "Misiones", c: 4, r: 1, v: 7.8 },
  { ab: "CAT", name: "Catamarca", c: 0, r: 2, v: 3.9 },
  { ab: "TUC", name: "Tucumán", c: 1, r: 2, v: 5.2 },
  { ab: "SDE", name: "S. del Estero", c: 2, r: 2, v: 6.3 },
  { ab: "CHA", name: "Chaco", c: 3, r: 2, v: 8.1 },
  { ab: "CTS", name: "Corrientes", c: 4, r: 2, v: 6.6 },
  { ab: "LRJ", name: "La Rioja", c: 0, r: 3, v: 2.8 },
  { ab: "CBA", name: "Córdoba", c: 2, r: 3, v: 3.4 },
  { ab: "SFE", name: "Santa Fe", c: 3, r: 3, v: 4.5 },
  { ab: "ERS", name: "Entre Ríos", c: 4, r: 3, v: 4.1 },
  { ab: "SJN", name: "San Juan", c: 0, r: 4, v: 2.2 },
  { ab: "SLU", name: "San Luis", c: 1, r: 4, v: 2.0 },
  { ab: "BUE", name: "Buenos Aires", c: 3, r: 4, v: 5.0 },
  { ab: "CABA", name: "CABA", c: 4, r: 4, v: 2.4 },
  { ab: "MZA", name: "Mendoza", c: 0, r: 5, v: 2.1 },
  { ab: "LPA", name: "La Pampa", c: 2, r: 5, v: 1.3 },
  { ab: "NQN", name: "Neuquén", c: 1, r: 6, v: 1.1 },
  { ab: "RNG", name: "Río Negro", c: 2, r: 6, v: 1.8 },
  { ab: "CHU", name: "Chubut", c: 1, r: 7, v: 0.9 },
  { ab: "SCZ", name: "Santa Cruz", c: 1, r: 8, v: 0.4 },
  { ab: "TDF", name: "T. del Fuego", c: 2, r: 9, v: 0.3 },
];

/** Celeste tint quantile (0–4) — silhouette map, single hue (PO decision #5). */
export function mapTintStep(v: number): 0 | 1 | 2 | 3 | 4 {
  if (v >= 8) return 4;
  if (v >= 6) return 3;
  if (v >= 4) return 2;
  if (v >= 1.5) return 1;
  return 0;
}

// Grouped by theme (PO landing feedback): the first pair is surveillance
// REACH — how wide the signal spreads (total signals + jurisdictions covered);
// the second pair is the RABIES-specific read (active observations + coverage).
export const CONSOLE_KPIS = [
  { label: "Señales zoonóticas · 12m", value: "1.982", tone: "warn" },
  { label: "Jurisdicciones con señal", value: "19/24", tone: "blue" },
  { label: "Observaciones antirrábicas", value: "214", tone: "danger" },
  { label: "Cobertura antirrábica", value: "72,4%", tone: "ok" },
] as const;

// ---------------------------------------------------------------------------
// Features — life moments (LifeSG naming; NO law citations in copy)
// ---------------------------------------------------------------------------

export type LifeMoment = {
  icon: IconName;
  title: string;
  body: string;
};

export const LIFE_MOMENTS: LifeMoment[] = [
  {
    icon: "alerta",
    title: "Vi un caso de maltrato",
    body: "Sin cuenta y sin login. Recibís un código de seguimiento y el caso lo toma la autoridad.",
  },
  {
    icon: "shield",
    title: "Mi perro mordió a alguien",
    body: "Tras una mordedura, el período de observación se abre, se sigue y se cierra en miMAR. Automático.",
  },
  {
    icon: "vacuna",
    title: "Hay campaña en mi barrio",
    body: "Las vacunaciones masivas cargan constancias solas; la cobertura se mide en tiempo real.",
  },
  {
    icon: "candado",
    title: "No quiero exponer mis datos",
    body: "Vos decidís qué se muestra; tu identidad nunca se publica.",
  },
  {
    icon: "corazon",
    title: "Quiero adoptar",
    body: "Catálogo nacional solo con organizaciones de acceso otorgado.",
  },
  {
    icon: "transferencia",
    title: "Cambió de familia",
    body: "Cada tránsito, adopción y transferencia queda registrada.",
  },
];

// ---------------------------------------------------------------------------
// FAQ — objection handling (NZ DIA pattern)
// ---------------------------------------------------------------------------

export const FAQS: Array<[string, string]> = [
  [
    "¿Cuánto cuesta?",
    "Nada, nunca. miMAR lo opera la autoridad sanitaria nacional y recuperar a tu mascota no tiene costo. Desconfiá de cualquiera que te pida dinero en su nombre.",
  ],
  [
    "¿Quién ve los datos de mi mascota?",
    "Vos ves todo. Quien escanea el QR ve solo lo que decidiste compartir. Cada profesional u organización accede según su rol.",
  ],
  [
    "¿Necesito microchip?",
    "No. La credencial QR funciona desde el día uno. Si tu mascota ya tiene chip, se asocia al mismo historial y suma una forma más de identificarla.",
  ],
  [
    "¿Reemplaza la libreta de papel?",
    "Tiene la misma información, firmada digitalmente. Mientras la homologación avanza jurisdicción por jurisdicción, conservá también la de papel.",
  ],
  [
    "¿Y si me roban el teléfono?",
    "miMAR no vive en tu teléfono: vive en el registro. Entrás desde cualquier dispositivo con tu cuenta, y la credencial pública sigue funcionando igual.",
  ],
];

// ---------------------------------------------------------------------------
// Empezar — 2 doors ONLY (owner + organization; gov/admin are invite-only)
// ---------------------------------------------------------------------------

export type LandingRole = {
  tone: "dueno" | "org";
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  ctaHref: string;
  cta2: string;
  cta2Href: string;
};

export const ROLES: LandingRole[] = [
  {
    tone: "dueno",
    icon: "corazon",
    eyebrow: "Soy dueño",
    title: "miMAR para tu mascota",
    body: "Identidad pública con QR, historial sanitario y modo perdido. Gratis.",
    cta: "Crear cuenta",
    ctaHref: "/signup",
    cta2: "Ya tengo cuenta",
    cta2Href: "/login",
  },
  {
    tone: "org",
    icon: "edificio",
    eyebrow: "Soy organización",
    title: "Solicitá acceso verificado",
    body: "Refugios, veterinarias, redes de rescate: custodia, adopciones y eventos sanitarios firmados.",
    cta: "Solicitar acceso",
    ctaHref: "/signup",
    cta2: "Ya tengo cuenta",
    cta2Href: "/login",
  },
];

// ---------------------------------------------------------------------------
// Footer nav — 3 columns, real routes only
// ---------------------------------------------------------------------------

export const FOOTER_NAV: Array<[string, Array<[string, string]>]> = [
  [
    "Ciudadanía",
    [
      ["Crear mi miMAR", "/signup"],
      ["Mascotas perdidas", "/perdidas"],
      ["Adoptar", "/adoptar"],
      ["Denunciar maltrato", "/denuncias/nueva"],
      ["Centro de ayuda", "/ayuda"],
      ["Sugerencias", "/sugerencias"],
    ],
  ],
  [
    "Operadores",
    [
      ["Organizaciones", "/signup"],
      ["Refugios", "/refugios"],
      ["Ingresar", "/login"],
    ],
  ],
  [
    "Institucional",
    [
      ["Acerca de miMAR", "/acerca"],
      ["Transparencia y datos", "/transparencia"],
      ["Funcionalidades", "/funcionalidades"],
      ["Marco legal", "/leyes"],
      ["Privacidad", "/privacidad"],
      ["Términos", "/terminos"],
      ["Cookies", "/cookies"],
      ["Accesibilidad", "/accesibilidad"],
    ],
  ],
];
