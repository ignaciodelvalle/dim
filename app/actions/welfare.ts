"use server";

// Server action for animal-cruelty / welfare reports ("denuncia de
// maltrato animal"). Reports can be filed by logged-in users (linked
// via reporter_user_id) or anonymously (reporter_user_id null). After
// the row is inserted, signalWelfareReport is called as the
// integration placeholder — today a no-op.
//
// TODO(rate-limit): anonymous insertions should be rate-limited at the
// edge (Vercel middleware or a Supabase Edge Function) to prevent spam.
// Out of scope for v1.

import { db, pets, welfareReports } from "@/db";
import { signalWelfareReport } from "@/lib/authority";
import { parseDateInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type WelfareReportFormState = {
  error: string | null;
};

const KINDS = [
  "abandonment",
  "neglect",
  "physical_abuse",
  "chained",
  "no_shelter",
  "hoarding",
  "dog_fighting",
  "trafficking",
  "other",
];
const SEVERITIES = ["low", "medium", "high", "critical"];
const SUBJECT_KINDS = ["registered_pet", "unowned_animal", "location", "general"];

export async function createWelfareReportAction(
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read fields (most optional)
  const kind = String(formData.get("kind") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const locationAddress = String(formData.get("locationAddress") ?? "").trim() || null;
  const jurisdictionProvince = String(formData.get("jurisdictionProvince") ?? "").trim() || null;
  const jurisdictionLocality = String(formData.get("jurisdictionLocality") ?? "").trim() || null;
  const locationLatRaw = String(formData.get("locationLat") ?? "").trim();
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const reporterContactEmail = String(formData.get("reporterContactEmail") ?? "").trim() || null;
  const reporterContactPhone = String(formData.get("reporterContactPhone") ?? "").trim() || null;

  // Validate
  if (!KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (!SEVERITIES.includes(severity)) return { error: "Gravedad inválida." };
  if (!description) return { error: "Falta la descripción de la situación." };
  if (description.length < 20)
    return {
      error: "La descripción debe tener al menos 20 caracteres para poder ser actuable.",
    };
  if (!SUBJECT_KINDS.includes(subjectKind)) return { error: "Sujeto de la denuncia inválido." };

  // Resolve subject pet (when subject_kind === "registered_pet" and a token was provided)
  let subjectPetId: string | null = null;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    const [pet] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, subjectPetToken))
      .limit(1);
    if (!pet) return { error: "Mascota con ese token no encontrada. Verificá el código." };
    subjectPetId = pet.id;
  }

  // For unowned/location/general kinds, require subjectDescription
  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  const locationLat = locationLatRaw ? Number.parseFloat(locationLatRaw) : null;
  const locationLng = locationLngRaw ? Number.parseFloat(locationLngRaw) : null;
  if (locationLatRaw && (locationLat === null || !Number.isFinite(locationLat))) {
    return { error: "Latitud inválida." };
  }
  if (locationLngRaw && (locationLng === null || !Number.isFinite(locationLng))) {
    return { error: "Longitud inválida." };
  }

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  type NewWelfareReport = typeof welfareReports.$inferInsert;

  let insertedId: string | null = null;
  try {
    const [row] = await db
      .insert(welfareReports)
      .values({
        reporterUserId: user?.id ?? null,
        reporterContactEmail,
        reporterContactPhone,
        kind: kind as NewWelfareReport["kind"],
        severity: severity as NewWelfareReport["severity"],
        description,
        subjectKind: subjectKind as NewWelfareReport["subjectKind"],
        subjectPetId,
        subjectDescription,
        locationAddress,
        jurisdictionProvince,
        jurisdictionLocality,
        locationLat,
        locationLng,
        occurredAt,
      })
      .returning({ id: welfareReports.id });
    insertedId = row.id;
  } catch (err) {
    return {
      error: `No se pudo registrar la denuncia: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  await signalWelfareReport({
    reportId: insertedId,
    kind,
    severity,
    jurisdictionProvince,
    jurisdictionLocality,
    hasContact: Boolean(reporterContactEmail || reporterContactPhone),
  });

  // Authenticated users go to mis denuncias; anon goes to confirmation
  // (use /denuncias/nueva?ok=1 for v1 — no dedicated confirmation page yet).
  redirect(user ? "/denuncias/mias" : "/denuncias/nueva?ok=1");
}
