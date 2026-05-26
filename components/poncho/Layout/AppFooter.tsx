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
      { href: "/adoptar", label: "Adoptar" },
      { href: "/denuncias", label: "Denuncias" },
      { href: "/libreta", label: "Mi libreta" },
    ],
  },
  {
    title: "Información",
    links: [
      { href: "/acerca", label: "Acerca de MiMAR" },
      { href: "/ayuda", label: "Ayuda" },
      { href: "/accesibilidad", label: "Accesibilidad" },
      { href: "/sugerencias", label: "Hacer una sugerencia" },
    ],
  },
  {
    title: "Legales",
    links: [
      { href: "/terminos", label: "Términos y condiciones" },
      { href: "/privacidad", label: "Política de privacidad" },
      { href: "/cookies", label: "Cookies" },
    ],
  },
];

type Props = {
  columns?: Column[];
};

export function AppFooter({ columns = DEFAULT_COLUMNS }: Props) {
  return (
    <footer className="mt-12 bg-white dark:bg-neutral-950">
      <div className="border-t border-gob-border dark:border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Marca + tagline */}
            <div>
              <p className="text-lg font-bold text-gob-primary dark:text-neutral-50">MiMAR</p>
              <p className="mt-1 text-sm text-gob-text-muted dark:text-neutral-400">
                Mi Mascota Argentina · Credencial digital sanitaria.
              </p>
              <p className="mt-4 text-xs text-gob-text-muted dark:text-neutral-400">
                Una iniciativa pública para que cada animal cuente con su historia clínica portable.
              </p>
            </div>

            {columns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-sm font-bold text-gob-text-gray dark:text-neutral-200">
                  {col.title}
                </h2>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        target={l.external ? "_blank" : undefined}
                        rel={l.external ? "noopener noreferrer" : undefined}
                        className="text-sm text-gob-text-gray no-underline hover:text-gob-azul-link hover:underline dark:text-neutral-300 dark:hover:text-neutral-50"
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
          <div className="mt-10 flex flex-col gap-3 border-t border-gob-border pt-6 text-xs text-gob-text-muted md:flex-row md:items-center md:justify-between dark:border-neutral-800 dark:text-neutral-400">
            <p>
              Los contenidos están licenciados bajo{" "}
              <a
                href="https://creativecommons.org/licenses/by/2.5/ar/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gob-azul-link hover:underline"
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
                className="text-gob-azul-link hover:underline"
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
