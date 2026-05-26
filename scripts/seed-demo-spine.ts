/**
 * DIM Demo Spine — assets adicionales sobre seed-demo.ts para que
 * los 5 ciclos del demo institucional corran sin altas mid-demo.
 *
 * Ejecutar DESPUÉS de seed-demo.ts:
 *   pnpm tsx scripts/seed-demo.ts
 *   pnpm tsx scripts/seed-demo-spine.ts
 *
 * Qué agrega:
 *   1. Argo  — perro callejero en intake en "Patitas del Norte", con
 *              historial precargado (intake + microchip + antirrábica +
 *              esterilización + 2 weight_recorded). NO publicado a
 *              adopción. El operador del refugio lo publica en vivo
 *              durante el cycle 3.
 *   2. Dra. Carla Pérez — usuario owner con dni_verified=true y un
 *              approval_request pendiente tipo 'role_upgrade_vet' para
 *              CABA Recoleta. Aparece en la cola de Lucas (cycle 5).
 *   3. Welfare reports — 5 anónimas + 3 institucionales (Patitas del
 *              Norte) distribuidas en CABA C1/C2/C14 en las últimas 4
 *              semanas. Pueblan /gob/maltrato y /denuncias/codigo
 *              (cycle 4 y cycle 5).
 *
 * Idempotente:
 *   Cada entidad se busca por una clave estable antes de insertarse.
 *   Re-correrlo no duplica nada.
 *
 * Notas:
 *   - Refusa correr contra Supabase no-local o NODE_ENV=production.
 *   - Comparte el patrón de log/safety de seed-demo.ts.
 *   - El org "Refugio Pendiente" (verified=false) que va a aprobar
 *     Lucas en cycle 5 ya está creado por seed-demo.ts — no se toca acá.
 */

// ---------------------------------------------------------------------------
// 1. Env bootstrap + safety
// ---------------------------------------------------------------------------

// Side-effect import — must come FIRST so DATABASE_URL is set before any
// downstream import evaluates db/index.ts (which throws on missing env).
// See scripts/_load-env.ts for why.
import "./_load-env";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const isLocalUrl = (u: string) => u.includes("127.0.0.1") || u.includes("localhost");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — aborting.");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV=production.");
  process.exit(2);
}
if (!isLocalUrl(SUPABASE_URL) || !isLocalUrl(DATABASE_URL)) {
  console.error(
    `Refusing to seed: NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) or DATABASE_URL is not local.`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 2. Logger
// ---------------------------------------------------------------------------

type LogLevel = "STEP" | "OK" | "SKIP" | "WARN" | "INFO" | "DONE" | "FAIL";
function log(level: LogLevel, msg: string): void {
  const tag = `[spine ${level}]`.padEnd(13);
  console.log(`${tag} ${msg}`);
}

// ---------------------------------------------------------------------------
// 3. Imports (DB-touching modules load AFTER env bootstrap)
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import * as schemas from "../db/schema";
import { generateApprovalRequestToken, generatePublicToken } from "../lib/publicToken";
import { generateReferenceCode } from "../lib/welfare-codes";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SHARED_PASSWORD = "Test1234!";

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

async function findOrgByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: schemas.organizations.id })
    .from(schemas.organizations)
    .where(eq(schemas.organizations.email, email))
    .limit(1);
  return row?.id ?? null;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  // List all users (small set in dev). Match by email.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error || !data) return null;
  const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  return found?.id ?? null;
}

