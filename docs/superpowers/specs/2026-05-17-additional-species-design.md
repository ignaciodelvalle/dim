# Additional Species — Design

**Date:** 2026-05-17
**Surface:** `components/PetForm.tsx`, `lib/format.ts`
**Status:** Approved — ready for implementation plan

## Context

DIM currently supports three species values: `dog`, `cat`, and `other`. The `species` column is free-text in `db/schema.ts`, but every catalog (`lib/breeds.ts`, `lib/diseases.ts`, `lib/vaccines.ts`, `lib/drugs.ts`) and every species-aware form branch is hard-keyed on `"dog" | "cat"`. Choosing `Otra` today produces a working but catalog-less profile.

We want a low-risk first step that adds a handful of additional companion species without touching the legal-framework / wildlife-under-custody work, which is deferred (see "Future work" below).

The three species added in this iteration — **conejo (rabbit)**, **cobayo (guinea pig)** and **hurón (ferret)** — are domesticated mammals whose owner-facing form needs are nearly identical to dogs and cats: name, sex, date of birth, weight, microchip (optional), allergies, foods, observations. They reuse the existing `PetForm` shape without modification.

This is the smallest unit that delivers value: dropdown only, no new catalogs, no PPP changes, no schema migration. Vaccine / disease / medication catalogs for these species are intentionally **out of scope** for this iteration and will be filled in once we wire each species to its real sanitary regime.

## User-facing behavior

The species select in `PetForm.tsx` stays a single visible field with three top-level options:

```
Especie:  [ Perro ▾ ]
          - Perro
          - Gato
          - Otra
```

When the user picks **Otra**, a second `<select>` appears immediately below it:

```
Especie:        [ Otra ▾ ]
Tipo de "otra": [ Elegí una ▾ ]
                - Conejo
                - Cobayo
                - Hurón
                - Otro / no listado
```

Behavior:

- The visible value submitted in `formData.species` is the *resolved* species: `rabbit`, `guinea_pig`, `ferret`, or `other`.
- Picking **Otro / no listado** falls back to today's behavior — the stored species is `other` and we render the same `Otra` label everywhere.
- The two selects are wired together with local React state; switching the top select away from `Otra` clears the sub-select.
- On edit, if the stored species is `rabbit | guinea_pig | ferret`, the top select shows `Otra` and the sub-select preselects the right value.
- No new validation rules. Both selects are required when species = `Otra`; the sub-select having no value blocks the form with the existing "Falta la especie." message.

`lib/format.ts` `speciesLabel` adds three new cases (`rabbit → "Conejo"`, `guinea_pig → "Cobayo"`, `ferret → "Hurón"`) so every read site renders the right Spanish label without any other change.

## Out of scope (explicitly deferred)

- **Breed catalogs** for the new species. Rabbits and cobayos do have breeds (Belier, Toy, Peruano, Abisinio…), but the breed field stays free-text for now. Hurones effectively have no breed.
- **Vaccine catalog entries** for the new species (myxomatosis + RHDV2 for conejo; distemper + rabies for hurón). The vaccine form's "vaccinesForSpecies" will return `[]` and the owner sees a free-text vaccine name field. Acceptable.
- **Disease catalog entries** for reportable zoonoses (rabbit hemorrhagic disease, leptospirosis in rodents, canine distemper in hurón). Death-record form's catalog will return `[]`; free-text path still works.
- **Medication catalog entries** — same reasoning.
- **PPP / dangerous-breed logic.** `isPotentiallyDangerousBreed` already returns `false` when `species !== "dog"`. No change.
- **Schema constraint.** `species` stays free-text. A CHECK constraint / enum is intentionally deferred until the full species list stabilises after the three-bucket work below.
- **Three-bucket model** (companion / regulated criadero / wildlife under custody) — deferred to a separate plan. The selection of `rabbit | guinea_pig | ferret` here implicitly treats them as companion animals, which is correct under Argentine law (see "Legal framework" below).
- **SENASA RENSPA bridge** for livestock species (llama, alpaca, equino, gallina). Out of scope — those are not companion animals and belong on a different ingestion path when the time comes.
- **Fauna silvestre as "pet"** (carpincho, coatí, mono, yacaré, tortuga terrestre autóctona, loro hablador sin anillado, etc.). Explicitly excluded — adding any of these to the *owner* portal would normalize illegal possession. The right home for those is a future `wildlife_custody` capability on the org portal (`refugio`).

