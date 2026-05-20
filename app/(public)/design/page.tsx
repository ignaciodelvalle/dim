import { Button } from "@/components/poncho";
import { IconSearch } from "./IconSearch";

/**
 * Página interna de referencia visual.
 * Muestra paleta, tipografía, botones e íconos basados en Poncho (gob.ar).
 * URL: /design
 */

export const metadata = {
  title: "Sistema de diseño · MiMAR",
  robots: { index: false, follow: false },
};

type Swatch = {
  name: string;
  varName: string;
  tailwindClass: string;
  hex: string;
  onColor: "light" | "dark"; // qué color de texto va arriba
  note?: string;
};

const lightSwatches: Swatch[] = [
  {
    name: "Primary",
    varName: "--color-gob-primary",
    tailwindClass: "bg-gob-primary",
    hex: "#242C4F",
    onColor: "light",
    note: "CTA, headers",
  },
  {
    name: "Celeste",
    varName: "--color-gob-celeste",
    tailwindClass: "bg-gob-celeste",
    hex: "#37BBED",
    onColor: "dark",
    note: "Cinta argentina, focus ring",
  },
  {
    name: "Azul link",
    varName: "--color-gob-azul-link",
    tailwindClass: "bg-gob-azul-link",
    hex: "#0072BB",
    onColor: "light",
    note: "Enlaces",
  },
  {
    name: "Success",
    varName: "--color-gob-success",
    tailwindClass: "bg-gob-success",
    hex: "#2E7D33",
    onColor: "light",
    note: "Avanzar",
  },
  {
    name: "Danger",
    varName: "--color-gob-danger",
    tailwindClass: "bg-gob-danger",
    hex: "#C62828",
    onColor: "light",
    note: "Eliminar",
  },
  {
    name: "Warning",
    varName: "--color-gob-warning",
    tailwindClass: "bg-gob-warning",
    hex: "#E7BA61",
    onColor: "dark",
    note: "Atención",
  },
  {
    name: "Info",
    varName: "--color-gob-info",
    tailwindClass: "bg-gob-info",
    hex: "#2897D4",
    onColor: "light",
    note: "Solo texto grande (≥18pt)",
  },
  {
    name: "Texto",
    varName: "--color-gob-text",
    tailwindClass: "bg-black",
    hex: "#000000",
    onColor: "light",
  },
  {
    name: "Texto gris",
    varName: "--color-gob-text-gray",
    tailwindClass: "bg-gob-text-gray",
    hex: "#444444",
    onColor: "light",
  },
  {
    name: "Texto muted",
    varName: "--color-gob-text-muted",
    tailwindClass: "bg-gob-text-muted",
    hex: "#555555",
    onColor: "light",
  },
  {
    name: "Borde",
    varName: "--color-gob-border",
    tailwindClass: "bg-gob-border",
    hex: "#DDDDDD",
    onColor: "dark",
  },
  {
    name: "Superficie alt.",
    varName: "--color-gob-surface-alt",
    tailwindClass: "bg-gob-surface-alt",
    hex: "#F2F2F2",
    onColor: "dark",
  },
];

