"use client";

// Landing hero — Pampa's credential + the "¿Y si se pierde?" lost-mode demo.
//
// This is the ONE orchestrated hero moment (design-lead direction): the
// floating credential flips to its lost state with the SAME gesture as the
// product's FlipCard (components/pet-profile/FlipCard.tsx, ADR-11): rotateY
// 3D flip, both faces always mounted, backface-hidden — and under
// prefers-reduced-motion NO transform at all (the inactive face simply
// doesn't paint; see the @media block in globals.css). FlipCard itself is
// not imported because its affordance is hard-wired to the Credencial ↔
// Libreta face semantics ("Girar a Libreta" aria contract); here the flip
// is ok ↔ lost, so we echo the gesture, not the component.
//
// The QR is REAL and scannable: server-generated SVG (qrcode package, same
// pattern as /mis-mascotas/[publicToken]) pointing at a seeded demo pet's
// /p/[publicToken] page.

import { Icon } from "@/components/Icon";
import { PAMPA } from "@/components/landing/landing-content";
import { LnPetPhoto } from "@/components/ui/RegRow";
import { LnStatusFlag } from "@/components/ui/StatusFlag";
import Link from "next/link";
import { useState } from "react";

type LandingHeroProps = {
  /** Pre-rendered QR SVG markup (qrcode's toString({ type: "svg" })). */
  qrSvg: string;
  /** Public credential URL the QR encodes, e.g. /p/DIM-XXXX-XXXX. */
  publicHref: string;
  /** Token displayed on the credential (must match the QR target). */
  publicToken: string;
};

export function LandingHero({ qrSvg, publicHref, publicToken }: LandingHeroProps) {
  const [lost, setLost] = useState(false);
  const status = lost ? "lost" : "ok";

  return (
    <section className="lp-section lp-section--paper lp-hero" id="top" data-section="landing-hero">
      <div className="lp-wrap-wide">
        <div className="lp-hero-grid">
          <div>
            <p className="lp-eyebrow lp-eyebrow--dot lp-reveal">
              República Argentina · Ministerio de Salud
            </p>
            <h1 className="lp-display lp-h-hero lp-reveal mt-4" data-d="1">
              Toda una vida,
              <br />
              en una sola libreta.
            </h1>
            <p className="lp-lead lp-reveal mt-6" data-d="2">
              miMAR es el registro nacional de mascotas: una identidad pública y una libreta
              inmutable, compartida por todas las manos que la cuidan.
            </p>
            <div className="lp-hero-cta lp-reveal" data-d="3">
              <Link href="/signup" className="lp-btn lp-btn--primary">
                Crear la libreta <span className="lp-ar">→</span>
              </Link>
              <a href="#idea" className="lp-btn lp-btn--ghost">
                Cómo funciona
              </a>
            </div>
            {/* Hero triad — exact copy is a PO-locked decision (#4). */}
            <p className="lp-hero-kill lp-reveal" data-d="4">
              <b>Gratis para siempre.</b> Sin papeleo. Código abierto.
            </p>
          </div>

          <div className="lp-hero-photo lp-reveal" data-d="2">
            <div className="flex flex-col items-center">
              <div className="lp-halo" data-status={status}>
                <LnPetPhoto
                  src="/landing/pampa-hero.jpg"
                  alt={lost ? `${PAMPA.name}, en modo perdido` : `${PAMPA.name}, perro`}
                  status={status}
                  size={272}
                />

                {/* Floating credential — FlipCard-motif flip between ok/lost */}
                <div className="lp-cred-flip" data-lost={lost} data-section="hero-credential">
                  <div className="lp-cred-inner">
                    <div className="lp-cred-face lp-cred-face--ok" aria-hidden={lost}>
                      <CredFaceContent
                        qrSvg={qrSvg}
                        publicHref={publicHref}
                        publicToken={publicToken}
                        status="ok"
                      />
                    </div>
                    <div className="lp-cred-face lp-cred-face--lost" aria-hidden={!lost}>
                      <CredFaceContent
                        qrSvg={qrSvg}
                        publicHref={publicHref}
                        publicToken={publicToken}
                        status="lost"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-lostdemo">
                {!lost ? (
                  <button
                    type="button"
                    className="lp-lostdemo-btn"
                    onClick={() => setLost(true)}
                    data-section="lost-demo-trigger"
                  >
                    <span className="lp-ld" aria-hidden="true" /> ¿Y si se pierde?
                  </button>
                ) : (
                  <output className="lp-lost-panel block">
                    <b>
                      <Icon name="perdida" size="sm" decorative /> Modo perdido activado
                    </b>
                    <p>
                      Su credencial pasa a emergencia: alerta a los vecinos cercanos, aparece en el
                      buscador público y cualquiera que escanee su QR puede avisarte — sin ver tus
                      datos.
                    </p>
                    <button type="button" className="lp-lost-back" onClick={() => setLost(false)}>
                      <Icon name="check" size="sm" decorative /> Apareció — volver
                    </button>
                  </output>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CredFaceContent({
  qrSvg,
  publicHref,
  publicToken,
  status,
}: {
  qrSvg: string;
  publicHref: string;
  publicToken: string;
  status: "ok" | "lost";
}) {
  return (
    <>
      <Link
        href={publicHref}
        aria-label="Ver la credencial pública de demostración"
        title="Escaneame — QR real de demostración"
        className="lp-qr"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated QR SVG from the qrcode package, no user input.
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <span className="min-w-0">
        <span className="block text-[var(--text-md)] font-bold text-[var(--color-ln-ink)]">
          {PAMPA.name}
        </span>
        <span className="block truncate font-[var(--font-ln-mono)] text-[var(--text-xs)] text-[var(--color-ln-mute)]">
          {publicToken}
        </span>
      </span>
      <LnStatusFlag status={status} className="ml-auto" />
    </>
  );
}