## Architecture

### File changes

| File | Status | Role |
|---|---|---|
| `components/PetForm.tsx` | modified | Adds local state for sub-species. Renders the conditional second `<select>`. Resolves the final value passed in `formData.species`. |
| `lib/format.ts` | modified | Adds three new cases to `speciesLabel`. |

No DB migration. No new files. No new tests are required beyond the existing PetForm coverage, but the field-resolution branch should get one unit test asserting that selecting `Otra → Conejo` submits `species = "rabbit"`.

### Stored value mapping

| Top select | Sub-select | `formData.species` |
|---|---|---|
| Perro | (n/a) | `dog` |
| Gato | (n/a) | `cat` |
| Otra | Conejo | `rabbit` |
| Otra | Cobayo | `guinea_pig` |
| Otra | Hurón | `ferret` |
| Otra | Otro / no listado | `other` |

The catalog helpers (`vaccinesForSpecies`, etc.) keep their current switches; the three new values simply hit the default branch and return `[]`. This is acceptable for v1.

## Legal framework — pointers for future work

These are intentionally **not** enforced in code yet, but recorded here so that when we move beyond the "everything is a companion animal" assumption we know exactly where to look. None of this changes behavior in this iteration.

### National

- **Ley 22.421 (1981) — Conservación de la Fauna Silvestre.** Defines what counts as fauna silvestre and regulates tenencia, posesión, tránsito, comercio. The spine of the legal regime for everything that isn't a domesticated species. Companion species in this iteration (conejo, cobayo, hurón, perro, gato) are *not* fauna silvestre under this law — no permit needed.
- **Decreto 666/1997** — reglamento of Ley 22.421. Defines criaderos comerciales, zoocriaderos, anillado/marcado, *certificado de origen* and *guía de tránsito*. The mechanism we'd integrate against if we ever add "regulated criadero" species (loro hablador, iguana, boa, tortuga de criadero).
- **Ley 22.344 (1980) — CITES (Convenio de Washington).** Restricts international trade in listed species. Will matter the day we model anything with international provenance.
- **Ley 14.346 (1954) — malos tratos.** Penal protection of all animals. Tangential to species selection but in scope for cruelty-related event types (already covered conceptually).
- **SENASA — Auto-Gestión Mascotas** (`mascotas.senasa.gob.ar`). National sanitary authority. Owns dog/cat import/export and rabies surveillance. The natural integration target for a future Mi Argentina bridge.
- **SENASA — RENSPA.** Productive-animal registry. Llamas, alpacas, equinos, gallinas live here — *not* in the pet registry. Relevant if we ever extend DIM to camelids or equinos.
- **Dirección Nacional de Biodiversidad (Ministerio de Ambiente).** Wildlife authority. CITES national focal point. Counterparty for any future `wildlife_custody` flows.

### Provincial (PPP already enforced)

- **Ciudad Autónoma de Buenos Aires — Ley 4.078** (perros potencialmente peligrosos). Already enforced in `lib/breeds.ts` via `isPotentiallyDangerousBreed`.
- **Provincia de Buenos Aires — Ley 14.107** (PPP provincial). Same.

### Provincial (not yet enforced, future work)

Each province has its own *Ley de Fauna* and fauna authority. Listed here for future reference, not for v1:

- Buenos Aires — Ley 10.081 (Código Rural) + reglamentos sobre fauna.
- Mendoza — Ley 4.602 (Fauna Silvestre).
- Córdoba — Ley 7.343.
- Salta — Ley 5.513.
- Misiones — Ley XVI Nº 28.
- Santa Fe — Ley 4.830.
- (Remaining provinces to be filled in when the wildlife-custody flow is designed.)

### Why the three species we're adding are safe under this framework

- **Conejo doméstico (Oryctolagus cuniculus, forma doméstica)** — domesticated, not fauna silvestre, no permit required, allowed nationally.
- **Cobayo / cuy (Cavia porcellus)** — domesticated for ~3 000 years, not fauna silvestre, allowed nationally.
- **Hurón doméstico (Mustela putorius furo)** — domesticated form, allowed nationally as companion animal (a few municipalities have specific rules but no national prohibition).

All three reuse the dog/cat-shaped owner form without legal friction.

