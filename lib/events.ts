import { findDisease } from "@/lib/diseases";
import { welfareReportKindLabel } from "@/lib/welfare";

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

      const causeLabel: Record<string, string> = {
        known: "Conocida",
        unknown: "Desconocida",
        natural: "Natural / vejez",
        disease: "Enfermedad",
        accident: "Accidente",
        euthanasia: "Eutanasia",
        other: "Otra",
      };
      const dispositionLabel: Record<string, string> = {
        cremation: "Cremación",
        burial: "Entierro",
        rendering: "Reciclaje sanitario",
        unknown: "No sé",
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

      const dispositionStr = disposition ? (dispositionLabel[disposition] ?? null) : null;
      const facilityStr = facility;
      let secondary = [dispositionStr, facilityStr].filter(Boolean).join(" · ") || causeDetail;

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
      const loc = str("last_known_location");
      const reason = str("reason");
      let primary: string | null = null;
      if (toStatus === "lost") primary = "Marcada como perdida";
      else if (toStatus === "active") primary = "Marcada como encontrada";
      return {
        primary,
        secondary: loc || reason,
      };
    }
    default:
      return { primary: null, secondary: null };
  }
}
