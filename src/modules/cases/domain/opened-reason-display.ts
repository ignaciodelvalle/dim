// opened-reason-display — es-AR display formatting for cases.opened_reason
// and cases.closed_reason.
//
// `cases.opened_reason` is an append-only audit column. Historical rows were
// written by production writers using English machine grammars (`auto: ...`
// prefixes, `manual [code]: ...`, `key=value` pairs). Events are append-only,
// so rows can never be retro-translated — this pure module translates the
// known grammars into natural es-AR at render time instead.
//
// Contract:
//   - Recognized machine grammars render as natural es-AR.
//   - Internal UUIDs (volunteer/org/pet ids) are NEVER displayed.
//   - Unrecognized strings (genuine free text, e.g. manual reasons typed by
//     people) pass through unchanged.
//   - Never throws; unknown input degrades to the raw string.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Value vocabularies (raw enum → es-AR)
// ---------------------------------------------------------------------------

// WELFARE_KINDS in src/modules/welfare/actions.ts
const WELFARE_KIND_LABEL: Record<string, string> = {
  abandonment: "abandono",
  neglect: "negligencia",
  physical_abuse: "maltrato físico",
  chained: "animal encadenado",
  no_shelter: "sin refugio",
  hoarding: "acumulación de animales",
  dog_fighting: "peleas de perros",
  trafficking: "tráfico de animales",
  other: "otro",
};

// WELFARE_SEVERITIES in src/modules/welfare/actions.ts
const WELFARE_SEVERITY_LABEL: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  critical: "crítica",
};

// victimKind / severity in src/modules/surveillance/application/report-bite.ts
const BITE_VICTIM_LABEL: Record<string, string> = {
  human: "persona",
  animal: "animal",
  unknown: "sin determinar",
};

const BITE_SEVERITY_LABEL: Record<string, string> = {
  minor: "leve",
  moderate: "moderada",
  severe: "grave",
};

// orgTypeToReporterRole in src/modules/surveillance/domain/bite.ts
const REPORTER_ROLE_LABEL: Record<string, string> = {
  vet: "veterinaria",
  shelter: "refugio",
  govt: "autoridad sanitaria",
};

// SeizureMotive in src/modules/decomiso/domain/types.ts
const SEIZURE_MOTIVE_LABEL: Record<string, string> = {
  maltrato_fisico: "maltrato físico",
  abandono_extremo: "abandono extremo",
  acumulacion: "acumulación",
  trafico: "tráfico",
  sin_refugio_critico: "sin refugio (crítico)",
  pelea_de_perros: "pelea de perros",
  otro: "otro",
};

// CROSS_ORG_ALLOWED_REASONS in src/modules/transfers/domain/types.ts
const TRANSFER_REASON_LABEL: Record<string, string> = {
  space_constraint: "falta de espacio",
  specialization_needed: "se requiere especialización",
  network_redistribution: "redistribución en la red",
  shelter_closing: "cierre del refugio",
  post_adoption_failed_return: "devolución posterior a una adopción",
  other: "otro",
};

// INTAKE_REASONS in src/modules/pets/application/intake/create-intake.ts
const INTAKE_REASON_LABEL: Record<string, string> = {
  rescue: "rescate",
  surrender: "entrega voluntaria",
  stray_found: "animal callejero encontrado",
  other: "otro",
};

// ADMIN_REASONS in src/modules/pets/application/microchip/replace-microchip.ts
const CHIP_REASON_LABEL: Record<string, string> = {
  damaged: "chip dañado",
  unreadable: "chip ilegible",
  owner_request: "pedido del dueño",
  device_failure: "falla del dispositivo",
  duplicate_detected: "duplicado detectado",
  fraud_detected: "fraude detectado",
  other: "otro",
};

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

// ---------------------------------------------------------------------------
// Writer grammars — one rule per known production openedReason template.
// ---------------------------------------------------------------------------

type Rule = {
  pattern: RegExp;
  render: (m: RegExpExecArray) => string;
};

