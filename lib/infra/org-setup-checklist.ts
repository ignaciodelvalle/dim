// Pure domain logic for org onboarding setup checklist (Wave 3 Item 19).
//
// Derives each setup step's done/pending state from real org state —
// nothing is persisted. Steps not applicable to the org_type are omitted.
//
// Steps:
//   1. coverage   — define coverage zones (cobertura)
//   2. members    — invite members (miembros/invitar)
//   3. services   — load services (servicios/nuevo) — if service_offering.create granted
//   4. capacity   — declare capacity (configuracion) — shelter only
//   5. verification — submit verification docs
//
// The checklist auto-hides when all applicable steps are done.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SetupStepKey = "coverage" | "members" | "services" | "capacity" | "verification";

export type SetupStep = {
  key: SetupStepKey;
  /** Short label shown in the checklist. */
  label: string;
  /** Longer hint shown when the step is pending. */
  hint: string;
  /** Route (relative to /org/[orgToken]/) where the user completes the step. */
  href: string;
  /** CTA button label. */
  cta: string;
  done: boolean;
};

/** Input state derived from org + membership data. No DB calls here. */
export type OrgSetupInput = {
  orgType: string;
  /** True when at least one coverage zone exists for the org. */
  hasCoverage: boolean;
  /**
   * Number of active memberships. The admin who created the org already
   * counts; step is done when there is MORE than one member (i.e. at least
   * one other person was invited).
   */
  memberCount: number;
  /**
   * True when the org has the service_offering.create capability granted
   * (only then is the services step applicable).
   */
  canCreateServices: boolean;
  /** True when at least one service offering exists. */
  hasServices: boolean;
  /** True when any capacity column is set (non-null) for a shelter. */
  hasCapacityDeclared: boolean;
  /** True when the org is verified (verified=true on the organizations row). */
  isVerified: boolean;
};

// ---------------------------------------------------------------------------
// Step derivation — pure, no side effects
// ---------------------------------------------------------------------------

/**
 * Derives the list of applicable setup steps for the org, each with their
 * done/pending state computed from the org's real data.
 *
 * Returns an empty array when all steps are done (checklist should hide).
 * Returns only steps applicable to this org_type.
 */
export function deriveSetupSteps(input: OrgSetupInput): SetupStep[] {
  const isShelter = input.orgType === "shelter";
  const isRescueNetwork = input.orgType === "rescue_network";
  const needsCapacity = isShelter; // rescue_network doesn't declare shelter capacity

  const steps: SetupStep[] = [
    {
      key: "coverage",
      label: "Zonas de cobertura",
      hint: "Definí las zonas donde trabajás para recibir alertas de animales perdidos.",
      href: "cobertura",
      cta: "Definir zonas",
      done: input.hasCoverage,
    },
    {
      key: "members",
      label: "Miembros del equipo",
      hint: "Invitá a las personas que trabajan con vos en la organización.",
      href: "miembros/invitar",
      cta: "Invitar miembros",
      // Done when there's at least one non-admin member (memberCount > 1 means
      // someone besides the founding admin was invited).
      done: input.memberCount > 1,
    },
  ];

  // Services step — only shown when the org has the capability to create them.
  if (input.canCreateServices) {
    steps.push({
      key: "services",
      label: "Servicios",
      hint: "Cargá los servicios que ofrecés (vacunaciones, castraciones, etc.).",
      href: "servicios/nuevo",
      cta: "Cargar servicios",
      done: input.hasServices,
    });
  }

  // Capacity step — shelter only.
  if (needsCapacity) {
    steps.push({
      key: "capacity",
      label: "Capacidad del refugio",
      hint: "Declarar tu capacidad permite calcular ocupación y detectar sobre-cupo.",
      href: "configuracion",
      cta: "Declarar capacidad",
      done: input.hasCapacityDeclared,
    });
  }

  // Verification step — always applicable; hidden when already verified.
  steps.push({
    key: "verification",
    label: "Verificación",
    hint: "Enviá la documentación para que tu organización quede verificada en miMAR.",
    href: "configuracion",
    cta: "Enviar documentación",
    done: input.isVerified,
  });

  return steps;
}

/**
 * Returns true when all applicable setup steps are complete.
 * Use this to auto-hide the checklist.
 */
export function isSetupComplete(steps: SetupStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done);
}

/**
 * Returns the first pending (not done) step, or null when setup is complete.
 * Used to auto-focus the first actionable item.
 */
export function firstPendingStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done) ?? null;
}
