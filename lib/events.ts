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
    case "death_recorded": {
      const cause = str("cause");
      const causeDetail = str("cause_detail");
      const disposition = str("disposition_method");
      const facility = str("facility");

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

      const showCause = cause && cause !== "other" && causeLabel[cause];
      const primary = showCause ? `Fallecimiento · ${causeLabel[cause]}` : "Fallecimiento";

      const dispositionStr = disposition ? (dispositionLabel[disposition] ?? null) : null;
      const facilityStr = facility;
      const secondary = [dispositionStr, facilityStr].filter(Boolean).join(" · ") || causeDetail;

      return { primary, secondary: secondary || null };
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
