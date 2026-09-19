// pet-holder-clause.ts — the pet-holder rule as an IN-QUERY predicate.
//
// WHY THIS EXISTS (A01-5, 2026-09-18). The lib/ readers that return a pet's
// event history took a bare `petId` and trusted the caller to have run
// requirePetAccess first. Every caller did, but "the caller is the only fence"
// means the first route that resolves an id from the URL and calls a reader
// before (or without) the access check leaks the history — and nothing in the
// query would object. With this clause in the WHERE, a reader asked for a pet
// the viewer does not hold returns nothing, whoever called it.
//
// THE RULE IS resolvePetHolderAccess's (lib/infra/pet-access.ts), stated as SQL:
//   - the pet is not soft-deleted (erased pets resolve nothing, art. 16), and
//   - it has a live ownership row that is EITHER the viewer's own (any role —
//     owner, co_owner, foster, caretaker) OR an organization's in which the
//     viewer holds a live membership.
// It is a SECOND statement of that rule, not a replacement: the resolver still
// decides access and returns the row. If the resolver's two paths ever change,
// this clause must change with them — `__tests__/pet-weight-history.test.ts`
// pins the owner path and the stranger refusal against the real database.
//
// It deliberately does NOT encode the capability checks requireAlivePetAccess
// adds for writes: this is a READ predicate, and holding the pet is what a read
// requires.

import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * `EXISTS (…)` true when `viewerId` holds the pet whose id is `petIdColumn`.
 * Compose it into the WHERE of any reader keyed on a pet id.
 */
export function viewerHoldsPetClause(viewerId: string, petIdColumn: AnyPgColumn): SQL {
  return sql`exists (
    select 1
    from pets hp
    join ownerships ho on ho.pet_id = hp.id and ho.ended_at is null
    where hp.id = ${petIdColumn}
      and hp.deleted_at is null
      and (
        ho.owner_user_id = ${viewerId}
        or exists (
          select 1
          from organization_memberships hm
          where hm.organization_id = ho.owner_organization_id
            and hm.user_id = ${viewerId}
            and hm.left_at is null
        )
      )
  )`;
}
