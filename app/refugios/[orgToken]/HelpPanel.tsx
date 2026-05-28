import Link from "next/link";

import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import type { OrgPublicProfile } from "@/lib/org-public-profile";

// "Cómo ayudar" panel (handoff P2-7).
//
// Quad-grid of CTAs (2 cols mobile, 4 cols desktop). Cards that don't
// apply (e.g. no donation_methods → no "Doná") are omitted silently —
// the handoff is explicit that we don't greyed-out empty options.

interface Props {
  org: OrgPublicProfile;
  /** Whether the visitor has a session — drives the foster CTA target
   * (authed users get the sheet; anon get redirected to login with
   * returnTo preserved). */
  isAuthed: boolean;
}

type HelpCard = {
  key: string;
  emoji: string;
  label: string;
  href: string;
};

export function HelpPanel({ org, isAuthed }: Props) {
  // Foster CTA goes straight to the existing FosterVolunteerWizard at
  // /cuenta/ofrecerme-como-transito (a per-user surface). The handoff
  // mentioned a sheet variant pre-filled with ?org=… but the wizard
  // doesn't bind to a specific org today — foster preferences are
  // global and orgs match against them. Routing to the wizard keeps
  // the UX correct; anon users get bounced through /login first.
  const fosterHref = isAuthed
    ? "/cuenta/ofrecerme-como-transito"
    : `/login?intent=foster&returnTo=${encodeURIComponent("/cuenta/ofrecerme-como-transito")}`;

  const cards: HelpCard[] = [
    {
      key: "adoptar",
      emoji: "❤",
      label: "Adoptá con nosotros",
      href: "#adopcion-title",
    },
    {
      key: "transito",
      emoji: "🏠",
      label: "Ofrecete como tránsito",
      href: fosterHref,
    },
  ];

  // Donar — only when at least one method is set. Falls through to
  // website if donation_methods is null but a website exists; otherwise
  // the card is omitted entirely (no greyed-out card per handoff).
  if (org.donationMethods && Object.values(org.donationMethods).some((v) => v)) {
    cards.push({ key: "donar", emoji: "🎁", label: "Doná", href: "?sheet=donar" });
  } else if (org.website) {
    cards.push({
      key: "donar",
      emoji: "🎁",
      label: "Doná",
      href: org.website.startsWith("http") ? org.website : `https://${org.website}`,
    });
  }

  cards.push({
    key: "voluntario",
    emoji: "👥",
    label: "Sumate como voluntario",
    href: "?sheet=ser-voluntario",
  });

  return (
    <Panel aria-labelledby="ayudar-title">
      <PanelHeader title={<span id="ayudar-title">Cómo ayudar</span>} />
      <PanelBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gob-border bg-white px-4 py-6 text-center hover:bg-gob-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste focus-visible:ring-offset-2 transition-colors"
            >
              <span aria-hidden className="text-3xl">
                {card.emoji}
              </span>
              <span className="text-sm font-medium text-gob-text">{card.label}</span>
            </Link>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
