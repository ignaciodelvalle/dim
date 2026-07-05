"use client";

// Landing hero — Pampa's credential, auto-cycling through the states a real
// pet moves through over a life (PO landing feedback #10).
//
// The credential loops: al día → perdida → encontrada (al día) → en
// observación antirrábica → en tratamiento → requiere registro PPP → (loop).
// Two of these — "en observación antirrábica" and "requiere registro PPP" —
// are landing-hero-only states with a landing-local badge treatment; the
// shared LnPetStatus/LnStatusFlag type is intentionally NOT extended for them.
//
// Motion contract: the loop only runs when motion is allowed. Under
// prefers-reduced-motion (or before hydration / no-JS) the credential sits on
// the first state, "al día", and never advances — the halo pulse and badge
// transitions collapse via the global reduced-motion rule.
//
// The QR is REAL and scannable: server-generated SVG (qrcode package, same
// pattern as /mis-mascotas/[publicToken]) pointing at the stable seeded demo
// pet (DIM-HACH-0016) — unchanged as Pampa cycles through states.

import { PAMPA } from "@/components/landing/landing-content";
import { LnPetPhoto } from "@/components/ui/RegRow";
import Link from "next/link";
import { useEffect, useState } from "react";

type LandingHeroProps = {
  /** Pre-rendered QR SVG markup (qrcode's toString({ type: "svg" })). */
  qrSvg: string;
  /** Public credential URL the QR encodes, e.g. /p/DIM-XXXX-XXXX. */
  publicHref: string;
  /** Token displayed on the credential (must match the QR target). */
  publicToken: string;
};

/** Landing-local status colour group (drives the badge treatment in CSS). */
type HeroTone = "ok" | "lost" | "watch" | "sick" | "ppp";

type HeroState = {
  key: string;
  /** Badge label on the credential. */
  badge: string;
  tone: HeroTone;
  /** Halo tint — only "lost" turns the ring red + pulsing. */
  halo: "ok" | "lost";
  /** Short bold lead for the live caption. */
  title: string;
  /** One-line explanation of the state. */
  caption: string;
};

// PO-approved sequence. "encontrada" resolves back to AL DÍA (green) on
// purpose — being found returns the credential to its resting state.
const HERO_STATES: HeroState[] = [
  {
    key: "aldia",
    badge: "AL DÍA",
    tone: "ok",
    halo: "ok",
    title: "Al día.",
    caption: "Vacunas y controles firmados por profesionales con matrícula.",
  },
  {
    key: "perdida",
    badge: "PERDIDA",
    tone: "lost",
    halo: "lost",
    title: "Se perdió.",
    caption: "Modo perdido: alerta a los vecinos y aparece en el buscador público.",
  },
  {
    key: "encontrada",
    badge: "AL DÍA",
    tone: "ok",
    halo: "ok",
    title: "Apareció.",
    caption: "Volvió a casa — la custodia queda registrada.",
  },
  {
    key: "observacion",
    badge: "EN OBSERVACIÓN",
    tone: "watch",
    halo: "ok",
    title: "En observación antirrábica.",
    caption: "Tras una mordedura, el período se abre, se sigue y se cierra solo.",
  },
  {
    key: "tratamiento",
    badge: "EN TRATAMIENTO",
    tone: "sick",
    halo: "ok",
    title: "En tratamiento.",
    caption: "El diagnóstico y su plan quedan escritos en el historial.",
  },
  {
    key: "ppp",
    badge: "REGISTRO PPP",
    tone: "ppp",
    halo: "ok",
    title: "Requiere registro PPP.",
    caption: "Su jurisdicción pide registrarla como potencialmente peligrosa.",
  },
];

const CYCLE_MS = 2600;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LandingHero({ qrSvg, publicHref, publicToken }: LandingHeroProps) {
  // Always start on "al día" — correct for SSR, no-JS, and reduced motion.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setIndex((n) => (n + 1) % HERO_STATES.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const state = HERO_STATES[index] ?? HERO_STATES[0];

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
              en una sola miMAR.
            </h1>
            <p className="lp-lead lp-reveal mt-6" data-d="2">
              miMAR es el registro nacional de mascotas: una identidad pública y un historial
              inmutable, compartido por todas las manos que la cuidan.
            </p>
            <div className="lp-hero-cta lp-reveal" data-d="3">
              <Link href="/signup" className="lp-btn lp-btn--primary">
                Crear tu miMAR <span className="lp-ar">→</span>
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
              <div className="lp-halo" data-status={state.halo}>
                <LnPetPhoto
                  src="/landing/pampa-hero.jpg"
                  alt={
                    state.halo === "lost"
                      ? `${PAMPA.name}, en modo perdido`
                      : `${PAMPA.name}, perro`
                  }
                  status={state.halo}
                  size={272}
                />

                {/* Floating credential — status badge cycles with the state */}
                <div className="lp-hcred" data-section="hero-credential">
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
                  <span key={state.key} className="lp-hbadge" data-tone={state.tone}>
                    {state.badge}
                  </span>
                </div>
              </div>

              {/* Live caption — what the current state means */}
              <output className="lp-hstate" aria-live="off">
                <span key={state.key} className="lp-hstate-line">
                  <b>{state.title}</b> {state.caption}
                </span>
                <span className="lp-hstate-dots" aria-hidden="true">
                  {HERO_STATES.map((s, i) => (
                    <span key={s.key} className="lp-hstate-dot" data-on={i === index} />
                  ))}
                </span>
              </output>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