## Service and assistance roles (Ley 26.858)

Orthogonal to species: a dog can carry the legal status of *perro guía* or *perro de asistencia*, which grants its user the right to enter and remain with the dog in any public space, private space of public access, and public transport. This is the only animal-status category in Argentine law that creates an enforceable access right, and it deserves a small block in DIM because the credential page (`/p/[publicToken]`) is the natural surface to display it.

### Legal stack

- **Ley 26.858 (2013) — Derecho de acceso, deambulación y permanencia de personas con discapacidad acompañadas por perro guía o de asistencia.** National. Establishes the access right (Arts. 1–7), sanitary conditions the dog must meet (Art. 8), and sanctions for breaches.
- **Decreto 792/2019** — reglamentario de la Ley 26.858. Designates **ANDIS (Agencia Nacional de Discapacidad)** as autoridad de aplicación. Replaces the earlier Decreto 1.578/2014. Creates the *Comité Técnico de Perros Guía y de Asistencia* dentro de ANDIS.
- **Resolución ANDIS 2588/2022** — crea el **RUPGA (Registro de Usuarias y Usuarios de Perros de Guía o de Asistencia)**. Public registry. Source of truth for credentialed user–dog pairs.
- **Ley 26.378 (2008)** — ratifica la Convención sobre los Derechos de las Personas con Discapacidad (ONU). Anclaje internacional del derecho de acceso (Arts. 9, 20).
- **Ley 24.901 (1997)** — Sistema de Prestaciones Básicas. Define el CUD (Certificado Único de Discapacidad), requerido para inscribirse en el RUPGA.
- **Ley 25.326 — Protección de Datos Personales.** Crítica acá: marcar un perro como "de asistencia" implica revelar discapacidad del titular — dato sensible bajo Art. 7. La visibilidad pública debe ser opt-in.

RUPGA requirements per Art. 8 Ley 26.858 + Decreto 792/2019 + Resolución 2588/2022:

1. DNI del usuario.
2. CUD vigente.
3. Certificado emitido por un Centro de Entrenamiento aprobado por ANDIS — el centro debe ser miembro pleno o temporario de **IGDF (International Guide Dog Federation)** o **ADI (Assistance Dogs International)**.
4. Condiciones higiénico-sanitarias: vacunación al día, antiparasitarios, libreta sanitaria.
5. Identificación electrónica vía microchip bajo norma **ISO 11784/11785**.

ANDIS-recognized categories: **guía** (discapacidad visual), **asistencia motriz**, **alerta médica** (diabetes, epilepsia), **señal** (auditiva), **asistencia TEA** (autismo).

### What DIM models (v1 of this block)

A nullable `service_dog` sub-record on the pet, only allowed when `species = 'dog'`:

| Field | Type | Notes |
|---|---|---|
| `service_type` | enum: `guia` \| `asistencia_motriz` \| `alerta_medica` \| `senal_auditiva` \| `asistencia_tea` \| `otro` | Mirrors ANDIS categories. |
| `credential_status` | enum: `en_entrenamiento` \| `vigente` \| `vencida` \| `revocada` | Drives the banner copy on `/p/[publicToken]`. |
| `rupga_credential` | text (nullable) | ANDIS credential number once issued. |
| `training_center` | text | Free-text + suggested list of ANDIS-approved IGDF/ADI centers. |
| `training_cert_date` | date | When the centro emitted the certificado. |
| `credential_issue_date`, `credential_expiry_date` | date | RUPGA dates. |
| `in_service` | boolean | Active vs. retired. Retired service dogs lose access rights. |
| `public_visibility` | enum: `full_banner` \| `private_only` | Opt-in for the public credential banner. Defaults to `private_only` because PDP. |

The existing `microchip` block on `pets` carries the ISO chip ID — no new column.

### Public credential banner

When `service_dog.credential_status = 'vigente'`, `in_service = true`, and `public_visibility = 'full_banner'`, the public credential page renders a prominent block:

> **Perro de Asistencia — Ley 26.858**
> Esta persona tiene derecho a ingresar, deambular y permanecer con su perro en este establecimiento y en el transporte público. Credencial RUPGA vigente.

This banner is the real product. Owners will show it on their phone when challenged at a door; without it the rest is just data hygiene.

### Notification triggers (reuse existing scheduler)

