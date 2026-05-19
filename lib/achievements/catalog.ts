// POC catalog of 5 achievements for pet profile v2 (spec §5.2):
//   A1 service_dog   — pet has a vigente service-dog credential
//   A2 i_was_adopted — has ≥1 adoption_finalized event
//   A3 lost_and_found — has ≥1 status_changed lost→active pair
//   A4 i_had_litter   — NOT YET COMPUTABLE (needs litter_recorded event)
//   A5 globetrotter   — NOT YET COMPUTABLE (needs international_travel event)
//
// Future achievements (backlog §5.4): cumpleaños, al día con vacunas,
// esterilización, sobreviviente, voluntario, años con vos, identidad
// completa, perro de servicio aprobado por govt.

import type {
  AchievementDef,
  AchievementInput,
  EarnedAchievement,
  NotYetComputableAchievement,
} from "./types";

// ---------------------------------------------------------------------------
// A1 — Animal de servicio
// ---------------------------------------------------------------------------
const serviceDogAchievement: AchievementDef = {
  id: "service_dog",
  label: "De servicio",
  icon: "🦮",
  description: "Estoy registrada como perro de asistencia bajo la Ley 26.858.",
  computeStatus: ({ serviceDog }) => {
    if (!serviceDog) return { kind: "not_yet" };
    if (serviceDog.credentialStatus === "vigente") {
      // credentialIssueDate is a `date` column (ISO date string when set).
      // Fallback to verifiedAt or updatedAt so the chip always has an
      // earnedAt to surface in the tooltip.
      const earnedAt = serviceDog.credentialIssueDate
        ? new Date(serviceDog.credentialIssueDate)
        : (serviceDog.verifiedAt ?? serviceDog.updatedAt ?? new Date());
      return { kind: "earned", earnedAt };
    }
    return {
      kind: "not_yet",
      reason: `Credencial en estado ${serviceDog.credentialStatus}`,
    };
  },
};

// ---------------------------------------------------------------------------
// A2 — Fui adoptada/o
// ---------------------------------------------------------------------------
const iWasAdoptedAchievement: AchievementDef = {
  id: "i_was_adopted",
  label: "Fui adoptada",
  icon: "🏠",
  description: "Pasé por un proceso de adopción formal y ahora tengo familia.",
  computeStatus: ({ events }) => {
    const finalized = events.filter((e) => e.eventType === "adoption_finalized");
    if (finalized.length === 0) return { kind: "not_yet" };
    const last = finalized[finalized.length - 1];
    return {
      kind: "earned",
      earnedAt: new Date(last.occurredAt),
      count: finalized.length > 1 ? finalized.length : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// A3 — Me perdí y volví
// ---------------------------------------------------------------------------
const lostAndFoundAchievement: AchievementDef = {
  id: "lost_and_found",
  label: "Me perdí y volví",
  icon: "🧭",
  description: "Me perdí pero volví a casa. Completé un episodio de lost-and-found.",
  computeStatus: ({ events }) => {
    let pairs = 0;
    let lastEarnedAt: Date | null = null;
    let openLostAt: Date | null = null;
    for (const e of events) {
      if (e.eventType !== "status_changed") continue;
      const p = e.payload as { from_status?: string; to_status?: string };
      if (p.to_status === "lost") {
        openLostAt = new Date(e.occurredAt);
      } else if (p.from_status === "lost" && p.to_status === "active" && openLostAt) {
        pairs += 1;
        lastEarnedAt = new Date(e.occurredAt);
        openLostAt = null;
      }
    }
    if (pairs === 0 || !lastEarnedAt) return { kind: "not_yet" };
    return {
      kind: "earned",
      earnedAt: lastEarnedAt,
      count: pairs > 1 ? pairs : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// A4 — Tuve crías (placeholder; needs litter_recorded event_type)
// ---------------------------------------------------------------------------
const iHadLitterAchievement: AchievementDef = {
  id: "i_had_litter",
  label: "Tuve crías",
  icon: "🐣",
  description: "Soy mamá. Quedó registrado mi embarazo en mi libreta sanitaria.",
  computeStatus: () => ({
    kind: "not_yet_computable",
    missing:
      "Requiere un event_type 'litter_recorded' o un sub_kind 'pregnancy' en clinical_info_logged que el catálogo todavía no tiene.",
  }),
};

// ---------------------------------------------------------------------------
// A5 — Trotamundos (placeholder; needs international_travel event_type)
// ---------------------------------------------------------------------------
const globetrotterAchievement: AchievementDef = {
  id: "globetrotter",
  label: "Trotamundos",
  icon: "🌍",
  description: "Viajé al exterior al menos una vez (con todos los papeles en regla).",
  computeStatus: () => ({
    kind: "not_yet_computable",
    missing:
      "Requiere un event_type 'international_travel' o 'vet_certificate_export' que el catálogo todavía no tiene.",
  }),
};

// ---------------------------------------------------------------------------
// Catalog + selectors
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS_CATALOG: readonly AchievementDef[] = [
  serviceDogAchievement,
  iWasAdoptedAchievement,
  lostAndFoundAchievement,
  iHadLitterAchievement,
  globetrotterAchievement,
];

export function getEarnedAchievements(input: AchievementInput): EarnedAchievement[] {
  const out: EarnedAchievement[] = [];
  for (const def of ACHIEVEMENTS_CATALOG) {
    const status = def.computeStatus(input);
    if (status.kind === "earned") {
      out.push({
        ...def,
        earnedAt: status.earnedAt,
        count: status.count,
        detail: status.detail,
      });
    }
  }
  return out;
}

export function getNotYetComputableAchievements(
  input: AchievementInput,
): NotYetComputableAchievement[] {
  const out: NotYetComputableAchievement[] = [];
  for (const def of ACHIEVEMENTS_CATALOG) {
    const status = def.computeStatus(input);
    if (status.kind === "not_yet_computable") {
      out.push({ ...def, missing: status.missing });
    }
  }
  return out;
}