// Para dark mode: muestreamos los colores tal como quedan calculados.
// Estos son los valores del bloque `prefers-color-scheme: dark` en globals.css.
const darkSwatches: { name: string; hex: string; onColor: "light" | "dark"; note: string }[] = [
  { name: "Background", hex: "#0A0A0A", onColor: "light", note: "Fondo dark" },
  { name: "Foreground", hex: "#FAFAFA", onColor: "dark", note: "Texto principal" },
  {
    name: "Primary (claro)",
    hex: "#6A78C2",
    onColor: "light",
    note: "Primary aclarado para AA sobre dark",
  },
  { name: "Success (claro)", hex: "#66BB6A", onColor: "dark", note: "" },
  { name: "Danger (claro)", hex: "#EF5350", onColor: "dark", note: "" },
  { name: "Warning (claro)", hex: "#FFB74D", onColor: "dark", note: "" },
  { name: "Info (claro)", hex: "#4FC3F7", onColor: "dark", note: "" },
  { name: "Ring (claro)", hex: "#62CDF2", onColor: "dark", note: "Focus ring sobre dark" },
];

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <div
      className={`rounded-md p-4 text-sm ${s.tailwindClass} ${
        s.onColor === "light" ? "text-white" : "text-black"
      }`}
    >
      <div className="font-semibold">{s.name}</div>
      <div className="opacity-90">{s.hex}</div>
      <div className="mt-1 text-xs opacity-75">
        <code>{s.varName}</code>
      </div>
      {s.note && <div className="mt-1 text-xs opacity-90">{s.note}</div>}
    </div>
  );
}

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Header */}
      <header className="mb-12 border-b border-gob-border pb-6">
        <p className="text-sm uppercase tracking-wide text-gob-text-muted">
          MiMAR · Sistema de diseño
        </p>
        <h1 className="mt-1 text-4xl font-bold">Tokens basados en Poncho</h1>
        <p className="lead mt-2 text-gob-text-gray">
          Paleta, tipografía e íconos oficiales de gob.ar portados a Next.js + Tailwind v4.
        </p>
      </header>

      {/* Tipografía */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Tipografía — Encode Sans</h2>
        <div className="space-y-2 rounded-md border border-gob-border p-6">
          <h1 className="text-5xl">h1 · Esto es un título</h1>
          <h2 className="text-4xl">h2 · Esto es un título</h2>
          <h3 className="text-3xl">h3 · Esto es un título</h3>
          <h4 className="text-2xl">h4 · Esto es un título</h4>
          <h5 className="text-xl">h5 · Esto es un título</h5>
          <p className="lead pt-2">
            Lead — Texto destacado para bajadas. Encode Sans Medium (500) en cuerpo, Bold (700) en
            titulares.
          </p>
          <p>
            Cuerpo de párrafo regular. Tus mascotas tienen un{" "}
            {/* biome-ignore lint/a11y/useValidAnchor: design-system showcase page — placeholder link, no real navigation */}
            <a href="#" className="text-gob-azul-link underline-offset-4 hover:underline">
              enlace
            </a>{" "}
            como este. <strong>Negrita</strong> y <em>cursiva</em> con moderación.
          </p>
          <p>
            <small className="text-gob-text-muted">
              Small · Información complementaria, ayuda en formularios o aclaraciones legales.
            </small>
          </p>
        </div>
      </section>

      {/* Paleta light */}
      <section className="mb-12">
        <h2 className="mb-1 text-2xl font-bold">Paleta — modo claro</h2>
        <p className="mb-4 text-sm text-gob-text-muted">
          Consumir vía utilidades Tailwind (<code>bg-gob-primary</code>) o variables CSS.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {lightSwatches.map((s) => (
            <SwatchCard key={s.varName} s={s} />
          ))}
        </div>
      </section>

      {/* Paleta dark */}
      <section className="mb-12">
        <h2 className="mb-1 text-2xl font-bold">Paleta — modo oscuro</h2>
        <p className="mb-4 text-sm text-gob-text-muted">
          Valores que toma la paleta semántica cuando <code>prefers-color-scheme: dark</code>.
          Aclaramos primary y semánticas para mantener contraste AA sobre fondo oscuro.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {darkSwatches.map((s) => (
            <div
              key={s.hex}
              className={`rounded-md p-4 text-sm ${s.onColor === "light" ? "text-white" : "text-black"}`}
              style={{ background: s.hex }}
            >
              <div className="font-semibold">{s.name}</div>
              <div className="opacity-90">{s.hex}</div>
              {s.note && <div className="mt-1 text-xs opacity-90">{s.note}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Botones */}
      <section className="mb-12">
        <h2 className="mb-1 text-2xl font-bold">Botones</h2>
        <p className="mb-4 text-sm text-gob-text-muted">
          Variantes alineadas con{" "}
          <a
            href="https://argob.github.io/poncho/componentes/botones/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gob-azul-link underline-offset-4 hover:underline"
          >
            Poncho componentes/botones
          </a>
          . Touch target ≥44px. Focus ring celeste global.
        </p>

        <h3 className="mt-6 mb-3 text-lg font-bold">Variantes</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primario</Button>
          <Button variant="success">Avanzar</Button>
          <Button variant="danger">Eliminar</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="link">Cancelar</Button>
          <Button variant="tag">Etiqueta</Button>
        </div>

        <h3 className="mt-8 mb-3 text-lg font-bold">Tamaños</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm">
            Chico
          </Button>
          <Button variant="primary" size="md">
            Mediano
          </Button>
          <Button variant="primary" size="lg">
            Grande
          </Button>
        </div>

        <h3 className="mt-8 mb-3 text-lg font-bold">Estados</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
          <Button variant="primary" loading>
            Cargando…
          </Button>
          <Button variant="success" loading>
            Guardando vacuna
          </Button>
        </div>

        <h3 className="mt-8 mb-3 text-lg font-bold">Con íconos</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" iconLeft="vacuna">
            Vacunar
          </Button>
          <Button variant="success" iconRight="credenciales">
            Ver libreta
          </Button>
          <Button variant="danger" iconLeft="denuncia">
            Denunciar
          </Button>
          <Button variant="secondary" iconLeft="lupa">
            Buscar mascota
          </Button>
        </div>

        <h3 className="mt-8 mb-3 text-lg font-bold">Patrón de cancelar vs eliminar</h3>
        <div className="rounded-md border border-gob-border p-4">
          <p className="mb-3 text-sm">¿Eliminar la vacuna del registro?</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="link">Cancelar</Button>
            <Button variant="danger" iconLeft="denuncia">
              Eliminar
            </Button>
          </div>
          <p className="mt-3 text-xs text-gob-text-muted">
            "Cancelar" usa <code>link</code> (neutro, sin peso visual). "Eliminar" usa{" "}
            <code>danger</code> (outline rojo, terminante). Nunca dos botones destacados juntos.
          </p>
        </div>
      </section>

      {/* Íconos — con buscador */}
      <section className="mb-12">
        <h2 className="mb-1 text-2xl font-bold">Íconos — icono-arg</h2>
        <p className="mb-4 text-sm text-gob-text-muted">
          Click en un ícono copia <code>{`<Icon name="..." />`}</code> al portapapeles.
        </p>
        <IconSearch />
      </section>

      <footer className="border-t border-gob-border pt-6 text-sm text-gob-text-muted">
        Fase 1 — Tokens e identidad. Próximas fases: header/footer gob.ar, biblioteca completa de
        componentes, aplicación al producto.
      </footer>
    </main>
  );
}
