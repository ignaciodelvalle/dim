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

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, organizationMemberships } from "@/db";
import { queryPublicOfferings } from "@/lib/infra/org-public-offerings";
import { queryOrgPublicProfile } from "@/lib/infra/org-public-profile";
import { resolveSiteUrl } from "@/lib/infra/site-url";
import { orgLogoUrl } from "@/lib/infra/storage";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { createClient } from "@/lib/supabase/server";
import { serializeJsonLd } from "@/lib/utils/json-ld";
import { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { AboutPanel } from "./AboutPanel";
import { AdminBanner } from "./AdminBanner";
import { AdoptionPanel } from "./AdoptionPanel";
import { HelpPanel } from "./HelpPanel";
import { LocationPanel } from "./LocationPanel";
import { OrgHero } from "./OrgHero";
import { ServicesPanel } from "./ServicesPanel";
import { ComoLlegarSheet } from "./sheets/ComoLlegarSheet";
import { CompartirOrgSheet } from "./sheets/CompartirOrgSheet";
import { ConsultaSinTurnoSheet } from "./sheets/ConsultaSinTurnoSheet";
import { ContactarSheet } from "./sheets/ContactarSheet";
import { DonarSheet } from "./sheets/DonarSheet";
import { SerVoluntarioSheet } from "./sheets/SerVoluntarioSheet";
import { VerificacionInfoSheet } from "./sheets/VerificacionInfoSheet";

export const dynamic = "force-dynamic";

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

const SITE_URL = resolveSiteUrl();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}): Promise<Metadata> {
  const { orgToken } = await params;
  const org = await queryOrgPublicProfile(orgToken);
  if (!org) return { title: "Refugio no disponible — miMAR" };

  const locality = org.jurisdictionLocality ?? org.jurisdictionProvince ?? "Argentina";
  const description =
    org.description?.slice(0, 160) ??
    `Mascotas en adopción publicadas por ${org.displayName}, refugio verificado en ${locality}.`;
  const canonicalUrl = `${SITE_URL}/refugios/${orgToken}`;
  const logoAbsolute = orgLogoUrl(org.logoStoragePath);

  return {
    title: `${org.displayName} — Refugio en miMAR`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${org.displayName} — Refugio en miMAR`,
      description,
      url: canonicalUrl,
      siteName: "miMAR",
      images: logoAbsolute ? [{ url: logoAbsolute }] : [`${SITE_URL}/og-default-org.jpg`],
      type: "profile",
      locale: "es_AR",
    },
    twitter: {
      card: "summary",
      title: `${org.displayName} — Refugio en miMAR`,
      description,
    },
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

  // Admin/coordinator banner (handoff P2-11 + D5: only admins and
  // coordinators of THIS org see it — volunteers / fosters / non-members
  // / anon don't).
  let viewerIsAdminOrCoordinator = false;
  if (user) {
    const [membership] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, user.id),
          eq(organizationMemberships.organizationId, org.id),
          isNull(organizationMemberships.leftAt),
          inArray(organizationMemberships.role, ["admin", "coordinator"]),
        ),
      )
      .limit(1);
    viewerIsAdminOrCoordinator = Boolean(membership);
  }

  const provinceLabel =
    (org.jurisdictionProvince && PROVINCE_BY_NAME.get(org.jurisdictionProvince)?.name) ||
    org.jurisdictionProvince ||
    null;
  const localityLabel =
    org.jurisdictionLocality && provinceLabel
      ? `${org.jurisdictionLocality}, ${provinceLabel}`
      : (provinceLabel ?? org.jurisdictionLocality ?? null);

  // Per-request CSP nonce (set by middleware, Item #64) so this inline JSON-LD
  // script is allowed under script-src 'nonce-…' / 'strict-dynamic'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // JSON-LD Organization schema for rich-result eligibility on search
  // engines + LinkedIn. Generated server-side and injected via serializeJsonLd()
  // (Next/React do NOT escape dangerouslySetInnerHTML — the helper does).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": org.orgType === "shelter" ? "AnimalShelter" : "NGO",
    name: org.displayName,
    legalName: org.legalName ?? undefined,
    url: `${SITE_URL}/refugios/${orgToken}`,
    description: org.description ?? undefined,
    logo: orgLogoUrl(org.logoStoragePath) ?? undefined,
    email: org.email ?? undefined,
    telephone: org.phone ?? undefined,
    sameAs: org.website ? [org.website] : undefined,
    address:
      org.jurisdictionLocality || org.jurisdictionProvince
        ? {
            "@type": "PostalAddress",
            addressLocality: org.jurisdictionLocality ?? undefined,
            addressRegion: org.jurisdictionProvince ?? undefined,
            addressCountry: "AR",
          }
        : undefined,
    geo:
      org.latitude != null && org.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: org.latitude,
            longitude: org.longitude,
          }
        : undefined,
  };

  return (
    <>
      {viewerIsAdminOrCoordinator && <AdminBanner orgToken={orgToken} />}
      <main className="min-h-screen bg-[var(--color-ln-paper)]">
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
          {/* JSON-LD — rendered as a literal script in document head context
              so crawlers can index the structured data. */}
          <script
            type="application/ld+json"
            nonce={nonce}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd() neutralises <, >, & and U+2028/U+2029 so user-supplied org fields (displayName, description, legalName) cannot break out of the script.
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
          />

          <Link
            href="/adoptar"
            className="inline-block font-ln-mono text-[11px] tracking-[.04em] text-[var(--color-ln-azul)] hover:underline focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)] mb-4"
          >
            ← Volver a adopciones
          </Link>

          <OrgHero
            org={org}
            localityLabel={localityLabel}
            adoptionCount={items.length}
            serviceCount={offerings.length}
          />

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

        {/* Sheets — read ?sheet=... from URL and self-mount. Each sheet
          checks its own searchParams.sheet === id, so they can be all
          mounted unconditionally; React renders only the one that's open. */}
        <ContactarSheet
          orgToken={orgToken}
          orgDisplayName={org.displayName}
          orgEmail={org.email}
          orgPhone={org.phone}
        />
        <CompartirOrgSheet orgToken={orgToken} orgDisplayName={org.displayName} />
        <VerificacionInfoSheet
          verifiedByName={org.verifiedBy?.displayName ?? null}
          verifiedAt={org.verifiedAt}
        />
        <ConsultaSinTurnoSheet
          orgDisplayName={org.displayName}
          orgEmail={org.email}
          orgPhone={org.phone}
          jurisdictionLabel={localityLabel}
        />
        <ComoLlegarSheet
          orgDisplayName={org.displayName}
          latitude={org.latitude}
          longitude={org.longitude}
        />
        <DonarSheet orgDisplayName={org.displayName} methods={org.donationMethods} />
        <SerVoluntarioSheet orgToken={orgToken} orgDisplayName={org.displayName} />
      </main>
    </>
  );
}
