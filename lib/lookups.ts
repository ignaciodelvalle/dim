// Predefined options for multi-select fields on the new-pet form.
// Owners can also type "otros" entries — these lists just provide common
// defaults so the typical case is one click instead of free-typing.

export const COMMON_FOODS = [
  "Comida seca (balanceada)",
  "Comida húmeda (lata / pouch)",
  "Dieta natural / BARF",
  "Dieta casera",
  "Premios / snacks",
  "Comida para edad senior",
  "Comida hipoalergénica",
  "Comida medicada / prescripción",
];

export const COMMON_ALLERGIES = [
  "Pollo",
  "Carne vacuna",
  "Cerdo",
  "Pescado",
  "Lácteos",
  "Huevo",
  "Cereales (trigo, maíz)",
  "Pulgas",
  "Polen / ambiente",
  "Ácaros del polvo",
  "Picaduras de insectos",
];

export const TRAINING_LEVELS = [
  { value: "none", label: "Ninguno" },
  { value: "basic", label: "Básico (sentarse, venir)" },
  { value: "intermediate", label: "Intermedio (obediencia general)" },
  { value: "advanced", label: "Avanzado" },
  { value: "professional", label: "Profesional / trabajo" },
] as const;

// Microchip implant location — WSAVA recommends interscapular (between the
// shoulder blades). We default to interscapular_left to match the most common
// practice in Argentinian veterinary clinics.
export const MICROCHIP_LOCATIONS = [
  { value: "interscapular_left", label: "Interescapular izquierdo (recomendado)" },
  { value: "interscapular_right", label: "Interescapular derecho" },
  { value: "neck_back", label: "Cuello (dorsal)" },
  { value: "inguinal", label: "Inguinal" },
  { value: "other", label: "Otra ubicación" },
];

// Some pet insurance companies operating in Argentina (2025-26). Free text
// allowed too; this is just for autocomplete.
export const INSURANCE_COMPANIES = [
  "Mapfre Mascotas",
  "Sancor Seguros",
  "La Caja Mascotas",
  "Provincia Seguros",
  "Federación Patronal",
  "PetCheck",
];
