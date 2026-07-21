// Landing footer — brand + 3 columns + legal line + closing GobStripe.

import { FOOTER_NAV } from "@/components/landing/landing-content";
import { GobStripe } from "@/components/layout/GobStripe";
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="lp-foot" data-section="landing-footer">
      <div className="lp-wrap-wide">
        <div className="lp-foot-grid">
          <div>
            <div className="lp-brand mb-3">
              <span className="lp-brand-mark" aria-hidden="true">
                M
              </span>
              <span>
                <span className="lp-brand-name">miMAR</span>
                <span className="lp-brand-sub">Mi Mascota Argentina</span>
              </span>
            </div>
            <p className="max-w-xs text-[var(--text-md)] leading-relaxed text-[var(--color-ln-mute)]">
              El registro nacional de identidad y salud de las mascotas de la Argentina. Una
              iniciativa pública.
            </p>
          </div>
          {FOOTER_NAV.map(([heading, items]) => (
            <div key={heading}>
              <h4>{heading}</h4>
              <ul>
                {items.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="lp-foot-legal">
          <span>Ministerio de Salud · República Argentina</span>
          <span aria-hidden="true">·</span>
          <span>argentina.gob.ar/salud</span>
          <span className="lp-spacer" />
          <span>
            miMAR opera bajo la Ley 14.346 (protección animal) y la Ley 25.326 (protección de datos
            personales).
          </span>
        </div>
      </div>
      <GobStripe height={6} />
    </footer>
  );
}