- Rabies vaccine within 60 days of expiry → "Tu credencial RUPGA depende de mantener al día la vacunación antirrábica (Art. 8, Ley 26.858)."
- `credential_expiry_date` within 90 days → "Renovación de credencial RUPGA en ANDIS."
- Health check overdue → similar copy tied to Art. 8.

Same notification plumbing as PPP reminders; only the copy changes.

### File changes

| File | Status | Role |
|---|---|---|
| `db/schema.ts` | modified | Sibling table `pet_service_dog` keyed on `pet_id`. Sibling rather than columns on `pets` because most pets won't have it. |
| `lib/format.ts` | modified | `serviceTypeLabel()`, `credentialStatusLabel()`. |
| `components/PetForm.tsx` | modified | Collapsed section "¿Es perro de asistencia o guía? (Ley 26.858)" that expands when species = `dog`. |
| `app/p/[publicToken]/page.tsx` | modified | Conditional access-rights banner. |
| Notification scheduler | modified | Add the three triggers above. |

### Adjacent categories — *not* modeled in the owner portal

These come up in conversations about "service animals" but each has a different legal posture, and none belongs in this v1 block:

- **Service cats / service animals other than dogs.** No legal status in Argentina. Ley 26.858 is dog-specific. If a user wants to record a cat as emotionally important, they can use the `observaciones` field — no banner, no credential.
- **Animales de Apoyo Emocional (ESA).** *No tienen reconocimiento legal en Argentina.* Hay proyectos de ley pendientes (3344-D-2024 entre otros) pero ninguno sancionado. Sin derecho de acceso, sin credencial. Si DIM agrega un flag puramente informativo más adelante, debe dejar explícito que **no otorga derechos de acceso** bajo Ley 26.858.
- **TACA / IACA — Terapia Asistida con Animales.** Regulación provincial fragmentaria: Mendoza, Salta, Santa Cruz, Río Negro, Chubut, Tucumán, Santa Fe, Corrientes. CABA tiene el Programa de Intervenciones Asistidas con Animales (IACA). El animal de TACA es propiedad de la *organización terapéutica*, no del paciente. Pertenece a una futura capacidad `therapy_provider` en el portal `org`, no al portal de dueño.
- **Equinoterapia / Hipoterapia.** Leyes provinciales: Santa Cruz Ley 3.547, Misiones Ley XIX-74, además de Salta, Tucumán, Chubut, Río Negro, Santa Fe, Corrientes. Proyectos nacionales pendientes para incorporarla al PMO (Ley 24.901). El caballo pertenece al centro de equinoterapia. Mismo patrón que TACA: pertenece al portal `org`, no al portal de dueño.
- **Animales de fuerzas de seguridad** (caninos de Policía, Gendarmería, PSA, Bomberos, Defensa Civil). Animales de trabajo de instituciones del Estado. Fuera de alcance de DIM por completo.

## Compliance checklist (current state)

Cross-cutting obligations that already apply to DIM today, beyond the species and service-dog frameworks already covered above. Each row notes the current state in the codebase and the concrete gap.

