import { BRANDING } from "@/lib/ui/branding";
import Link from "next/link";
import { GobStripe } from "./GobStripe";

/**
 * Footer institucional liviano.
 *
 * Estructura:
 *   - Bloque principal blanco con links de producto + institucionales.
 *   - Línea de licencia CC + link a argentina.gob.ar.
 *   - Cinta argentina al pie (espejo del header).
 */

type FooterLink = { href: string; label: string; external?: boolean };

type Column = { title: string; links: FooterLink[] };

const DEFAULT_COLUMNS: Column[] = [
  {
    title: "Producto",
    links: [
      { href: "/", label: "Inicio" },
      { href: "/perdidas", label: "Mascotas perdidas" },
      { href: "/adoptar", label: "Adoptar" },
      { href: "/denuncias", label: "Denuncias" },
      // Session-aware destination (tester fix #9): with an active session the
      // old /login target showed the login page instead of the libreta.
      // /mis-mascotas sits behind the (app) auth guard, so logged-in users
      // land on their libreta and anonymous visitors are bounced to /login —
      // the same place the link used to take them.
      { href: "/mis-mascotas", label: "Mi libreta" },
    ],
  },
  {
    title: "Información",
    links: [
      { href: "/acerca", label: "Acerca de miMAR" },
      { href: "/ayuda", label: "Ayuda" },
      { href: "/accesibilidad", label: "Accesibilidad" },
      // /sugerencias — no feedback channel exists yet; link hidden to avoid dead end.
      // Restore once a real submission mechanism is implemented.
    ],
  },
  {
    title: "Legales",
    links: [
      { href: "/terminos", label: "Términos y condiciones" },
      { href: "/privacidad", label: "Política de privacidad" },
      { href: "/cookies", label: "Cookies" },
      { href: "/leyes", label: "Marco legal" },
      { href: "/transparencia", label: "Transparencia activa" },
    ],
  },
];

type Props = {
  columns?: Column[];
};

export function AppFooter({ columns = DEFAULT_COLUMNS }: Props) {
  return (
    <footer className="mt-12 bg-white">
      <div className="border-t border-ln-line">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Marca + tagline */}
            <div>
              <p className="text-lg font-bold text-ln-azul">{BRANDING.appName}</p>
              <p className="mt-1 text-sm text-ln-mute">
                {BRANDING.appNameLong} · {BRANDING.tagline}.
              </p>
              <p className="mt-4 text-xs text-ln-mute">
                Una iniciativa pública para que cada animal cuente con su historia clínica portable.
              </p>
            </div>

            {columns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-sm font-bold text-ln-ink-2">{col.title}</h2>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        target={l.external ? "_blank" : undefined}
                        rel={l.external ? "noopener noreferrer" : undefined}
                        className="text-sm text-ln-ink-2 no-underline hover:text-ln-azul hover:underline"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/* Línea legal */}
          <div className="mt-10 flex flex-col gap-3 border-t border-ln-line pt-6 text-xs text-ln-mute md:flex-row md:items-center md:justify-between">
            <p>
              Los contenidos están licenciados bajo{" "}
              <a
                href="https://creativecommons.org/licenses/by/2.5/ar/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ln-azul hover:underline"
              >
                Creative Commons Reconocimiento 2.5 Argentina
              </a>
              .
            </p>
            <p>
              <a
                href="https://www.argentina.gob.ar/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ln-azul hover:underline"
              >
                argentina.gob.ar
              </a>
            </p>
          </div>
        </div>
      </div>

      <GobStripe />
    </footer>
  );
}
