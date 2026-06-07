// Capability system for organization portals. See AGENTS.md → Organizations.
//
// ⚠️ SHIM — This file is a delegating re-export shim. All logic has moved to:
//   - Pure domain logic: src/modules/organizations/domain/capabilities.ts
//   - I/O / session logic: src/modules/organizations/infrastructure/authz-resolver.ts
//
// ALL ~48 importers of this path continue to work UNCHANGED. Delete this shim
// only when all importers have been repointed to the module paths and parity
// tests are green.
//
// Symbol surface (must match EXACTLY — missing one breaks ~48 importers):
//   Functions:  requireCapability, getActiveMemberships, getGrantedCapabilities, isValidCapability
//   Constants:  CAPABILITY_CATALOG, VET_INDIVIDUAL_IMPLICIT_CAPS, WELFARE_DECOMISO_EXECUTE_CAPABILITY
//   Types:      CapabilityCatalogEntry, ActiveMembership, RequireCapabilitySuccess,
//               RequireCapabilityFailure, RequireCapabilityResult

// ---------------------------------------------------------------------------
// Pure domain re-exports (no I/O)
// ---------------------------------------------------------------------------
export {
  CAPABILITY_CATALOG,
  WELFARE_DECOMISO_EXECUTE_CAPABILITY,
  VET_INDIVIDUAL_IMPLICIT_CAPS,
  isValidCapability,
} from "@/src/modules/organizations/domain/capabilities";

export type { CapabilityCatalogEntry } from "@/src/modules/organizations/domain/capabilities";

// ---------------------------------------------------------------------------
// I/O re-exports (Supabase session + Drizzle DB)
// ---------------------------------------------------------------------------
export {
  getActiveMemberships,
  getGrantedCapabilities,
  requireCapability,
} from "@/src/modules/organizations/infrastructure/authz-resolver";

export type {
  ActiveMembership,
  RequireCapabilityFailure,
  RequireCapabilityResult,
  RequireCapabilitySuccess,
} from "@/src/modules/organizations/infrastructure/authz-resolver";
