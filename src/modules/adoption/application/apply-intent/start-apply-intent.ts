// Apply-intent gate for the public adoption listing (spec
// adoption-listing-public v1.3 §8.1, Fase 4).
//
// The CTA "Postularme para adoptar a {name}" on /adoptar/{petToken} posts
// here. Three branches:
//   1. Pet no longer listable — return error, the page will refresh and
//      show the recently-adopted screen or 404. We do NOT silently swallow.
//   2. Visitor is authenticated (and not institutional) — redirect straight
//      to /adoptar/{petToken}/postular. No cookie needed.
//   3. Visitor is anonymous — sign an apply-intent JWT, set it as an
//      httpOnly cookie, redirect to /signup?intent=apply&returnTo=...
//
// We reject institutional accounts (admin / govt) up-front with a clear
// message — letting them through to the form would just bounce them back
// at submit time, and the (app) layout already redirects them away from
// the owner portal anyway.

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db, organizations, ownerships, pets, profiles } from "@/db";
import {
  APPLY_INTENT_COOKIE_NAME,
  APPLY_INTENT_PET_TOKEN_COOKIE_NAME,
  APPLY_INTENT_TTL_MS,
  generateApplyIntentToken,
} from "@/lib/apply-intent";
import { createClient } from "@/lib/supabase/server";

import type { StartApplyIntentResult } from "./types";

export async function startApplyIntentAction(petToken: string): Promise<StartApplyIntentResult> {
  // 1) Re-check listability — same predicate as queryAdoptionListing /
  // ficha page. We don't import the predicate because each call site reads
  // a different shape; the duplication is cheap and the guards are stable.
  const [row] = await db
    .select({ pet: pets, org: organizations })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .where(
      and(
        eq(pets.publicToken, petToken),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!row) return { error: "Mascota no encontrada." };
  const { pet, org } = row;
  const isListable =
    pet.adoptionListedAt !== null &&
    pet.adoptionListingPausedAt === null &&
    pet.status !== "deceased" &&
    pet.status !== "lost" &&
    pet.adoptionEligible === true &&
    pet.inCustodyDispute !== true &&
    pet.rabiesObservationStatus !== "in_progress" &&
    org.verified &&
    (org.orgType === "shelter" || org.orgType === "rescue_network");
  if (!isListable) {
    return { error: `${pet.name} ya no está disponible para adopción.` };
  }

  // 2) Authenticated branch.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const [profile] = await db
      .select({ role: profiles.role, accountType: profiles.accountType })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    if (profile?.accountType === "institutional") {
      return {
        error:
          "Las cuentas institucionales no pueden postularse para adoptar. Si querés adoptar como persona, creá una cuenta personal con otro email.",
      };
    }
    redirect(`/adoptar/${petToken}/postular`);
  }

  // 3) Anonymous branch — sign + cookie + redirect to signup.
  const token = generateApplyIntentToken(petToken);
  const cookieStore = await cookies();
  cookieStore.set(APPLY_INTENT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(APPLY_INTENT_TTL_MS / 1000),
  });
  // Parallel plain cookie so the /inicio "Continuá tu postulación" banner
  // can render without reverse-engineering the petToken out of the signed
  // cookie. See lib/apply-intent.ts for the security trade-off.
  cookieStore.set(APPLY_INTENT_PET_TOKEN_COOKIE_NAME, petToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(APPLY_INTENT_TTL_MS / 1000),
  });
  const returnTo = `/adoptar/${petToken}/postular`;
  redirect(`/signup?intent=apply&returnTo=${encodeURIComponent(returnTo)}`);
}

// Form-action wrapper so the adoption CTA works without client JS.
//
// `<form action={...}>` posts a FormData and (with useActionState) threads a
// previous-state arg. The petToken is carried in a hidden input. On success the
// underlying action redirects (server-side, no JS needed); on failure it returns
// { error } which useActionState surfaces in-place. Keeping startApplyIntentAction
// as the string-arg primitive preserves the existing JS-on call sites.
// @no-auth-required: anonymous visitors start the apply-intent flow by design —
// the wrapped action branches on session (anon → intent cookie + /signup
// redirect; authed → straight to postular) and the postular page re-gates.
export async function startApplyIntentFormAction(
  _prevState: StartApplyIntentResult | null,
  formData: FormData,
): Promise<StartApplyIntentResult> {
  const petToken = String(formData.get("petToken") ?? "").trim();
  if (!petToken) return { error: "Mascota no encontrada." };
  return startApplyIntentAction(petToken);
}
