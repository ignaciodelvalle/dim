// The pet-profile icon vocabulary — app icon name → lucide EXPORT name.
//
// WHY STRINGS AND NOT COMPONENTS. This package is framework-free by fence
// (scripts/check-contract-purity.ts): it may not import `lucide-react` any
// more than it may import `react`. What CAN cross the boundary is the NAMING
// — the app-side icon vocabulary (the same names `components/Icon.tsx` keys
// its ICON_MAP with) and the lucide glyph each name means. Both sides then
// resolve the glyph against their OWN lucide package: the web against
// `lucide-react`, the Expo app against `lucide-react-native`. The two
// packages publish the same icon set under the same export names per
// version line, so a mapping that lives here cannot drift into "the phone's
// `girar` is a different arrow than the web's".
//
// WHAT IS IN IT. Only what the native pet profile actually renders, plus
// every `situation.icon` string the API can send (`OwnerPetSituationV1.icon`
// — decided server-side by `lib/ui/pet-situation.ts`'s PET_SITUATIONS table,
// which is the authority for that set). This is deliberately NOT a copy of
// the web's whole ICON_MAP: a table nobody renders is a table nobody
// notices rotting.
//
// FENCED on the mobile side: `apps/mobile/src/ui/Icon.test.tsx` asserts
// every export name below resolves in `lucide-react-native`'s exports.

/**
 * App icon name → lucide export name (PascalCase), for the pet profile.
 *
 * The name column matches the web ICON_MAP vocabulary verbatim; the value
 * column matches the web's chosen glyph for that name verbatim
 * (components/Icon.tsx). Change a glyph THERE first — this table follows.
 */
export const PET_PROFILE_ICONS = {
  // Document chrome
  girar: "RefreshCw",

  // Situation chip — every icon PET_SITUATIONS can put on the wire.
  "check-circle": "CheckCircle",
  perdida: "Siren",
  shield: "Shield",
  ver: "Eye",
  medicacion: "Pill",
  embarazo: "Baby",
  corazon: "Heart",
  casa: "Home",
  fallecimiento: "Circle",

  // Identity row
  paw: "PawPrint",
  check: "Check",
  "map-pin": "MapPin",

  // Section dividers
  alert: "AlertTriangle",

  // Action footer
  libreta: "BookOpen",
  share: "Share2",
  edit: "Pencil",
  "alert-triangle": "AlertTriangle",
  ellipsis: "MoreHorizontal",
} as const;

export type PetProfileIconName = keyof typeof PET_PROFILE_ICONS;

/** The lucide export names the table maps onto. */
export type PetProfileIconGlyph = (typeof PET_PROFILE_ICONS)[PetProfileIconName];
