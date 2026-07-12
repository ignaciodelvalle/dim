// Icon component backed by lucide-react.
//
// Previously a stub for the icono-arg webfont (never committed). Replaced
// with a curated ICON_MAP covering every name actually used in the app.
//
// Public API is unchanged:
//   <Icon name="vacuna" size="md" decorative />
//
// Size tokens: "sm" → 16 px, "md" → 20 px, "lg" → 24 px.
// Numbers are treated as pixels; arbitrary CSS strings (e.g. "1.1em") are
// passed via width/height attributes on the SVG.
// Icons inherit currentColor — the parent element controls the color.
//
// Unknown names: render <HelpCircle> fallback + console.warn in development.
// Kept as a free string (not a union) so callers with dynamic names compile
// without casting and unknown names degrade gracefully.

import {
  AlertTriangle,
  Baby,
  Bell,
  BookOpen,
  BriefcaseMedical,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Handshake,
  Heart,
  HelpCircle,
  Home,
  IdCard,
  Info,
  Laptop,
  Layers,
  LayoutDashboard,
  LineChart,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Milk,
  MoreHorizontal,
  Nfc,
  PawPrint,
  Pencil,
  Phone,
  Pill,
  QrCode,
  RefreshCw,
  Scale,
  Scissors,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Siren,
  Smartphone,
  Stethoscope,
  Syringe,
  Tag,
  Users,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type React from "react";
import type { HTMLAttributes } from "react";

/**
 * Name of an icon in the ICON_MAP registry.
 * Kept as a plain string (not a union) so dynamic callers compile without
 * casting and unknown names fall back gracefully.
 */
export type IconName = string;

/**
 * Internal map: app icon name → Lucide component.
 *
 * Spanish semantic names match what callers pass (vacuna, corazon, …).
 * English/UI names cover Alert / EmptyState / Badge slots (info, close, …).
 */
const ICON_MAP: Record<string, LucideIcon> = {
  // ── Event form icons ─────────────────────────────────────────────────────
  vacuna: Syringe,
  microchip: Nfc,
  "microchip-reemplazo": RefreshCw,
  transferencia: RefreshCw,
  peso: Scale,
  medicacion: Pill,
  esterilizacion: Scissors,
  tatuaje: Pencil,
  embarazo: Baby,
  lactancia: Milk,
  checkin: MapPin,
  nota: FileText,
  sintoma: Stethoscope,
  clinico: BriefcaseMedical,
  mordedura: PawPrint,
  fallecimiento: Circle,
  vet: Stethoscope,
  "medicacion-fin": XCircle,

  // ── Core semantic icons ──────────────────────────────────────────────────
  credenciales: IdCard,
  credential: IdCard,
  libreta: BookOpen,
  booklet: BookOpen,
  denuncia: Megaphone,
  lupa: Search,
  search: Search,
  qr: QrCode,
  corazon: Heart,
  heart: Heart,
  telefono: Phone,
  phone: Phone,
  ubicacion: MapPin,
  "map-pin": MapPin,
  ojo: Eye,
  ver: Eye,
  casa: Home,
  home: Home,
  camara: Camera,
  celular: Smartphone,
  alerta: AlertTriangle,
  alert: AlertTriangle,
  "alert-triangle": AlertTriangle,
  "alert-circle": AlertTriangle,
  candado: Lock,
  lock: Lock,
  reloj: Clock,
  clock: Clock,
  editar: Pencil,
  edit: Pencil,
  perdida: Siren,
  lost: Siren,
  huella: PawPrint,
  paw: PawPrint,
  usuarios: Users,
  users: Users,
  edificio: Building2,
  building: Building2,

  // ── Case kind icons ───────────────────────────────────────────────────────
  solicitud: FileText,
  propuesta: MessageSquare,
  trato: Handshake,
  reparacion: Wrench,
  brote: AlertTriangle,
  custodia: FileText,
  disputa: Scale,

  // ── UI semantic icons ────────────────────────────────────────────────────
  close: X,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  "check-circle": CheckCircle,
  "shield-check": ShieldCheck,
  shield: Shield,
  "chevron-right": ChevronRight,
  "chart-line": LineChart,
  "heart-filled": Heart,
  menu: Menu,
  settings: Settings,
  bell: Bell,
  logout: LogOut,
  dashboard: LayoutDashboard,
  laptop: Laptop,
  zap: Zap,
  share: Share2,
  check: Check,
  ellipsis: MoreHorizontal,
  tag: Tag,
  girar: RefreshCw,

  // ── Panorama v3 rail icons ───────────────────────────────────────────────
  // vista (preset/view picker) and capas (layer on/off) used to share the
  // same Layers glyph, making the top two rail buttons look identical
  // (panorama QA root-cause #1). LayoutDashboard reads as "which view/
  // preset", distinct from Layers' "stack of layers" reading — already
  // imported above, so no new dependency.
  vista: LayoutDashboard,
  capas: Layers,
  filtro: Filter,
  filter: Filter,
  periodo: CalendarDays,
  calendario: CalendarDays,
  "linea-tiempo": LineChart,
  timeline: LineChart,
  exportar: Download,
  descargar: Download,
  actualizar: RefreshCw,
  acerca: Info,
};

/** All registered icon names — consumed by the IconSearch browser in /design. */
export const iconNames: ReadonlyArray<IconName> = Object.keys(ICON_MAP);

// ── Size resolution ──────────────────────────────────────────────────────────

type SizeProp = "sm" | "md" | "lg" | number | string;

function resolveSize(size?: SizeProp): { px?: number; css?: string } {
  if (size === undefined) return { px: 20 }; // default md
  if (size === "sm") return { px: 16 };
  if (size === "md") return { px: 20 };
  if (size === "lg") return { px: 24 };
  if (typeof size === "number") return { px: size };
  return { css: size }; // arbitrary CSS string e.g. "1.1em"
}

// ── Component ────────────────────────────────────────────────────────────────

type IconProps = {
  name: IconName;
  /**
   * "sm" (16 px) | "md" (20 px, default) | "lg" (24 px) | number (px) | CSS string.
   */
  size?: SizeProp;
  /** When true, aria-hidden is set — use for decorative icons paired with visible text. */
  decorative?: boolean;
} & Omit<HTMLAttributes<SVGElement>, "aria-hidden">;

export function Icon({ name, size, decorative, className, style, ...rest }: IconProps) {
  const LucideComponent = ICON_MAP[name];

  if (!LucideComponent) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[Icon] Unknown icon name: "${name}". Rendering fallback.`);
    }
    return (
      <FallbackIcon
        name={name}
        size={size}
        decorative={decorative}
        className={className}
        style={style}
        {...(rest as React.SVGProps<SVGSVGElement>)}
      />
    );
  }

  const { px, css } = resolveSize(size);
  const sizeProps = px !== undefined ? { width: px, height: px } : { width: css, height: css };

  return (
    <LucideComponent
      data-icon-name={name}
      aria-hidden={decorative ? true : undefined}
      className={className}
      style={style}
      strokeWidth={1.75}
      {...sizeProps}
      {...(rest as React.SVGProps<SVGSVGElement>)}
    />
  );
}

function FallbackIcon({ name, size, decorative, className, style, ...rest }: IconProps) {
  const { px, css } = resolveSize(size);
  const sizeProps = px !== undefined ? { width: px, height: px } : { width: css, height: css };

  return (
    <HelpCircle
      data-icon-name={name}
      aria-hidden={decorative ? true : undefined}
      className={className}
      style={style}
      strokeWidth={1.75}
      {...sizeProps}
      {...(rest as React.SVGProps<SVGSVGElement>)}
    />
  );
}
