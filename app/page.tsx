import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { BondBand } from "@/components/landing/BondBand";
import { CrisisBand } from "@/components/landing/CrisisBand";
import { EmpezarSection } from "@/components/landing/EmpezarSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingNav } from "@/components/landing/LandingNav";
import { RevealManager } from "@/components/landing/RevealManager";
import { StorySection } from "@/components/landing/StorySection";
import { DEMO_PUBLIC_TOKEN } from "@/components/landing/landing-content";
import { GobStripe } from "@/components/layout/GobStripe";
import { ScrollReset } from "@/components/layout/ScrollReset";
import { db, organizationMemberships } from "@/db";
import { getProfileCached } from "@/lib/infra/request-cache";
import {
  isDeactivatedInstitutional,
  pathForRole,
  resolveVetLanding,
} from "@/lib/infra/role-landing";
import { resolveSiteUrl } from "@/lib/infra/site-url";
import { createClient } from "@/lib/supabase/server";

// Public landing — "una mascota, muchas manos" (design handoff
// docs/design_handoff_landing, benchmark L1–L8). Replaces the P4-1 hero /
// theme blocks with the storytelling landing:
//
//   Nav (sticky, ABOVE the gob stripe — intentional order) → Hero (Pampa's
//   credential + FlipCard-motif lost-mode demo + real scannable QR) →
//   CrisisBand (L1: perdí / encontré / code lookup, no login) → BondBand
//   (full-bleed emotional bridge: the human–animal bond the product protects)
//   → Story (CastFila + 6 chapters + sticky scroll-spy rail) → Features as life
//   moments (L6) → FAQ + trust row (L7/L4, beta chip) → Empezar (2 doors
//   ONLY: dueño / organización) → Footer (+ closing GobStripe).
//
// The landing owns its chrome (no AppShell): the handoff requires the nav
// ABOVE the institutional stripe, which no shell variant provides. The page
// still renders the single <main id="main-content"> that the root layout's
// skip-link targets.

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users skip the landing and go straight to their portal.
  //
  // EXCEPT deactivated institutional accounts: their portal guards bounce
  // them right back to `/`, so redirecting them by role creates an infinite
  // 307 loop (/admin → / → /admin → ERR_TOO_MANY_REDIRECTS, task #39). They
  // fall through to the public landing instead; /login shows the deactivated
  // notice with a working "Cerrar sesión".
  const profile = user ? await getProfileCached(user.id) : null;
  if (user && !isDeactivatedInstitutional(profile)) {
    const role = profile?.role ?? "owner";
    if (role === "vet") {
      redirect(await resolveVetLanding(user.id));
    }
    let hasOrgAdminMembership = false;
    if (role === "owner") {
      const [membership] = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, user.id),
            eq(organizationMemberships.role, "admin"),
            isNull(organizationMemberships.leftAt),
          ),
        )
        .limit(1);
      hasOrgAdminMembership = !!membership;
    }
    redirect(pathForRole(role, { hasOrgAdminMembership }));
  }

  // Real, scannable QR → seeded demo pet credential. Same absolute-URL +
  // inline-SVG pattern as /mis-mascotas/[publicToken] (no image route).
  // resolveSiteUrl handles the set-but-empty env pitfall that would otherwise
  // encode a host-less relative URL no phone camera can resolve.
  const siteBaseUrl = resolveSiteUrl();
  const publicHref = `/p/${DEMO_PUBLIC_TOKEN}`;
  // width 160 (up from 64) + errorCorrectionLevel "Q": the hero QR must scan
  // comfortably from a phone against the on-screen credential. The SVG is vector
  // so the real display size comes from the `.lp-hcard-qr` container (globals.css),
  // but generating at a larger module size keeps it crisp; "Q" adds scan
  // robustness (25% recovery) for camera reads off a glossy screen.
  const qrSvg = await QRCode.toString(`${siteBaseUrl}${publicHref}`, {
    type: "svg",
    margin: 1,
    width: 160,
    errorCorrectionLevel: "Q",
  });

  return (
    <div className="lp flex min-h-screen flex-col" data-landing-root>
      <RevealManager />
      <LandingNav />
      <GobStripe height={6} />
      <main id="main-content" data-scroll-reset className="flex-1">
        <ScrollReset />
        <LandingHero qrSvg={qrSvg} publicHref={publicHref} publicToken={DEMO_PUBLIC_TOKEN} />
        <CrisisBand />
        <BondBand />
        <StorySection />
        <FeaturesSection />
        <FaqSection />
        <EmpezarSection />
      </main>
      <LandingFooter />
    </div>
  );
}
