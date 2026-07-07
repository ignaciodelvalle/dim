// Features as life moments (benchmark L6, LifeSG naming — no law citations
// in copy). "Y cuando no es un buen día" band, 6 cards.

import { Icon } from "@/components/Icon";
import { LIFE_MOMENTS } from "@/components/landing/landing-content";
import Link from "next/link";

export function FeaturesSection() {
  return (
    <section className="lp-section lp-section--stripe" id="features" data-section="life-moments">
      <div className="lp-wrap">
        <div className="lp-featband-h lp-reveal">
          <h2 className="lp-display text-[clamp(28px,3.6vw,44px)]">Y cuando no es un buen día</h2>
          <span className="lp-lead text-[var(--text-base)]">
            Lo serio también está cubierto — de punta a punta.
          </span>
        </div>
        <div className="lp-feat-grid lp-reveal">
          {LIFE_MOMENTS.map((f) => (
            <article className="lp-feat" key={f.title}>
              <span className="lp-fic" aria-hidden="true">
                <Icon name={f.icon} size="md" decorative />
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
        <p className="lp-feat-more lp-reveal">
          ¿Qué funciona en tu localidad?{" "}
          <Link href="/funcionalidades">Todas las funcionalidades →</Link>
        </p>
      </div>
    </section>
  );
}
