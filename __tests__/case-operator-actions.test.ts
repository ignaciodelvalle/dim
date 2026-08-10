/**
 * Tests de integración para las acciones de operador del detalle de caso (#41).
 *
 * El caso que da nombre a todo esto es el último: dos cierres concurrentes
 * tienen que dejar UN solo `case_closed`. `case_events` es append-only por
 * trigger, así que un evento de más no se borra ni se corrige — el expediente
 * quedaría contando dos cierres de un caso que se cerró una vez.
 */

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { caseEvents, cases, db, profiles } from "@/db";
import {
  CLOSE_REASON_MIN_LENGTH,
  NOTE_MIN_LENGTH,
  addOperatorNote,
  closeCaseManually,
  countCloseEvents,
} from "@/src/modules/cases/application/operator-actions";
import { CasesRepository } from "@/src/modules/cases/infrastructure/cases-repository";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const ACTOR_EMAIL = "case-ops-actor@dim-test.local";
const OTHER_EMAIL = "case-ops-other@dim-test.local";
const PASS = "CaseOps_2026!";

let actorId: string;
let otherId: string;
const createdCaseIds: string[] = [];

const repo = new CasesRepository();

async function purge(email: string) {
  const { data } = await admin.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  for (const uid of ids) await db.delete(profiles).where(eq(profiles.id, uid));
  if (found) await admin.auth.admin.deleteUser(found.id);
}

async function makeUser(email: string): Promise<string> {
  const r = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (r.error || !r.data.user) throw new Error(`createUser(${email}): ${r.error?.message}`);
  return r.data.user.id;
}

/** Un `custody_episode` abierto — el único kind con cierre manual declarado. */
async function makeCustodyEpisode(): Promise<{ id: string; publicCode: string }> {
  const publicCode = await repo.generateUniqueCasePublicCode();
  const [row] = await db
    .insert(cases)
    .values({
      publicCode,
      caseKind: "custody_episode",
      status: "open",
      jurisdictionCountry: "AR",
      // unowned_animal, no registered_pet: la CHECK del schema ata registered_pet
      // a que primary_pet_id no sea null, y estos casos de prueba no tienen mascota.
      primarySubjectKind: "unowned_animal",
    })
    .returning({ id: cases.id, publicCode: cases.publicCode });
  createdCaseIds.push(row.id);
  return row;
}

/** Un `lost_pet_episode` abierto — sin cierre manual declarado. */
async function makeLostEpisode(): Promise<{ id: string; publicCode: string }> {
  const publicCode = await repo.generateUniqueCasePublicCode();
  const [row] = await db
    .insert(cases)
    .values({
      publicCode,
      caseKind: "lost_pet_episode",
      status: "open",
      jurisdictionCountry: "AR",
      // unowned_animal, no registered_pet: la CHECK del schema ata registered_pet
      // a que primary_pet_id no sea null, y estos casos de prueba no tienen mascota.
      primarySubjectKind: "unowned_animal",
    })
    .returning({ id: cases.id, publicCode: cases.publicCode });
  createdCaseIds.push(row.id);
  return row;
}

beforeAll(async () => {
  await purge(ACTOR_EMAIL);
  await purge(OTHER_EMAIL);
  actorId = await makeUser(ACTOR_EMAIL);
  otherId = await makeUser(OTHER_EMAIL);
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of createdCaseIds) {
      await tx.delete(caseEvents).where(eq(caseEvents.caseId, id));
      await tx.delete(cases).where(eq(cases.id, id));
    }
  });
  await purge(ACTOR_EMAIL);
  await purge(OTHER_EMAIL);
});

