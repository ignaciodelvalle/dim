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
    default:
      return { primary: null, secondary: null };
  }
}