async function findProfileByEmail(email: string): Promise<{ id: string } | null> {
  const authId = await findUserIdByEmail(email);
  if (!authId) return null;
  const [row] = await db
    .select({ id: schemas.profiles.id })
    .from(schemas.profiles)
    .where(eq(schemas.profiles.id, authId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// 5. Asset 1 — Argo (stray dog at Patitas del Norte)
// ---------------------------------------------------------------------------

const ARGO_PUBLIC_TOKEN = "DIM-ARGO-DEMO";
const PATITAS_EMAIL = "contacto@patitasdelnorte.test";

async function seedArgo(): Promise<void> {
  log("STEP", "Asset 1 — Argo (stray dog at Patitas del Norte)");

  const orgId = await findOrgByEmail(PATITAS_EMAIL);
  if (!orgId) {
    log("FAIL", `No se encontró org ${PATITAS_EMAIL}. ¿Corriste seed-demo.ts primero?`);
    return;
  }

  const [existing] = await db
    .select({ id: schemas.pets.id })
    .from(schemas.pets)
    .where(eq(schemas.pets.publicToken, ARGO_PUBLIC_TOKEN))
    .limit(1);

  if (existing) {
    log("SKIP", `Argo (${ARGO_PUBLIC_TOKEN}) ya existe.`);
    return;
  }

  const intakeDate = daysAgo(30);
  const microchipDate = daysAgo(28);
  const vaccineDate = daysAgo(25);
  const sterilizationDate = daysAgo(20);
  const weight1 = daysAgo(28);
  const weight2 = daysAgo(10);

  const [pet] = await db
    .insert(schemas.pets)
    .values({
      publicToken: ARGO_PUBLIC_TOKEN,
      species: "dog",
      breed: "Mestizo",
      name: "Argo",
      sex: "male",
      dateOfBirth: "2023-08-15",
      birthDateIsEstimated: true,
      color: "Marrón con manchas blancas",
      distinguishingFeatures: "Oreja izquierda con muesca",
      microchipId: "858985112999000111",
      microchipCountryCode: "858",
      microchipImplantedAt: microchipDate.toISOString().slice(0, 10),
      microchipImplantedBy: "Refugio Patitas del Norte",
      microchipLocation: "interscapular_left",
      estimatedWeightKg: "22.5",
      potentiallyDangerousBreed: false,
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
      jurisdictionLocality: "Palermo",
      acquisitionMethod: "found_stray",
      emergencyInfoVisible: false,
      status: "active",
    })
    .returning({ id: schemas.pets.id });

  await db.insert(schemas.ownerships).values({
    petId: pet.id,
    ownerUserId: null,
    ownerOrganizationId: orgId,
    role: "shelter_custody",
  });

  const events = [
    {
      eventType: "shelter_intake_recorded",
      occurredAt: intakeDate,
      payload: {
        intake_kind: "stray",
        location_found: "Av. Santa Fe y Coronel Díaz, Palermo",
        condition_on_intake: "regular",
        notes: "Encontrado deambulando. Sin chip. Aproximadamente 2 años.",
      },
    },
    {
      eventType: "microchip_implanted",
      occurredAt: microchipDate,
      payload: {
        chip_id: "858985112999000111",
        country_code: "858",
        standard: "ISO 11784/11785",
        implanted_by: "Refugio Patitas del Norte",
        location: "interscapular_left",
      },
    },
    {
      eventType: "vaccination_administered",
      occurredAt: vaccineDate,
      payload: {
        vaccine_name: "Antirrábica + DHPP",
        lot_number: "LOT-A2026-457",
        next_due_at: daysAgo(-340).toISOString().slice(0, 10),
        applied_by: "Patitas del Norte (campaña interna)",
      },
    },
    {
      eventType: "sterilization_performed",
      occurredAt: sterilizationDate,
      payload: {
        procedure: "orchiectomy",
        notes: "Recuperación sin complicaciones.",
      },
    },
    {
      eventType: "weight_recorded",
      occurredAt: weight1,
      payload: { weight_kg: 21.0 },
    },
    {
      eventType: "weight_recorded",
      occurredAt: weight2,
      payload: { weight_kg: 22.5 },
    },
  ] as const;

  for (const e of events) {
    await db.insert(schemas.petEvents).values({
      petId: pet.id,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      authorRole: "shelter",
      authorOrganizationId: orgId,
      authorVerified: true,
      payload: e.payload as Record<string, unknown>,
    });
  }

  log(
    "OK",
    `Argo creado (${ARGO_PUBLIC_TOKEN}) — ${events.length} eventos, en custodia de Patitas del Norte`,
  );
}

// ---------------------------------------------------------------------------
// 6. Asset 2 — Dra. Carla Pérez (pending vet upgrade)
// ---------------------------------------------------------------------------

const CARLA_EMAIL = "carla@dim.test";

async function seedCarlaVetUpgrade(): Promise<void> {
  log("STEP", "Asset 2 — Dra. Carla Pérez (pending vet upgrade)");

  // 1) crear o resolver auth user
  let authId = await findUserIdByEmail(CARLA_EMAIL);
  if (!authId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: CARLA_EMAIL,
      password: SHARED_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Dra. Carla Pérez", user_role: "owner" },
    });
    if (error || !data.user) {
      log("FAIL", `No pude crear auth user para ${CARLA_EMAIL}: ${error?.message}`);
      return;
    }
    authId = data.user.id;
    log("OK", `Auth user creado para ${CARLA_EMAIL}`);
  } else {
    log("SKIP", `Auth user ${CARLA_EMAIL} ya existe`);
  }

  // 2) profile
  const [existingProfile] = await db
    .select({ id: schemas.profiles.id })
    .from(schemas.profiles)
    .where(eq(schemas.profiles.id, authId))
    .limit(1);

  if (!existingProfile) {
    await db.insert(schemas.profiles).values({
      id: authId,
      accountType: "personal",
      role: "owner",
      displayName: "Dra. Carla Pérez",
      dniNumber: "32145678",
      dniVerified: true,
    });
    log("OK", "Profile de Carla creado con DNI verificado");
  } else {
    log("SKIP", "Profile de Carla ya existe");
  }

  // 3) approval_request pendiente
  const [existingReq] = await db
    .select({ id: schemas.approvalRequests.id })
    .from(schemas.approvalRequests)
    .where(
      and(
        eq(schemas.approvalRequests.applicantUserId, authId),
        eq(schemas.approvalRequests.type, "role_upgrade_vet"),
        eq(schemas.approvalRequests.status, "pending"),
      ),
    )
    .limit(1);

  if (existingReq) {
    log("SKIP", "Approval request de Carla ya existe en estado pending");
    return;
  }

  await db.insert(schemas.approvalRequests).values({
    publicToken: generateApprovalRequestToken(),
    type: "role_upgrade_vet",
    status: "pending",
    applicantUserId: authId,
    initiatedBy: "self",
    initiatedByUserId: authId,
    targetUserId: authId,
    targetOrganizationId: null,
    jurisdictionCountry: "AR",
    jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
    jurisdictionLocality: "Recoleta",
    payload: {
      matricula_number: "MV-CABA-08847",
      matricula_jurisdiccion: "Ciudad Autónoma de Buenos Aires",
      colegio_emisor: "Colegio Médico Veterinario de CABA",
      especialidad: "Clínica de pequeños animales",
      evidence_summary:
        "Matrícula vigente · Título UBA Veterinaria 2018 · 7 años de práctica en clínica privada",
    },
  });

  log("OK", "Approval request pending creado para Carla → Lucas la aprueba en cycle 5");
}

// ---------------------------------------------------------------------------
// 7. Asset 3 — Welfare reports (denuncias) previas
// ---------------------------------------------------------------------------

type WelfareKind =
  | "abandonment"
  | "neglect"
  | "physical_abuse"
  | "chained"
  | "no_shelter"
  | "hoarding"
  | "dog_fighting"
  | "trafficking"
  | "other";

type WelfareSeverity = "low" | "medium" | "high" | "critical";

interface ReportSpec {
  daysAgo: number;
  kind: WelfareKind;
  severity: WelfareSeverity;
  description: string;
  locality: string;
  anonymous: boolean;
  contactEmail?: string;
}

const REPORTS: ReportSpec[] = [
  // Anónimas
  {
    daysAgo: 27,
    kind: "abandonment",
    severity: "high",
    description:
      "Vi a alguien dejando dos cachorros en una caja en la esquina y se fue en un auto.",
    locality: "Recoleta",
    anonymous: true,
  },
  {
    daysAgo: 21,
    kind: "neglect",
    severity: "medium",
    description:
      "Perro encadenado al sol todo el día, no tiene agua ni refugio. Vecinos del edificio escuchan llantos.",
    locality: "Palermo",
    anonymous: true,
  },
  {
    daysAgo: 14,
    kind: "physical_abuse",
    severity: "critical",
    description: "Una persona patea al perro de su vecino cada vez que lo cruza en la entrada.",
    locality: "Recoleta",
    anonymous: true,
  },
  {
    daysAgo: 9,
    kind: "hoarding",
    severity: "high",
    description:
      "Departamento con olor fuerte a orina. Se escuchan muchos gatos. Vecinos del PB lo reportaron al consorcio.",
    locality: "Caballito",
    anonymous: true,
  },
  {
    daysAgo: 3,
    kind: "no_shelter",
    severity: "medium",
    description: "Perro en patio sin techo bajo la tormenta de ayer. Sigue afuera hoy.",
    locality: "Palermo",
    anonymous: true,
  },
  // Institucionales (Patitas del Norte)
  {
    daysAgo: 12,
    kind: "abandonment",
    severity: "high",
    description:
      "Tomamos intake de 4 gatos abandonados en bolsa de cartón frente al refugio. Confirmamos identidad del responsable por cámara del local de al lado.",
    locality: "Recoleta",
    anonymous: false,
    contactEmail: PATITAS_EMAIL,
  },
  {
    daysAgo: 6,
    kind: "neglect",
    severity: "high",
    description:
      "Caso visto durante operativo de castración: perro con desnutrición severa, dueño se niega a recibir tratamiento. Adjuntamos parte veterinario.",
    locality: "Caballito",
    anonymous: false,
    contactEmail: PATITAS_EMAIL,
  },
  {
    daysAgo: 2,
    kind: "dog_fighting",
    severity: "critical",
    description:
      "Sospecha fuerte de organización de peleas clandestinas. Tres perros recibidos con heridas compatibles. Reporte detallado para autoridad sanitaria.",
    locality: "Palermo",
    anonymous: false,
    contactEmail: PATITAS_EMAIL,
  },
];

async function seedWelfareReports(): Promise<void> {
  log("STEP", `Asset 3 — Welfare reports (${REPORTS.length} denuncias previas)`);

  const orgId = await findOrgByEmail(PATITAS_EMAIL);
  if (!orgId) {
    log("WARN", `No se encontró org ${PATITAS_EMAIL}, salteando institucionales.`);
  }

  for (const r of REPORTS) {
    // Idempotencia: buscar por description (es estable y única por reporte)
    const [existing] = await db
      .select({ id: schemas.welfareReports.id })
      .from(schemas.welfareReports)
      .where(eq(schemas.welfareReports.description, r.description))
      .limit(1);

    if (existing) {
      log("SKIP", `Denuncia "${r.description.slice(0, 50)}..." ya existe`);
      continue;
    }

    const reporterOrgId = !r.anonymous && r.contactEmail === PATITAS_EMAIL ? orgId : null;

    await db.insert(schemas.welfareReports).values({
      referenceCode: generateReferenceCode(),
      reporterUserId: null,
      reporterOrganizationId: reporterOrgId,
      reporterContactEmail: r.anonymous ? null : (r.contactEmail ?? null),
      reporterContactPhone: null,
      kind: r.kind,
      severity: r.severity,
      description: r.description,
      subjectKind: "unowned_animal",
      subjectPetId: null,
      subjectDescription: null,
      locationAddress: null,
      jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
      jurisdictionLocality: r.locality,
      occurredAt: daysAgo(r.daysAgo),
      status: "open",
      createdAt: daysAgo(r.daysAgo),
    } as any);

    const flag = r.anonymous ? "anónima" : "institucional (Patitas del Norte)";
    log("OK", `Denuncia ${r.kind}/${r.severity} ${flag} en ${r.locality}, hace ${r.daysAgo} días`);
  }
}

// ---------------------------------------------------------------------------
// 8. Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("INFO", "DIM Demo Spine — comenzando.");
  log("INFO", `Supabase URL: ${SUPABASE_URL}`);

  try {
    await seedArgo();
    await seedCarlaVetUpgrade();
    await seedWelfareReports();
    log("DONE", "Spine seeded. Cycles 1, 3, 4 y 5 listos.");
    log("INFO", "Próximo paso: ver docs/demo-runbook.md para el guión de ensayo.");
  } catch (e) {
    log("FAIL", `Error: ${(e as Error).message}`);
    console.error(e);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
