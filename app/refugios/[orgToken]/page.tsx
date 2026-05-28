// Public shelter profile (handoff Phase 2 — refugio público).
//
// Visibility gate (queryOrgPublicProfile): returns null for orgs that
// are NOT (verified AND orgType in shelter | rescue_network). Caller
// 404s — no degraded view, no "Refugio no disponible" placeholder
// (handoff P2 §"Visibility gate").
//
// This file is the P2-1 refactor base — extracts the inline pet-card
// markup to <AdoptionListingCard> and the inline org-select to
// queryOrgPublicProfile. Future panels (P2-2..P2-12) plug into the
// existing skeleton instead of re-querying.

import Link from "next/link";
import { notFound } from "next/navigation";

import { queryAdoptionListing } from "@/lib/adoption-listing-query";
import { PROVINCES } from "@/lib/ar-provincias";
import { queryPublicOfferings } from "@/lib/org-public-offerings";
import { queryOrgPublicProfile } from "@/lib/org-public-profile";
import { createClient } from "@/lib/supabase/server";

import { AboutPanel } from "./AboutPanel";
import { AdoptionPanel } from "./AdoptionPanel";
import { HelpPanel } from "./HelpPanel";
import { LocationPanel } from "./LocationPanel";
import { OrgHero } from "./OrgHero";
import { ServicesPanel } from "./ServicesPanel";
import { ContactarSheet } from "./sheets/ContactarSheet";

export const dynamic = "force-dynamic";

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const org = await queryOrgPublicProfile(orgToken);
  if (!org) return { title: "Refugio no disponible — MiMAR" };
  return {
    title: `${org.displayName} — Refugio en MiMAR`,
    description: `Mascotas en adopción publicadas por ${org.displayName}.`,
  };
}

export default async function RefugioPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;

  // Optional session — drives the foster CTA target in HelpPanel and,
  // later, the admin/coordinator banner (P2-11). Anonymous visitors
  // hit the page normally; this isn't a gate.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);

  // Fan out the three queries — visibility gate + adoption listing +
  // public offerings (P2-5 consumer).
  const [org, { items, nextCursor }, offerings] = await Promise.all([
    queryOrgPublicProfile(orgToken),
    queryAdoptionListing({ organizationToken: orgToken }, null, 24),
    queryPublicOfferings(orgToken, { limit: 9 }),
  ]);

  if (!org) notFound();

  const provinceLabel =
    (org.jurisdictionProvince && PROVINCE_BY_NAME.get(org.jurisdictionProvince)?.name) ||
    org.jurisdictionProvince ||
    null;
  const localityLabel =
    org.jurisdictionLocality && provinceLabel
      ? `${org.jurisdictionLocality}, ${provinceLabel}`
      : (provinceLabel ?? org.jurisdictionLocality ?? null);

  return (
    <main className="min-h-screen bg-gob-surface">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <Link
          href="/adoptar"
          className="inline-block text-sm text-gob-text-muted hover:text-gob-text"
        >
          ← Volver a /adoptar
        </Link>

        <OrgHero org={org} localityLabel={localityLabel} />

        {org.description && <AboutPanel description={org.description} />}

        <AdoptionPanel
          orgToken={orgToken}
          displayName={org.displayName}
          items={items}
          hasMore={Boolean(nextCursor)}
        />

        <ServicesPanel orgToken={orgToken} offerings={offerings} />

        <LocationPanel org={org} localityLabel={localityLabel} />

        <HelpPanel org={org} isAuthed={isAuthed} />
      </div>

      {/* Sheets — read ?sheet=... from URL and self-mount. */}
      <ContactarSheet
        orgToken={orgToken}
        orgDisplayName={org.displayName}
        orgEmail={org.email}
        orgPhone={org.phone}
      />
    </main>
  );
}
