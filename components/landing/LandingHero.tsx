"use client";

// Landing hero — Pampa's "credencial viva": a mini DNI-style credential card
// that auto-cycles through the states a real pet moves through over a life
// (PO landing redesign 2026-07-04). It replaces the old photo-with-halo motif.
//
// The credential loops: al día → perdida → encontrada (al día) → en
// observación antirrábica → en tratamiento → requiere registro PPP → (loop).
// Two of these — "en observación antirrábica" and "requiere registro PPP" —
// are landing-hero-only states with a landing-local tone treatment; the shared
// LnPetStatus/LnStatusFlag type is intentionally NOT extended for them (each
// state carries its own `tone`, mapped to tokens in globals.css via data-tone).
//
// The WHOLE card tints per state: trim background, status badge, photo ring,
// the one contextual read-only row, and the card border. Clicking a state dot
// takes control (pauses the auto-cycle, which quietly resumes after 8s idle).
//
// Flip: the card turns edge-on (rotateY → 90°), swaps the visible face, then
// turns back — the same single-painted-face mechanism the product's FlipCard
// uses (never two faces in a preserve-3d/backface context; see the FlipCard
// comment + .ln-doc-turn in globals.css). The back is a mini libreta.
//
// Motion contract: the loop and the turn only run when motion is allowed. Under
// prefers-reduced-motion (or before hydration / no-JS / SSR) the credential
// sits on the first state, "al día", front face, never advances, and the flip
// swaps instantly. The "lost" state keeps a subtle border pulse (motion-gated).
//
// The QR is REAL and scannable: server-generated SVG (qrcode package, same
// pattern as /mis-mascotas/[publicToken]) pointing at the stable seeded demo
// pet (DIM-HACH-0016) — unchanged as Pampa cycles through states.

import { PAMPA } from "@/components/landing/landing-content";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type LandingHeroProps = {
  /** Pre-rendered QR SVG markup (qrcode's toString({ type: "svg" })). */
  qrSvg: string;
  /** Public credential URL the QR encodes, e.g. /p/DIM-XXXX-XXXX. */
  publicHref: string;
  /** Token displayed on the credential (must match the QR target). */
  publicToken: string;
};

/** Landing-local status tone group (drives the card tint in CSS via data-tone). */
type HeroTone = "ok" | "lost" | "watch" | "sick" | "ppp";

type HeroState = {
  key: string;
  /** Badge label on the credential (also the dot's accessible name). */
  badge: string;
  tone: HeroTone;
  /** The single contextual read-only row on the credential front. */
  row: string;
};

// PO-approved sequence. "encontrada" resolves back to AL DÍA (green) on
// purpose — being found returns the credential to its resting state.
const HERO_STATES: HeroState[] = [
  { key: "aldia", badge: "AL DÍA", tone: "ok", row: "Vacunas firmadas" },
  { key: "perdida", badge: "PERDIDA", tone: "lost", row: "Llamar al dueño" },
  { key: "encontrada", badge: "AL DÍA", tone: "ok", row: "Volvió a casa" },
  { key: "observacion", badge: "EN OBSERVACIÓN", tone: "watch", row: "Cierra sola en 8 días" },
  { key: "tratamiento", badge: "EN TRATAMIENTO", tone: "sick", row: "Plan en el historial" },
  { key: "ppp", badge: "REGISTRO PPP", tone: "ppp", row: "Requisito jurisdiccional" },
];

const CYCLE_MS = 2600;
const RESUME_MS = 8000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Decorative MRZ line (the DNI wink). Built from the real token by replacing
 * "-" with "<" and padding to the ICAO 44-char width. aria-hidden.
 */
function buildMrz(token: string): string {
  return `P<ARG${PAMPA.name.toUpperCase()}<<${token.replaceAll("-", "<")}`.padEnd(44, "<");
}