describe("addOperatorNote", () => {
  it("asienta la nota y queda legible en el expediente", async () => {
    const c = await makeCustodyEpisode();
    const res = await addOperatorNote({
      publicCode: c.publicCode,
      actorUserId: actorId,
      text: "Se contactó al refugio receptor por teléfono; confirman recepción mañana.",
    });

    expect(res).toEqual({ ok: true });

    const rows = await db.select().from(caseEvents).where(eq(caseEvents.caseId, c.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].entryType).toBe("operator_note");
    expect(rows[0].recordedByUserId).toBe(actorId);
    expect(rows[0].notes).toContain("refugio receptor");
  });

  it("rechaza una nota vacía o demasiado corta, sin escribir nada", async () => {
    const c = await makeCustodyEpisode();
    const res = await addOperatorNote({
      publicCode: c.publicCode,
      actorUserId: actorId,
      text: "ok",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(String(NOTE_MIN_LENGTH));

    const rows = await db.select().from(caseEvents).where(eq(caseEvents.caseId, c.id));
    expect(rows).toHaveLength(0);
  });

  it("no deja asentar sobre un expediente cerrado", async () => {
    const c = await makeCustodyEpisode();
    await repo.closeCase({ caseId: c.id, reason: "resolved", closedByUserId: actorId });

    const res = await addOperatorNote({
      publicCode: c.publicCode,
      actorUserId: actorId,
      text: "Una nota que llega tarde a un expediente ya cerrado.",
    });

    expect(res.ok).toBe(false);
  });
});

describe("closeCaseManually", () => {
  it("cierra un custody_episode y deja UN case_closed con el motivo", async () => {
    const c = await makeCustodyEpisode();
    const res = await closeCaseManually({
      publicCode: c.publicCode,
      actorUserId: actorId,
      reason: "El decomiso se dejó sin efecto por resolución de la autoridad sanitaria.",
    });

    expect(res).toEqual({ ok: true });

    const [row] = await db.select().from(cases).where(eq(cases.id, c.id));
    expect(row.status).toBe("closed");
    expect(row.closedByUserId).toBe(actorId);
    // La categoría va en la fila; la prosa en el evento, que es donde se lee.
    expect(row.closedReason).toBe("cancelled");

    expect(await countCloseEvents(c.id)).toBe(1);
    const [evt] = await db.select().from(caseEvents).where(eq(caseEvents.caseId, c.id));
    expect(evt.notes).toContain("sin efecto");
  });

  it("NO cierra un kind cuyo ciclo de vida no lo declara", async () => {
    const c = await makeLostEpisode();
    const res = await closeCaseManually({
      publicCode: c.publicCode,
      actorUserId: actorId,
      reason: "Intento de cierre manual sobre un kind que no lo admite.",
    });

    expect(res.ok).toBe(false);

    const [row] = await db.select().from(cases).where(eq(cases.id, c.id));
    expect(row.status).toBe("open");
    expect(await countCloseEvents(c.id)).toBe(0);
  });

  it("exige un motivo proporcional a lo que un cierre significa", async () => {
    const c = await makeCustodyEpisode();
    const res = await closeCaseManually({
      publicCode: c.publicCode,
      actorUserId: actorId,
      reason: "listo",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(String(CLOSE_REASON_MIN_LENGTH));

    const [row] = await db.select().from(cases).where(eq(cases.id, c.id));
    expect(row.status).toBe("open");
  });

  // EL TEST QUE JUSTIFICA TODO EL ORDEN.
  it("dos cierres concurrentes dejan UN solo case_closed, y el perdedor lo sabe", async () => {
    const c = await makeCustodyEpisode();

    const [a, b] = await Promise.all([
      closeCaseManually({
        publicCode: c.publicCode,
        actorUserId: actorId,
        reason: "Cierre A — la autoridad da por terminado el expediente de custodia.",
      }),
      closeCaseManually({
        publicCode: c.publicCode,
        actorUserId: otherId,
        reason: "Cierre B — otro operador cerrando el mismo expediente a la vez.",
      }),
    ]);

    // Exactamente uno gana. El otro recibe un error que le dice qué pasó, en vez
    // de un ok que lo haría creer que cerró él.
    const ganadores = [a, b].filter((r) => r.ok);
    expect(ganadores).toHaveLength(1);

    const perdedor = [a, b].find((r) => !r.ok);
    // El perdedor tiene que saber QUE PERDIÓ, no leer que la acción no existe.
    // Que el pre-chequeo vea el caso ya cerrado o que lo vea closeCaseOwned es
    // un detalle de timing; el mensaje tiene que decir lo mismo en los dos.
    expect(perdedor && !perdedor.ok && perdedor.error).toMatch(
      /ya está cerrado|cerró este expediente/i,
    );

    // Y lo que de verdad importa: el registro cuenta UN cierre. `case_events` es
    // append-only por trigger — un evento de más sería permanente.
    expect(await countCloseEvents(c.id)).toBe(1);

    const [row] = await db.select().from(cases).where(eq(cases.id, c.id));
    expect(row.status).toBe("closed");
    expect([actorId, otherId]).toContain(row.closedByUserId);
  });
});