const RULES: Rule[] = [
  {
    // adoption-repository.ts:292
    pattern: /^auto: adoption listing opened — pet marked eligible for adoption$/,
    render: () =>
      "Publicación en adopción abierta automáticamente: la mascota fue marcada como apta para adopción",
  },
  {
    // adoption-repository.ts:560
    pattern: /^auto: adoption application submitted$/,
    render: () => "Postulación de adopción enviada",
  },
  {
    // welfare/application/create-welfare-report.ts:197
    pattern: /^Welfare denuncia (\S+) — kind=(\S+), severity=(\S+)$/,
    render: (m) =>
      `Denuncia de bienestar ${m[1]} — tipo: ${label(WELFARE_KIND_LABEL, m[2])}, gravedad: ${label(WELFARE_SEVERITY_LABEL, m[3])}`,
  },
  {
    // welfare/application/create-org-welfare-report.ts:199
    pattern: /^auto: org-side welfare report by (.+) \(([^)]+)\)$/,
    render: (m) => `Denuncia de bienestar registrada por ${m[1]} (${m[2]})`,
  },
  {
    // foster/infrastructure/foster-repository.ts:757
    pattern: /^Foster placement assigned by (.+?)(?: — expected (\d+) weeks)?$/,
    render: (m) =>
      `Tránsito asignado por ${m[1]}${m[2] ? ` — duración estimada: ${m[2]} semanas` : ""}`,
  },
  {
    // foster/infrastructure/foster-repository.ts:881 — the volunteer userId
    // and orgId are internal UUIDs: strip them, never display.
    pattern: /^Foster proposal to volunteer \S+ by org \S+$/,
    render: () => "Propuesta de tránsito enviada a una persona voluntaria",
  },
  {
    // events/application/lifecycle/set-pet-lost-use-case.ts:190 — the id is
    // the public token when available, otherwise the internal pet UUID
    // (never display the UUID). The trailing reason is owner free text.
    pattern: /^Pet (\S+) marked as lost by owner(?: — ([\s\S]+))?$/,
    render: (m) => {
      const token = UUID_RE.test(m[1]) ? null : m[1];
      const head = token
        ? `Mascota ${token} reportada como perdida por su dueño`
        : "Mascota reportada como perdida por su dueño";
      return m[2] ? `${head} — ${m[2]}` : head;
    },
  },
  {
    // decomiso/application/execute-decomiso.ts:204
    pattern: /^auto: decomiso motivo=(\S+) judicial_ref=([\s\S]+)$/,
    render: (m) =>
      `Decomiso — motivo: ${label(SEIZURE_MOTIVE_LABEL, m[1])}${
        m[2] === "sin_ref" ? "" : ` — ref. judicial: ${m[2]}`
      }`,
  },
  {
    // decomiso/application/accept-decomiso-handoff.ts:253
    pattern: /^auto: decomiso handoff aceptado desde caso (\S+)$/,
    render: (m) => `Traspaso de decomiso aceptado desde el caso ${m[1]}`,
  },
  {
    // surveillance/application/report-bite.ts:112
    pattern: /^Bite incident reported by owner — victim=(\S+), severity=(\S+)$/,
    render: (m) =>
      `Mordedura reportada por el dueño — víctima: ${label(BITE_VICTIM_LABEL, m[1])}, gravedad: ${label(BITE_SEVERITY_LABEL, m[2])}`,
  },
  {
    // surveillance/application/report-bite-from-org.ts:137
    pattern: /^Bite incident reported by (.+) \(([^)]+)\) — victim=(\S+), severity=(\S+)$/,
    render: (m) =>
      `Mordedura reportada por ${m[1]} (${label(REPORTER_ROLE_LABEL, m[2])}) — víctima: ${label(BITE_VICTIM_LABEL, m[3])}, gravedad: ${label(BITE_SEVERITY_LABEL, m[4])}`,
  },
  {
    // transfers/application/propose-cross-org-transfer.ts:137
    pattern: /^auto: cross-org transfer proposed reason=(\S+)$/,
    render: (m) =>
      `Transferencia entre organizaciones propuesta — motivo: ${label(TRANSFER_REASON_LABEL, m[1])}`,
  },
  {
    // pets/application/intake/create-intake.ts:426
    pattern: /^auto: org intake reason=(\S+)$/,
    render: (m) =>
      `Ingreso registrado por la organización — motivo: ${label(INTAKE_REASON_LABEL, m[1])}`,
  },
  {
    // pets/application/microchip/replace-microchip.ts:212 — secondaryPetId
    // is an internal UUID: strip it, keep the fact it existed.
    pattern: /^auto: microchip_replaced reason=(\S+)( secondaryPetId=\S+)?$/,
    render: (m) =>
      `Reemplazo de microchip — motivo: ${label(CHIP_REASON_LABEL, m[1])}${
        m[2] ? " — se detectó otra mascota con el mismo chip" : ""
      }`,
  },
  {
    // pets/application/claim/submit-claim-dispute.ts:105
    pattern: /^Custody dispute raised on pet — raised_by_role=(\S+)$/,
    render: (m) =>
      m[1] === "owner"
        ? "Disputa de custodia iniciada por el dueño sobre la mascota"
        : `Disputa de custodia iniciada sobre la mascota (rol: ${m[1]})`,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render `cases.opened_reason` as natural es-AR.
 *
 * Recognizes the machine grammars produced by the production case writers
 * and translates them; genuine free text (manual reasons typed by people)
 * passes through unchanged. Never throws.
 */
export function openedReasonDisplay(reason: string | null): string {
  if (!reason) return "Sin motivo registrado";
  const text = reason.trim();
  if (!text) return "Sin motivo registrado";

  try {
    for (const rule of RULES) {
      const m = rule.pattern.exec(text);
      if (m) return rule.render(m);
    }

    // surveillance/application/outbreak-investigation.ts:169 — the
    // `manual [code]:` prefix is a dedupe contract; the tail is free text.
    const manual = /^manual \[([^\]]+)\]:\s*([\s\S]*)$/.exec(text);
    if (manual) {
      return manual[2]
        ? `Apertura manual [${manual[1]}] — ${manual[2]}`
        : `Apertura manual [${manual[1]}]`;
    }

    // Generic `auto:` prefix (unknown auto-open writers, seeds, fixtures).
    const auto = /^auto:\s*([\s\S]*)$/.exec(text);
    if (auto) {
      return auto[1] ? `Apertura automática — ${auto[1]}` : "Apertura automática";
    }
  } catch {
    // Fall through to raw passthrough — display must never throw.
  }

  return text;
}

/**
 * Render `cases.closed_reason` (CASE_CLOSED_REASONS in db/schema.ts) as
 * es-AR. Feminine agreement matches the case-ish nouns these appear next to
 * ("Investigación", "Denuncia"). Unknown values pass through; null renders
 * empty (callers guard for presence).
 */
export function caseClosedReasonLabel(reason: string | null): string {
  switch (reason) {
    case "resolved":
      return "Resuelta";
    case "cancelled":
      return "Cancelada";
    case "auto_expired":
      return "Cerrada automáticamente";
    case "merged":
      return "Fusionada";
    case null:
      return "";
    default:
      return reason;
  }
}