export function LandingHero({ qrSvg, publicHref, publicToken }: LandingHeroProps) {
  // Always start on "al día", front face — correct for SSR, no-JS, reduced motion.
  const [index, setIndex] = useState(0);
  const [face, setFace] = useState<"front" | "back">("front");

  const cardRef = useRef<HTMLDivElement>(null);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flippingRef = useRef(false);

  const startCycle = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (cycleRef.current) clearInterval(cycleRef.current);
    cycleRef.current = setInterval(() => {
      setIndex((n) => (n + 1) % HERO_STATES.length);
    }, CYCLE_MS);
  }, []);

  // Manual interaction pauses the loop; it quietly resumes after 8s idle.
  const pauseCycle = useCallback(() => {
    if (cycleRef.current) clearInterval(cycleRef.current);
    if (resumeRef.current) clearTimeout(resumeRef.current);
    resumeRef.current = setTimeout(startCycle, RESUME_MS);
  }, [startCycle]);

  useEffect(() => {
    startCycle();
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      if (resumeRef.current) clearTimeout(resumeRef.current);
      for (const t of flipTimersRef.current) clearTimeout(t);
    };
  }, [startCycle]);

  const selectState = useCallback(
    (i: number) => {
      pauseCycle();
      setIndex(i);
    },
    [pauseCycle],
  );

  // Edge-on flip: turn to 90°, swap the face at the invisible edge, turn back.
  // Icon-only trigger; both faces carry one. Instant swap under reduced motion.
  const flip = useCallback(() => {
    if (flippingRef.current) return;
    flippingRef.current = true;
    pauseCycle();
    const el = cardRef.current;
    const swap = () => setFace((f) => (f === "front" ? "back" : "front"));
    if (!el || prefersReducedMotion()) {
      swap();
      flippingRef.current = false;
      return;
    }
    el.style.transform = "rotateY(90deg)";
    const t1 = setTimeout(() => {
      swap();
      el.style.transform = "rotateY(0deg)";
      const t2 = setTimeout(() => {
        flippingRef.current = false;
      }, 300);
      flipTimersRef.current.push(t2);
    }, 290);
    flipTimersRef.current.push(t1);
  }, [pauseCycle]);

  const state = HERO_STATES[index] ?? HERO_STATES[0];
  const mrz = buildMrz(publicToken);

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
              <b>Gratis para siempre.</b> Sin papeleo. Datos abiertos.
            </p>
          </div>

          <div className="lp-hero-photo lp-reveal" data-d="2">
            <div className="flex w-full flex-col items-center">
              <div className="lp-hcardwrap">
                <div
                  ref={cardRef}
                  className="lp-hcard"
                  data-section="hero-credential"
                  data-tone={state.tone}
                  data-face={face}
                  aria-label={`Credencial de ${PAMPA.name}`}
                >
                  {/* FRONT — the mini credential */}
                  <div className="lp-hcard-front">
                    <div className="lp-hcard-trim">
                      <span className="lp-hcard-brand">
                        <i />
                        MiMAR
                      </span>
                      <span className="lp-hcard-trim-r">
                        <span key={index} className="lp-hcard-badge">
                          {state.badge}
                        </span>
                        <button
                          type="button"
                          className="lp-hcard-flip"
                          aria-label="Girar credencial"
                          title="Girar"
                          onClick={flip}
                        >
                          ↻
                        </button>
                      </span>
                    </div>

                    <div className="lp-hcard-body">
                      <span className="lp-hcard-photo">
                        <Image
                          src="/landing/pampa-hero.jpg"
                          alt={
                            state.tone === "lost"
                              ? `${PAMPA.name}, en modo perdido`
                              : `${PAMPA.name}, perro`
                          }
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </span>
                      <span className="lp-hcard-id">
                        <span className="lp-hcard-name">{PAMPA.name}</span>
                        <span className="lp-hcard-token">{publicToken}</span>
                      </span>
                      <Link
                        href={publicHref}
                        aria-label="Ver la credencial pública de demostración"
                        title="Escaneame — QR real de demostración"
                        className="lp-hcard-qr"
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated QR SVG from the qrcode package, no user input.
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                    </div>

                    <div key={index} className="lp-hcard-ctx">
                      <span className="lp-hcard-ctx-chev" aria-hidden="true">
                        ▸
                      </span>
                      <span>{state.row}</span>
                    </div>

                    <div className="lp-hcard-mrz" aria-hidden="true">
                      {mrz}
                    </div>
                  </div>

                  {/* BACK — the mini libreta sanitaria */}
                  <div className="lp-hcard-back">
                    <div className="lp-hcard-libhead">
                      <b>Libreta sanitaria</b>
                      <span className="lp-hcard-trim-r">
                        <span className="lp-hcard-libmeta">
                          {PAMPA.name} · {publicToken}
                        </span>
                        <button
                          type="button"
                          className="lp-hcard-flip"
                          aria-label="Volver a la credencial"
                          title="Girar"
                          onClick={flip}
                        >
                          ↻
                        </button>
                      </span>
                    </div>

                    <div className="lp-hcard-librow">
                      <span>
                        <span className="lp-hcard-libwhat">Antirrábica</span>
                        <span className="lp-hcard-libwho">Vet. M.N. 12.345 · 03/2026</span>
                      </span>
                      <span className="lp-hcard-libstamp">FIRMADA</span>
                    </div>
                    <div className="lp-hcard-librow">
                      <span>
                        <span className="lp-hcard-libwhat">Desparasitación</span>
                        <span className="lp-hcard-libwho">Vet. M.N. 12.345 · 01/2026</span>
                      </span>
                      <span className="lp-hcard-libstamp">FIRMADA</span>
                    </div>
                    <div className="lp-hcard-librow">
                      <span>
                        <span className="lp-hcard-libwhat">Control anual</span>
                        <span className="lp-hcard-libwho">Clínica Recoleta · 11/2025</span>
                      </span>
                      <span className="lp-hcard-libstamp">FIRMADA</span>
                    </div>
                    <div className="lp-hcard-libfoot">…y toda su historia, inmutable.</div>
                  </div>
                </div>
              </div>

              {/* Curiosity-hook microcopy (PO-locked wording, landing microcopy
                  train): sits between the credential and the state dots, so it
                  reads as "about this card" without crowding either. Points at
                  the same QR the card already renders — no new link, just the
                  nudge to actually try it. */}
              <p className="lp-hcard-hint lp-reveal" data-d="3">
                Escanealo para ver más sobre {PAMPA.name}
              </p>

              {/* State dots — tap one to take control of the cycle */}
              <div className="lp-hdots" role="toolbar" aria-label="Estados de la credencial">
                {HERO_STATES.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    className="lp-hdot"
                    data-on={i === index}
                    data-tone={s.tone}
                    aria-label={s.badge}
                    aria-pressed={i === index}
                    onClick={() => selectState(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
