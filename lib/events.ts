import { sql } from "drizzle-orm";

import { findDisease } from "@/lib/diseases";
import { welfareReportKindLabel } from "@/src/modules/welfare/domain/types";

/**
 * Drizzle WHERE clause that excludes the noise floor of "I scanned my own
 * pet's QR" events. Used by every owner-facing timeline query — owners
 * shouldn't see their own self-scans by default, since they generate one
 * per page load and would drown out the real history.
 *
 * `payload->>'is_self_scan' = 'true'` checks the JSONB key as text. Events
 * older than the credential_scanned payload schema (which has always
 * carried is_self_scan since v1) don't exist, so no back-compat fallback.
 *
 * Use as: `where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))`.
 */
export function excludeSelfScansClause() {
  return sql`NOT (event_type = 'credential_scanned' AND payload->>'is_self_scan' = 'true')`;
}

export type EventPayloadSummary = {
  primary: string | null;
  secondary: string | null;
};

export function eventPayloadSummary(eventType: string, payload: unknown): EventPayloadSummary {
  const p = (payload ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null => {
    const v = p[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  switch (eventType) {
    case "vaccination_administered": {
      const vaccine = str("vaccine_name");
      const adminBy = str("administered_by");
      const brand = str("brand");
      const tail = [adminBy, brand].filter(Boolean).join(" · ") || null;
      return {
        primary: vaccine ? `Vacuna: ${vaccine}` : null,
        secondary: tail,
      };
    }
    case "deworming_administered": {
      const product = str("product");
      const typeRaw = str("type");
      const typeLabel =
        typeRaw === "internal"
          ? "interno"
          : typeRaw === "external"
            ? "externo"
            : typeRaw === "both"
              ? "interno + externo"
              : null;
      return {
        primary: product ? `Antiparasitario: ${product}` : null,
        secondary: typeLabel,
      };
    }
    case "sterilization_performed": {
      const procedure = str("procedure");
      const performedBy = str("performed_by");
      const clinic = str("clinic");
      const procedureLabel =
        procedure === "castration"
          ? "castración"
          : procedure === "spay"
            ? "ovariectomía"
            : procedure;
      const tail = [performedBy, clinic].filter(Boolean).join(" · ") || null;
      return {
        primary: procedure ? `Esterilización: ${procedureLabel}` : null,
        secondary: tail,
      };
    }
    case "microchip_implanted": {
      const chip = str("chip_number");
      const by = str("implanted_by");
      return {
        primary: chip ? `Microchip implantado · ${chip}` : null,
        secondary: by,
      };
    }
    case "microchip_replaced": {
      const previous = str("previous_chip_number");
      const next = str("new_chip_number");
      const reason = str("reason");
      // new_chip_number === null means revocation (chip retired without
      // replacement). Reads as a separate verb on the timeline.
      if (next === null) {
        return {
          primary: previous ? `Microchip revocado · ${previous}` : "Microchip revocado",
          secondary: reason,
        };
      }
      return {
        primary: next ? `Microchip reemplazado · ${next}` : "Microchip reemplazado",
        secondary: previous ? `Anterior: ${previous}` : reason,
      };
    }
    case "dangerous_breed_attested": {
      const registry = str("registry");
      const registryId = str("registry_id");
      const registryLabel =
        registry === "caba_4078"
          ? "CABA · Ley 4078"
          : registry === "prov_14107"
            ? "Prov. Bs. As. · Ley 14.107"
            : registry === "other"
              ? "Otro registro"
              : null;
      return {
        primary: registryLabel
          ? `Atestación PPP · ${registryLabel}`
          : "Atestación de raza peligrosa",
        secondary: registryId ? `Nº ${registryId}` : null,
      };
    }
    case "weight_recorded": {
      const kg = str("kg");
      return {
        primary: kg ? `Peso: ${kg} kg` : null,
        secondary: null,
      };
    }
    case "vet_visit_logged": {
      const reason = str("reason");
      const vetName = str("vet_name");
      const clinic = str("clinic");
      const tail = [vetName, clinic].filter(Boolean).join(" · ") || null;
      return {
        primary: reason ? `Visita: ${reason}` : null,
        secondary: tail,
      };
    }
    case "note_added": {
      const text = str("text");
      const cat = str("category");
      return {
        primary: text ? `Nota: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}` : null,
        secondary: cat ? cat.replace(/_/g, " ") : null,
      };
    }
    case "medication_started": {
      const drugName = str("drug_name");
      const dose = str("dose");
      const frequency = str("frequency");
      const secondary = [dose, frequency].filter(Boolean).join(" · ") || null;
      return {
        primary: drugName ? `Inicio: ${drugName}` : null,
        secondary,
      };
    }
    case "medication_stopped": {
      const reason = str("reason");
      return {
        primary: "Fin de medicación",
        secondary: reason,
      };
    }
    case "medication_dose_taken": {
      const scheduledFor = str("scheduled_for");
      return {
        primary: "Dosis dada",
        secondary: scheduledFor ? `Programada para ${scheduledFor}` : null,
      };
    }
    case "death_recorded": {
      const cause = str("cause");
      const causeDetail = str("cause_detail");
      const disposition = str("disposition_method");
      const facility = str("facility");
      const diseaseCode = str("disease_code");
      const isReportablePayload = p.is_reportable === true;
      const deathAtClinic = p.death_at_clinic === true;
      const clinicName = str("clinic_name");
      const vetDecidedAlone = p.vet_decided_alone === true;

      const causeLabel: Record<string, string> = {
        known: "Conocida",
        unknown: "Desconocida",
        natural: "Natural / vejez",
        disease: "Enfermedad",
        accident: "Accidente",
        euthanasia: "Eutanasia",
        sudden: "Repentina",
        violent: "Violenta",
        other: "Otra",
      };
      const dispositionLabel: Record<string, string> = {
        cremation_collective: "Cremación colectiva",
        cremation_individual_ashes: "Cremación individual (cenizas)",
        authorized_cemetery: "Cementerio autorizado",
        owner_burial: "Sepultura por el propietario",
        household_waste: "Residuos no especiales",
        rendering: "Reciclaje sanitario",
        unknown: "No sé",
        // Legacy values from events recorded before the enum split — keep rendering them.
        cremation: "Cremación",
        burial: "Entierro",
      };

      // When cause is "disease", use the resolved disease label if available.
      let primary: string;
      if (cause === "disease") {
        const diseaseDef = findDisease(diseaseCode);
        const diseaseLabel = diseaseDef?.label ?? causeLabel.disease;
        primary = `Fallecimiento · ${diseaseLabel}`;
      } else {
        const showCause = cause && cause !== "other" && causeLabel[cause];
        primary = showCause ? `Fallecimiento · ${causeLabel[cause]}` : "Fallecimiento";
      }

      const dispositionStr = disposition ? (dispositionLabel[disposition] ?? disposition) : null;
      const clinicStr = deathAtClinic
        ? clinicName
          ? `En clínica: ${clinicName}`
          : "En clínica"
        : null;
      const vetAloneStr = vetDecidedAlone ? "Vet decidió sin contacto con propietario" : null;
      let secondary =
        [dispositionStr, facility, clinicStr, vetAloneStr].filter(Boolean).join(" · ") ||
        causeDetail;

      if (isReportablePayload) {
        const badge = "Reportable a autoridad sanitaria";
        secondary = secondary ? `${secondary} · ${badge}` : badge;
      }

      return { primary, secondary: secondary || null };
    }
    case "clinical_info_logged": {
      const subKind = str("sub_kind");
      const title = str("title");
      const subKindLabels: Record<string, string> = {
        lab_work: "Laboratorio",
        imaging: "Imagen",
        surgery: "Cirugía",
        allergy_detection: "Alergia",
        other: "Otro",
      };
      const subKindLabel = subKind ? (subKindLabels[subKind] ?? subKind) : null;
      return {
        primary: subKindLabel ? `Información clínica · ${subKindLabel}` : "Información clínica",
        secondary: title ? (title.length > 60 ? `${title.slice(0, 60)}…` : title) : null,
      };
    }
    case "maltreatment_reported": {
      const kindRaw = str("kind");
      const description = str("description");
      const kindLabel = kindRaw ? welfareReportKindLabel(kindRaw) : null;
      return {
        primary: kindLabel ? `Denuncia: maltrato · ${kindLabel}` : "Denuncia: maltrato",
        secondary: description
          ? description.length > 60
            ? `${description.slice(0, 60)}…`
            : description
          : null,
      };
    }
    case "abandonment_reported": {
      const description = str("description");
      return {
        primary: "Denuncia: abandono",
        secondary: description
          ? description.length > 60
            ? `${description.slice(0, 60)}…`
            : description
          : null,
      };
    }
    case "symptom_observed": {
      const symptoms = str("symptoms");
      return {
        primary: "Síntomas observados",
        secondary: symptoms
          ? symptoms.length > 60
            ? `${symptoms.slice(0, 60)}…`
            : symptoms
          : null,
      };
    }
    case "status_changed": {
      const toStatus = str("to_status");
      // Prefer the canonical `location_description` key; fall back to the
      // legacy `last_known_location` for events written before the rename.
      const loc = str("location_description") ?? str("last_known_location");
      const reason = str("reason");
      let primary: string | null = null;
      if (toStatus === "lost") primary = "Marcada como perdida";
      else if (toStatus === "active") primary = "Marcada como encontrada";
      return {
        primary,
        secondary: loc || reason,
      };
    }
    case "foster_proposal_resolved": {
      const outcome = str("outcome");
      const map: Record<string, string> = {
        accepted: "Propuesta de tránsito aceptada",
        rejected: "Propuesta de tránsito rechazada",
        cancelled: "Propuesta de tránsito cancelada",
        expired: "Propuesta de tránsito expirada",
      };
      return {
        primary: (outcome && map[outcome]) || "Propuesta de tránsito resuelta",
        secondary: str("response_notes") ?? str("cancellation_reason") ?? null,
      };
    }
    case "adoption_reversed": {
      const actor = str("actor");
      const map: Record<string, string> = {
        shelter: "Adopción revertida por el refugio",
        adopter: "Adopción revertida por el adoptante",
        court: "Adopción revertida por orden judicial",
      };
      return {
        primary: (actor && map[actor]) || "Adopción revertida",
        secondary: str("reason"),
      };
    }
    case "adoption_application_resolved": {
      const outcome = str("outcome");
      const auto = str("auto_generated") === "true";
      let primary: string;
      if (outcome === "approved") primary = "Postulación aprobada";
      else if (outcome === "rejected" && auto)
        primary = "Postulación cerrada (otra adopción se finalizó)";
      else if (outcome === "rejected") primary = "Postulación no avanzó";
      else primary = "Postulación resuelta";
      return { primary, secondary: str("notes") };
    }
    default:
      return { primary: null, secondary: null };
  }
}
