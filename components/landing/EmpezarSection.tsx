// Empezar — "Entrá por tu puerta". EXACTLY two doors (PO-locked): owner
// (primary CTA) + organization. Government/admin do NOT appear (invite-only,
// implicit).

import { Icon } from "@/components/Icon";
import { ROLES } from "@/components/landing/landing-content";
import Link from "next/link";

export function EmpezarSection() {
  return (
    <section className="lp-section lp-section--card" id="empezar" data-section="empezar">
      <div className="lp-wrap">
        <div className="lp-maxw-sec mx-auto text-center">
          <p className="lp-eyebrow lp-eyebrow--blue lp-reveal">Empezar</p>
          <h2 className="lp-display lp-h-sec lp-reveal mt-3.5" data-d="1">
            Entrá por tu puerta
          </h2>
          <p className="lp-lead lp-reveal mx-auto mt-4 text-[var(--text-lg)]" data-d="2">
            Registrala hoy, antes del día que se pierda.
          </p>
        </div>
        <div className="lp-role-grid lp-reveal mt-[clamp(36px,5vw,54px)]">
          {ROLES.map((r) => (
            <article className="lp-role-card" data-tone={r.tone} key={r.tone}>
              <span className="lp-ric" aria-hidden="true">
                <Icon name={r.icon} size="lg" decorative />
              </span>
              <p className="lp-eyebrow mb-2">{r.eyebrow}</p>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={r.ctaHref} className="lp-btn lp-btn--primary lp-btn--compact">
                  {r.cta} <span className="lp-ar">→</span>
                </Link>
                <Link href={r.cta2Href} className="lp-btn lp-btn--ghost lp-btn--compact">
                  {r.cta2}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
