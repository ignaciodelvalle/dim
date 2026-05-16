# DIM — Org membership permissions

Single source of truth for what a user can do inside an organization based on their membership role. Used by every server action that runs in an org context, and by every UI surface that needs to hide controls a user can't use.

This document defines the *contract*. The implementation lives in `lib/org-permissions.ts` and is exercised by `__tests__/org-permissions.test.ts`.

## Roles

From `organization_membership_role` enum in `db/schema.ts`:

- `admin` — full control of the org. Can manage members, declare coverage, configure profile, run any custody / adoption flow, finalize adoptions, write any pet event for pets the org holds custody of.
- `coordinator` — operational lead. Same as admin for day-to-day work; cannot manage other admins or change verification settings.
- `member` — generic staff. Can do intake and write clinical events on org-held pets. Cannot manage other people or run the adoption pipeline.
- `volunteer` — field volunteer. Receives lost-pet broadcasts; can write a limited set of events (symptom observation, found-pet sighting, scan log) on org-held pets. Cannot do intake by themselves; cannot manage anything.
- `foster` — temporary caregiver under the org's umbrella. Membership exists so the foster's `Ownership(role=foster)` row passes validation. Can write a limited set of events *on the specific pets they hold a foster ownership row for*. Foster scope is per-pet, not org-wide.
- `vet_individual` — individual veterinarian working under the org banner (e.g. a clinic's vet). Same write permissions as `member` plus the right to author clinical events with `author_role='vet'` instead of `'shelter'`.

The boolean `organization_memberships.can_write_pet_events` is **independent of role** and acts as a gate on top. If false, the membership cannot author *any* pet event regardless of role. Default false; admin flips on per member after onboarding. This exists so a refugio can have a transportista as `member` (no event-writing) and a coordinadora as `member` (event-writing) without forcing them into different roles.

## Capability catalogue

Capabilities are atomic verbs. The permission system is a `Set<Capability>` per role, optionally filtered by per-pet context (foster).

```ts
type Capability =
  // Org administration
  | "org.read.unverified_self"
  | "org.profile.update"
  | "org.verification.upload_documents"
  | "org.verification.submit_for_review"
  | "org.coverage.manage"
  | "org.branding.toggle_tier_0"

  // Member management
  | "members.list"
  | "members.invite"
  | "members.update_role"
  | "members.update_can_write_pet_events"
  | "members.end_membership"
  | "members.manage_admins"          // admin-only superset

  // Custody — single-pet flows
  | "custody.intake.new_pet"
  | "custody.intake.transfer_in"
  | "custody.transfer.propose_out"
  | "custody.transfer.accept_in"
  | "custody.transfer.cancel"
  | "custody.return_to_street"       // edge case — release decision

  // Foster
  | "foster.assign"
  | "foster.end"
  | "foster.write_events_on_assigned_pet"   // scoped per pet via foster Ownership row

  // Adoption pipeline
  | "adoption.applications.list"
  | "adoption.applications.review"
  | "adoption.applications.approve"
  | "adoption.applications.reject"
  | "adoption.finalize"
  | "adoption.revoke"
  | "adoption.read_adopter_pii"      // audit-logged

  // Event authorship on org-held pets
  | "events.write.clinical"          // vaccination, deworming, sterilization, vet visit, weight
  | "events.write.lifecycle"         // status_changed, death_recorded
  | "events.write.observations"      // symptom_observed, incident_reported, note_added
  | "events.write.identification"    // microchip_implanted

  // Public surface
  | "public.adopter_contact.read"    // post-finalize, within followup window
;
```

## Matrix

| Capability | admin | coordinator | member | volunteer | foster (per pet) | vet_individual |
|---|---|---|---|---|---|---|
| `org.read.unverified_self` | yes | yes | yes | yes | yes | yes |
| `org.profile.update` | yes | partial | no | no | no | no |
| `org.verification.upload_documents` | yes | no | no | no | no | no |
| `org.verification.submit_for_review` | yes | no | no | no | no | no |
| `org.coverage.manage` | yes | yes | no | no | no | no |
| `org.branding.toggle_tier_0` | yes | no | no | no | no | no |
| `members.list` | yes | yes | yes | yes | yes | yes |
| `members.invite` | yes | yes | no | no | no | no |
| `members.update_role` | yes | partial (non-admin) | no | no | no | no |
| `members.update_can_write_pet_events` | yes | yes | no | no | no | no |
| `members.end_membership` | yes | partial (non-admin) | self only | self only | self only | self only |
| `members.manage_admins` | yes | no | no | no | no | no |
| `custody.intake.new_pet` | yes | yes | yes | no | no | yes |
| `custody.intake.transfer_in` | yes | yes | no | no | no | no |
| `custody.transfer.propose_out` | yes | yes | no | no | no | no |
| `custody.transfer.accept_in` | yes | yes | no | no | no | no |
| `custody.transfer.cancel` | yes | yes | no | no | no | no |
| `custody.return_to_street` | yes | no | no | no | no | no |
| `foster.assign` | yes | yes | no | no | no | no |
| `foster.end` | yes | yes | no | no | yes (self only) | no |
| `foster.write_events_on_assigned_pet` | n/a | n/a | n/a | n/a | yes | n/a |
| `adoption.applications.list` | yes | yes | no | no | no | no |
| `adoption.applications.review` | yes | yes | no | no | no | no |
| `adoption.applications.approve` | yes | yes | no | no | no | no |
| `adoption.applications.reject` | yes | yes | no | no | no | no |
| `adoption.finalize` | yes | yes | no | no | no | no |
| `adoption.revoke` | yes | no | no | no | no | no |
| `adoption.read_adopter_pii` | yes | yes | no | no | no | no |
| `events.write.clinical` | yes | yes | yes | no | yes (per pet) | yes |
| `events.write.lifecycle` | yes | yes | yes | no | yes (per pet, except `death_recorded` which needs coordinator+) | yes |
| `events.write.observations` | yes | yes | yes | yes | yes (per pet) | yes |
| `events.write.identification` | yes | yes | yes | no | no | yes |
| `public.adopter_contact.read` | yes | yes | no | no | no | no |

Every `events.write.*` capability is **additionally gated** by `organization_memberships.can_write_pet_events`. If that flag is false, the user has no write capability regardless of role.

`partial` means: same as `yes` except cannot perform the action against an `admin` or against the protected attribute. E.g. coordinator can update profile but cannot change verified/verification fields; coordinator can update other members' roles but cannot promote/demote admins.

## API shape

```ts
// lib/org-permissions.ts

export type OrgContext = {
  organizationId: string;
  membershipRole: OrganizationMembershipRole;
  canWritePetEvents: boolean;
};

export type PerPetContext = {
  petId: string;
  hasActiveFosterRow: boolean;   // true when the user holds an active Ownership(role=foster) row for this pet
};

export function can(
  capability: Capability,
  org: OrgContext,
  pet?: PerPetContext,
): boolean;

// Convenience for server actions:
export function requireCapability(
  capability: Capability,
  org: OrgContext | null,
  pet?: PerPetContext,
): asserts org is OrgContext;
// Throws OrgPermissionError with a user-friendly Spanish message if denied.
```

## Authorship resolution

When a user with org context X writes a pet event, the authorship columns are set by `lib/event-authorship.ts`:

```ts
function resolveAuthorship(org: OrgContext, profile: Profile): {
  authorRole: AuthorRole;
  authorOrganizationId: string | null;
  authorVerified: boolean;
} {
  const role: AuthorRole = (() => {
    if (org.membershipRole === "vet_individual") return "vet";
    // shelter, rescue_network → 'shelter'
    // sanitary_authority   → 'govt' (later)
    // clinic               → 'vet' when written by a vet_individual; else 'shelter' is wrong, use a clinic-specific role TBD
    return "shelter";
  })();
  return {
    authorRole: role,
    authorOrganizationId: org.organizationId,
    authorVerified: profile.role !== "owner" /* placeholder */ && org.canWritePetEvents && /* org.verified === true */,
  };
}
```

`author_verified` is **true only when** the org row is `verified=true` *and* the membership's `can_write_pet_events=true`. The org row must be passed in by the caller (it's not in `OrgContext` because that's a per-request snapshot and the verified flag rarely changes; caller decides whether to read it fresh).

When a user has no org context (acting as personal owner), authorship is the existing behaviour: `author_role='owner'`, `author_organization_id=null`, `author_verified=false`.

## Tests required

Every cell in the matrix above gets a unit test. Property test on top: for any `(role, capability)` pair, `can()` must match the matrix; if the test ever drifts from the matrix table here, that's a real divergence to discuss — do not silently update the test.
