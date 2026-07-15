// /inicio folds into the pet profile (owner-ia-redesign P5, decision 7).
//
// The profile keeps its route; /inicio no longer renders a dashboard — it is a
// server redirect INTO the most-urgent live pet's credential. "Open the app →
// land on the pet that most needs you." The ordering is the SAME shared rank
// (rankOwnerCarousel / petUrgencyRank) the profile carousel (P4) and the
// /mis-mascotas index use, so the pet /inicio lands on is exactly the pet whose
// dot sits first in the swipe.
//
// Zero live pets → the index+inbox (/mis-mascotas), which is the only surface
// that exists for a pets-less owner (denuncias, inbound transfers, adoption
// postulaciones, foster proposals — none of which have a credential to live on;
// inventory §9.2).
//
// URL fragments never reach the server, but QUERY params do — so the tab-bar
// capture deep-link points at /inicio?sheet=anotar (CitizenTabBar) and this
// redirect FORWARDS its query string onto the resolved profile URL. The result
// is a single server redirect (/inicio?sheet=anotar → /mis-mascotas/DIM-XXXX?
// sheet=anotar) where the profile's SheetMounter opens the anotar sheet on
// arrival — no second hop, no capture-flow break. The zero-pet path redirects to
// /mis-mascotas with NO query (there is no pet to capture against). The former
// /cuenta/casos #casos anchor now points at /mis-mascotas#inbox directly.

import { redirect } from "next/navigation";

import { fetchComplianceStatesForPets, fetchPetsForOwner } from "@/lib/analytics/owner-dashboard";
import type { CarouselPetInput } from "@/lib/domain/owner-carousel";
import { rankOwnerCarousel } from "@/lib/domain/owner-carousel";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { lnPetStatusFromCompliance } from "@/lib/projections/pet-compliance";

export const dynamic = "force-dynamic";

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUserOrRedirect();
  const sp = await searchParams;

  // The carousel source: every LIVE pet the owner can move between (foster/
  // transit included — fetchPetsForOwner has no role filter). Deceased pets
  // never enter the swipe (decision 6); they live in the index's "En memoria".
  const { pets } = await fetchPetsForOwner(user.id);
  const livePets = pets.filter((p) => p.status !== "deceased");

  // No live pet → the index+inbox is the home.
  if (livePets.length === 0) {
    redirect("/mis-mascotas");
  }

  // Compliance over the live set — the SAME projection the index and the
  // profile read (deriveComplianceState → lnPetStatusFromCompliance), so the
  // urgency order here can never disagree with the carousel dots.
  const complianceByPet = await fetchComplianceStatesForPets(
    user.id,
    livePets.map((p) => p.id),
  );

  const carouselInput: CarouselPetInput[] = livePets.map((p) => {
    const compliance = complianceByPet.get(p.id);
    return {
      token: p.publicToken,
      status: p.status,
      pregnancyStatus: p.pregnancyStatus ?? null,
      complianceStatus: compliance
        ? lnPetStatusFromCompliance(
            { status: p.status, pregnancyStatus: p.pregnancyStatus ?? null },
            compliance,
          )
        : null,
    };
  });

  const ranked = rankOwnerCarousel(carouselInput);
  // rankOwnerCarousel returns at least one entry (livePets is non-empty and the
  // cap is > 0); the first is the most-urgent pet. Forward the original query
  // string (e.g. ?sheet=anotar from the tab bar) onto the profile so a capture
  // deep-link opens the sheet in this SAME redirect — no second hop.
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") forwarded.set(key, value);
    else if (Array.isArray(value)) for (const v of value) forwarded.append(key, v);
  }
  const query = forwarded.toString();
  redirect(`/mis-mascotas/${ranked[0].token}${query ? `?${query}` : ""}`);
}