| Marco legal | Qué exige | Estado en DIM hoy | Gap a cerrar |
|---|---|---|---|
| **Ley 25.326 — Protección de Datos Personales** (Hábeas Data) + Disposiciones AAIP | Inscribir el responsable del tratamiento y cada base con datos personales en el Registro Nacional de Bases de Datos vía AAIP (plataforma TAD). Garantizar derechos ARCO (acceso, rectificación, cancelación, oposición). Tratamiento reforzado para datos sensibles (salud, discapacidad — Art. 7). | Prácticas privacy-by-design implícitas. No hay inscripción formal. No hay UI de derechos ARCO. | (1) Inscribir DIM como responsable + las bases personales en AAIP cuando salga a producción. (2) Agregar UI de "Mis datos" con export + eliminación. (3) Marcar internamente el bloque `service_dog` como dato sensible (afecta logging y permisos). |
| **Ley 26.743 — Identidad de Género** | El sistema debe permitir y respetar el nombre y género autopercibidos sin exigir documentación. El DNI puede coexistir como dato registral pero no se usa para la presentación. | Sin verificar; revisar campos de perfil de `profiles`. | Agregar `chosen_name` + `chosen_pronoun` opcionales en `profiles`. Usar `chosen_name` en toda UI (notificaciones, credencial pública del vínculo dueño-mascota, etc.). DNI sólo para integraciones oficiales. |
| **Ley 14.346 — Malos Tratos** | Protección penal de todos los animales. Profesionales (veterinarios, refugios) con deber moral / institucional de denunciar maltrato observado. | Existe `app/denuncias/*` para perdido/encontrado. No hay tipo de denuncia de maltrato. | Agregar tipo de evento `cruelty_report` en el event log y un flujo de denuncia desde `/org/[orgToken]` y `/profesional`. Tier-3 (govt) recibe la denuncia escalada. |
| **CABA Ley 4.078 / Bs As Ley 14.107 — PPP** | Inscripción en registro municipal/provincial, microchip por veterinario habilitado, seguro de responsabilidad civil, bozal y correa en vía pública. | `lib/breeds.ts` detecta razas PPP y dispara notificación. | (1) Hacer `microchip` obligatorio cuando PPP=true. (2) Agregar campo `insurance_policy` (compañía + póliza + vencimiento) en bloque PPP. (3) Cuando un convenio con CABA / Bs As exista, hacer atestación T3 = inscripción municipal/provincial. |
| **Ley 22.421 + Decreto 666/97 — Fauna Silvestre** | No facilitar la tenencia de fauna silvestre como mascota. | Catálogo actual sólo contiene especies domesticadas (perro, gato, conejo, cobayo, hurón). | Compliant. La regla a mantener: cualquier futura especie no domesticada va por bucket de *criadero comercial* o `wildlife_custody`, nunca como mascota libre. |
| **Ley 26.858 + Decreto 792/2019 + Res. ANDIS 2588/2022 — Perros Guía / de Asistencia** | Reconocer la credencial RUPGA; cumplir condiciones higiénico-sanitarias del Art. 8; respetar derecho de acceso. | No modelado todavía. | Implementar el bloque `service_dog` y la banner en `/p/[publicToken]` según se define más arriba en este spec. |
| **Ley 15.465 + Res. MS 2827/2022 — Enfermedades de Notificación Obligatoria** | Notificación de enfermedades infecciosas — Grupos A (inmediata), B, C, D. Incluye zoonosis. La lista vigente está en el Anexo I de la Res. 2827/2022. | `lib/diseases.ts` ya tiene flag `reportable` en cada enfermedad relevante para muerte/diagnóstico. | (1) Auditar el catálogo contra el Anexo I de la Res. 2827/2022. (2) Cuando exista el portal govt, rutear los eventos `reportable=true` al destinatario sanitario correspondiente (SISA / SNVS / autoridad provincial). |
| **Ley 24.240 — Defensa del Consumidor** | Términos claros, transparencia, no prácticas engañosas. | No hay ToS público ni política de privacidad. | Publicar ToS + Política de Privacidad antes de abrir signup público. Ambos deben mencionar Ley 25.326 expresamente. |
| **Ley 25.326 Art. 11 — Cesión de datos** | Cualquier transferencia de datos personales requiere consentimiento informado del titular, salvo excepciones legales. | Compartir con vet / refugio / govt es opt-in vía share tokens. | Asegurar que cada flujo de compartir muestre exactamente qué datos se ceden y registre el consentimiento como evento. |

### Compliance items NOT yet binding but worth anticipating

- **Ley 26.653 — Accesibilidad Web (WCAG 2.0 por Disposición ONTI 6/2019).** Hoy obliga al Estado, sus organismos descentralizados, empresas concesionarias de servicios públicos, contratistas del Estado y organizaciones beneficiarias de subsidios estatales. **No obliga directamente a DIM como proyecto privado**, pero pasa a obligar el día que DIM se integre con Mi Argentina o firme convenio con una autoridad provincial/municipal. Práctica recomendada hoy: apuntar a **WCAG 2.1 AA** desde el principio para no tener deuda técnica cuando ese día llegue.
- **Ley 25.506 — Firma Digital.** Relevante para que las atestaciones de veterinarios y govt tengan validez legal plena. Hoy no es obligatoria, pero diseñar el bloque de atestación de forma que pueda llevar firma digital (firma del veterinario con su CUIT + certificado X.509 de AFIP / ONTI) ahorra trabajo después.
- **Mi Argentina (Decreto 1.063/2016 + sucesivos).** Cuando se concrete la integración, dispara automáticamente: WCAG completo, identidad federada con RENAPER, accesibilidad, transparencia activa (Ley 27.275).

## Pending legislation — watch list

Bills currently in trámite parlamentario o jurisprudencia emergente que cambiarían el panorama si se sancionan. Cada uno se rastrea como una *posible* spec futura, no como trabajo confirmado.

- **Animales de Apoyo Emocional (ESA).** Proyecto **3344-D-2024** (HCDN) y proyectos previos. Si se sanciona, abre un tier intermedio entre owner self-declared y perro guía Ley 26.858. *Impacto en DIM:* nueva categoría en `service_type` (`apoyo_emocional`) con derechos de acceso más limitados que la Ley 26.858. Hasta entonces, no modelar.
- **Ley Nacional de Equinoterapia.** Proyectos **5367-D-2020**, **3932-D-2021**, **0194-D-2020**. Buscan incorporar la equinoterapia al PMO vía Ley 24.901. *Impacto en DIM:* gatilla la implementación de la capacidad `therapy_provider` en el portal org y abre la puerta a equinos como categoría especial.
- **Ley Nacional de TACA / Intervenciones Asistidas con Animales.** Proyecto **6925-D-2024**. Unificaría el patchwork provincial (Mendoza, Salta, Santa Cruz, Río Negro, Chubut, Tucumán, Santa Fe, Corrientes + IACA CABA). *Impacto en DIM:* misma capacidad `therapy_provider`, vocabulario alineado.
- **Ley de Bienestar Animal.** Proyecto **210182** de la Legislatura de Buenos Aires + proyectos nacionales paralelos. Expande Ley 14.346 con un marco moderno de bienestar (cinco libertades, prohibiciones específicas, sanciones administrativas además de penales). *Impacto en DIM:* enriquece el catálogo de tipos de evento de bienestar y de denuncia.
- **DNI Mascota / Registro Nacional de Mascotas.** Múltiples proyectos a lo largo de los años, ninguno sancionado. *Impacto en DIM:* si se crea, DIM podría *ser* ese registro, integrarse, o quedar desplazado. Posicionarse pre-emptivamente alineando vocabulario y estructura con SENASA y ANDIS reduce riesgo de desplazamiento.
- **Personalidad jurídica de animales no humanos.** Declaración de la Provincia de Buenos Aires (2024). Antecedentes jurisprudenciales: *Sandra* (orangutana, CABA 2014), *Cecilia* (chimpancé, Mendoza 2016), fallo Jujuy 2025. Empuja la reforma del Código Civil y Comercial (Art. 227) para sacar a los animales del régimen de cosas. *Impacto en DIM:* refuerza el peso legal de cualquier atestación dueño-mascota, no requiere cambios técnicos inmediatos.
- **Reforma Ley 22.421 — Fauna Silvestre.** Proyectos de modernización pendientes desde hace años. *Impacto en DIM:* afectará el bucket de fauna silvestre bajo custodia que ya está en el roadmap. Hasta que se sancione, mantener Decreto 666/97 como referencia.

## Future work (referenced, not done here)

When we revisit species after this iteration, the larger design that this spec defers is the **three-bucket model**:

1. **Animales de compañía domésticos** (current scope — perro, gato, conejo, cobayo, hurón, plus ave de jaula, pez ornamental, erizo africano, etc.). Owner self-registration, no paperwork.
2. **Animales con criadero comercial habilitado** (loro hablador, iguana, boa de criadero, tortuga de criadero, etc.). Owner registration *plus* required criadero number + ring band, validated against Decreto 666/1997 paperwork model.
3. **Fauna silvestre bajo custodia** (carpincho, coatí, mono, yacaré, ñandú rescatado, etc.). Org-portal only, behind a new `wildlife_custody` capability. Framed as rehabilitation, not pet keeping.

The order in which we'd add catalogs once we start filling them:

1. Vaccines + diseases for conejo (myxomatosis, RHDV2; lepto for rodents).
2. Vaccines + diseases for hurón (distemper, rabies).
3. Aves de jaula (canario, periquito, agapornis, ninfa) — psittacosis is the public-health hook.
4. Tortuga (de agua y de tierra de criadero) — salmonella reservoir.
5. Equinos and camélidos via RENSPA bridge (separate plan).
6. Wildlife custody (`refugio` capability extension).
