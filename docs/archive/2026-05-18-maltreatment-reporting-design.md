# Denuncia de maltrato animal — design spec ⚠️ SUPERSEDED

> ⚠️ **Este spec quedó superseded por la implementación existente** en `welfare_reports` table.
>
> Cuando se escribió esta spec, no se había hecho el lookup del código actual. El lookup posterior (review 2026-05-18) reveló que el non-owner reporting flow **ya está parcialmente implementado** con una arquitectura distinta y a nuestro entender más limpia:
>
> | Spec proponía | Código real (mantenido) |
> |---|---|
> | `maltreatment_reported` event en `pet_events` con auto-creación de pets `status='ghost_subject'` | Tabla separada `welfare_reports` (`db/schema.ts:885-983`) con `subjectKind` enum polimórfico (`registered_pet | unowned_animal | location | general`) |
> | Ghost pets shadow para anclar eventos de animales no registrados | El polimorfismo del enum cubre el caso sin polución de `pets` |
> | Form en `/denuncar/maltrato` con wizard 5 pasos | Form ya existe en `/denuncias/nueva` con `WelfareReportForm.tsx`, 9 kinds, 5 attachments, anonymous-capable |
> | Bridge a pet_events propuesto | Bridge ya implementado en `app/actions/welfare.ts:222-312` para registered_pet subjects (abandonment + maltreatment + symptom) |
>
> **El código real es la fuente de verdad.** Esta spec se conserva solo como referencia histórica del:
> - Análisis comparativo con el form del Ministerio Público Fiscal de CABA (https://denuncias.fiscalias.gob.ar/)
> - Identificación inicial de gaps que se cubrieron parcial o totalmente por el código existente
>
> **Para trabajar en este feature, ver:**
> - **Polish y bugs pendientes:** `docs/superpowers/plans/2026-05-18-welfare-reports-polish.md` 🟢 Ready for CC
> - **Welfare-officer queue** (`/gob/maltrato`): pendiente de spec separado, gap operativo principal
> - **Implementación actual:** código en `app/actions/welfare.ts`, `app/denuncias/nueva/WelfareReportForm.tsx`, schema en `db/schema.ts:885-983`, RLS en `db/welfare_rls.sql`
>
> **NO seguir las decisiones de este doc para implementación nueva** — la arquitectura `ghost_subject` propuesta acá NO debe construirse.

---

> Surface owner-and-witness para reportar maltrato animal en DIM. Cubre el caso donde la víctima ya es una mascota registrada (`pet_id` conocido) **y** el caso donde es un animal no registrado que un vecino ve sufrir (ghost subject auto-creado). Payload alineado con el form de denuncia del Ministerio Público Fiscal de CABA (https://denuncias.fiscalias.gob.ar/es/denuncia/ahora?from=maltrato_animal) para que un futuro export sea mapping directo, pero **estructurado** donde fiscalía deja narrativa libre — sub-tipo de maltrato, condición del animal, count, urgencia. Anchors: Ley Nacional 14.346 (1954). Cierra el hueco "Non-owner reporting flow" listado en `AGENTS.md → Open questions / future work`.
>
> **Fecha:** 2026-05-18
> **Owner:** Ignacio Del Valle
> **Estado:** ⚠️ SUPERSEDED — ver banner arriba
> **Versión:** 1.0 (final, no más iteración)

---

## 1. Por qué este documento existe

`AGENTS.md → Event catalog` define `maltreatment_reported` como **schema-ready, UI deferred**, con payload mínimo `{ reporter_role, description, severity? }`. `AGENTS.md → Open questions` agrega:

> Non-owner reporting flow for `abandonment_reported`, `maltreatment_reported`, `symptom_observed` on unregistered pets — requires schema additions for "report subject = unowned animal" plus moderation. `maltreatment_reported` ultimately wants integration with Ley Nacional 14.346 denuncia pipelines.

Tres huecos a cerrar:

🔴 **El payload mínimo no alcanza para una denuncia real.** Fiscalía pide categoría, lugar, fecha-hora-range, identidad del denunciante (con toggle anónimo), identidad del denunciado (con toggle "no conozco"), adjuntos, narrativa de 5000 chars. Nuestro `{ reporter_role, description, severity? }` queda corto para que un welfare-officer pueda priorizar y un export a fiscalía sea automático.

🔴 **No tenemos path para reportar maltrato sobre un animal no registrado.** El 89% de hogares argentinos no ayuda a animales callejeros (EAH 2018) — pero los que sí ayudan necesitan una vía. Hoy `pet_events.pet_id` es NOT NULL: si la víctima no está en DIM, no podemos registrar nada. Eso colapsa el caso de uso más probable (vecino ve hoarding en el departamento de al lado).

🔴 **No distinguimos UX entre `incident_reported` y `maltreatment_reported`.** Hoy son dos event types separados pero misma payload mental ("le pasó algo malo al animal"). El primero es accidente / agresión animal-vs-animal; el segundo es **delito de un humano contra un animal** (Ley 14.346, art. 1°). Eso cambia copy, disclaimers legales, queue de destino, y export downstream. El usuario tiene que entender en qué pestaña está antes de empezar a tipear.

Este doc cierra los tres huecos: payload v2 enriquecido alineado con fiscalía + sub-tipos animal-específicos, **ghost subject** auto-creado para casos sin pet_id conocido, form owner-and-witness con copy claro que diferencia incident vs maltreatment, queue welfare-officer como surface de destino, y mapping a fiscalía como Fase futura (no bloqueante en v1).

## 2. Decisiones cerradas (no relitigar)

| # | Decisión | Razón |
|---|---|---|
| D1 | **Payload v2 alineado con fiscalía MPF CABA** pero estructurado donde ellos tienen narrativa libre. Cada campo del form fiscalía tiene mapping directo (lugar, hora, denunciante, denunciado, adjuntos). DIM agrega sub-tipo, animal_count, condition, urgent flag | Si algún día auto-generamos el escrito de denuncia, paridad de campos es lo que hace que sea automático. Y la estructura extra es lo que hace útil al welfare officer **hoy**, antes del export |
| D2 | **`pet_id` permanece NOT NULL.** Para reportar maltrato sobre animal no registrado, el server **auto-crea un "ghost subject"** — una row de `pets` con `status='ghost_subject'`, sin `ownerships` row, no listada en ningún portal owner-facing | Mantiene el invariante de "todo evento referencia un pet" sin tabla nueva. Si el animal luego se rescata, la row se "promueve" via `custody_transferred` y queda continuidad histórica del caso |
| D3 | **`status='ghost_subject'` es un nuevo enum value en `pets.status`.** Junto a los existentes `active`, `lost`, `deceased`. NO genera credencial pública navegable; el `/p/{publicToken}` retorna 404 para ghosts | Refleja que el animal existe en el welfare-event log pero no como entidad "viva" con dueño. Si se rescata se flippea a `active` y se le agrega ownership |
| D4 | **`incident_reported` y `maltreatment_reported` son event types separados**, con UX separada al cargar. La diferencia es legal-conceptual, no técnica: incident es daño sin perpetrador humano deliberado; maltratment es delito Ley 14.346 | El usuario tiene que entender qué está reportando. Auto-clasificar acá sería irresponsable — mezclar "lo atropelló un auto" con "el dueño lo golpea" en una sola pila esconde casos serios |
| D5 | **Denuncia anónima permitida.** Toggle "Quiero denunciar anónimamente" oculta `recorded_by_user_id` del **export** a fiscalía y del welfare-officer queue (mostramos "Anónimo"). Pero la row del evento sigue con `recorded_by_user_id` set para auditoría interna | Fiscalía permite anonimato y eso es respetable — el denunciante puede tener miedo legítimo (vecino del agresor). DIM también lo permite pero conserva el rastro interno para detectar abuso del sistema (spam, falsas denuncias) — patrón estándar en sistemas de denuncia |
| D6 | **Denunciante NO autenticado puede reportar.** Server action acepta submissions sin session, con rate-limit por IP y captcha. Si está autenticado, prellenamos su contacto del profile (overridable) | El vecino que está pasando por la calle no se va a crear cuenta DIM antes de reportar al perro encadenado. Y forzarlo significa que el caso no se reporta. La fricción mata el reporte |
| D7 | **El form es wizard de 5 pasos**, con auto-save en localStorage entre pasos. Cada paso es un sub-set del payload | El form completo es largo (mirá la complejidad de fiscalía). Wizard reduce ansiedad del denunciante, especialmente uno emocionalmente alterado. Auto-save evita perder el avance si cierra la pestaña |
| D8 | **Adjuntos hasta 5 archivos × 25 MB** (más generoso que los 3 de fiscalía). Cuando exportemos a fiscalía, mandamos los primeros 3 más importantes | Las pruebas son la columna vertebral de Ley 14.346. Limitar a 3 nos pondría artificial-paridad pero el welfare-officer queue se beneficia de más material. El downsample al exportar es trivial |
| D9 | **Welfare-officer queue es nuevo surface en `/gob/maltrato`** (govt scope-bound), donde caen las denuncias con `requires_urgent_intervention=true` arriba. Multi-localidad según `govt_assignments` (mismo patrón que symptom surveillance) | Esto es justo el tipo de proyección que el North Star promete. Existing patron `/gob` viene del admin page spec |
| D10 | **Export a fiscalía MPF CABA es Fase 3 deferida.** v1 entrega el form + queue welfare-officer + storage. El export con mapping al form de fiscalía (manual al principio: copy-paste asistido; futuro: API si fiscalía abre una) viene después | El valor inmediato no depende del export. El welfare-officer puede actuar (mandar inspectores, alertar policía ambiental, escalar a fundación rescate) sin que fiscalía esté en el loop todavía |
| D11 | **`abandonment_reported` se diseña en paralelo con el mismo patrón** pero scope distinto: abandono es la observación "este perro está en la calle sin dueño aparente desde hace X días" — borderline `shelter_custody` flow del vecino. Maltrato es "alguien le está haciendo daño". Comparten ghost-subject + reporter anónimo, difieren en queue de destino (`/gob/maltrato` vs `/gob/abandono`) y en sub-tipos. Doc spec separada cuando llegue su turno; este spec NO lo cubre | Diseñar los dos juntos arrastra alcance; mejor ship maltrato primero, abandono después con el patrón comprobado |
| D12 | **Severity owner-estimated** (mild/moderate/severe) **se mantiene** pero NO es el driver de la queue. El driver es `requires_urgent_intervention` (boolean explícito) + `animal_condition_at_observation` | Severity es subjetiva y el ratio "todos creen que es severe" se va al techo. El boolean concrete + el dropdown estructurado dan mejor signal. Severity queda como hint adicional, no como ordenamiento |
| D13 | **El reporter puede vincular múltiples animales con el mismo evento** vía `animal_count?: number`, pero **un solo `pet_id`** referenciado (el principal o el primero descrito). Si los animales están registrados individualmente, el reporter puede submitir múltiples eventos | Hoarding casos son "vi 15 perros". Pedirle al reporter que cargue 15 eventos sería absurdo. `animal_count` con descripción libre cubre. Cuando welfare-officer interviene físicamente, los rescatados generan sus propios `pets` rows con vinculación de vuelta al caso original via payload |
| D14 | **Moderación: auto-flag de denuncias para revisión antes de aparecer en la queue.** Reglas: reporter no autenticado AND no adjuntos AND descripción <100 chars → `requires_moderation=true`. Welfare-officer ve queue normal + queue de moderación separada | El sistema de denuncia es abusable (vengar al vecino con denuncias falsas). Filtro mínimo arriba; el welfare-officer marca como spam para entrenar el filtro. Sin spam buster en v1, manual |
| D15 | **Geolocalización: lat/lng del evento + dirección humana del incidente.** El campo de dirección usa el patrón bidirectional-geocoding del spec del 2026-05-17 (text ↔ map pin via Nominatim). Toggle "no conozco la ubicación exacta" → permite jurisdicción-only | Lat/lng + texto + opción "no sé" = paridad con fiscalía + utilidad para mapas de welfare. El patrón ya existe en otro spec, lo reusamos |

## 3. Glosario

| Término | Qué es |
|---|---|
| **Denuncia** | Evento de tipo `maltreatment_reported`. Cubre todo el caso: el qué, dónde, cuándo, quién reporta, contra quién (si se sabe), pruebas |
| **Ghost subject** | Row de `pets` con `status='ghost_subject'`, sin ownership, creada por el server cuando el reporter no tiene un pet_id conocido. Vive como ancla del evento welfare |
| **Reporter** | Quien carga la denuncia. Puede estar autenticado o no. Puede ser owner del pet (si conocido), witness (vecino), o authority (vet, govt) |
| **Accused** | Persona física o jurídica denunciada. Opcional ("no conozco") |
| **Welfare officer queue** | `/gob/maltrato`, scope-bound a localidad de `govt_assignments`. Triage + asignación + seguimiento |
| **Export a fiscalía** | Generación del escrito que un humano (welfare-officer o el denunciante) presenta en el form de MPF CABA o equivalente provincial. **No** auto-submission en v1 |
| **`requires_urgent_intervention`** | Boolean explícito del reporter o del welfare-officer triaging. Drive del orden de la queue |

## 4. Domain model

### 4.1 Lo que ya existe (no se toca)

- `pets` con `status`, jurisdicción, identidad básica
- `pet_events` con polimorfismo de autoría, location_lat/lng, payload jsonb, attachments via `attachments` table
- `attachments` table linkable a `event_id`
- `EVENT_TYPES` incluye `maltreatment_reported` (texto, sin migración para variantes)
- `notifications` con severity y related_event_id
- `bidirectional-geocoding` patrón (text ↔ map pin via Nominatim/OSM proxy) — spec del 2026-05-17, ready for CC

### 4.2 Lo nuevo — ghost subject en `pets`

**Nuevo valor del enum `pet_status`:**

```sql
alter type pet_status add value 'ghost_subject';
```

Migración chica. Comportamiento downstream:

- `pets` con `status='ghost_subject'` **NUNCA** aparecen en:
  - `/mis-mascotas` (filter `status != 'ghost_subject'`)
  - `/adoptar` (filter ya incluido — viene de la WHERE del listing)
  - `/p/{publicToken}` Tier 0 (server retorna 404)
- Ghost subjects **SÍ** aparecen en:
  - `/gob/maltrato` queue (al recurso central — el ghost-subject ES el animal de la denuncia)
  - Proyecciones welfare-officer geográficas (mapa de animales en distress en jurisdicción)
- Ghost subjects **NO** tienen `ownerships` rows. Constraint trigger: `INSERT INTO ownerships` rechaza si `pet.status='ghost_subject'` con errcode='restrict_violation' y mensaje Spanish claro.
- Si un ghost subject es rescatado, el flow es `shelter_intake_recorded` event + `INSERT ownerships(role='shelter_custody')` + flip `pets.status='active'`. El log de eventos welfare permanece y referencia el mismo `pet_id`. Continuidad total.

### 4.3 Lo nuevo — payload v2 de `maltreatment_reported`

Vive en `lib/event-schemas.ts` (Zod, ya existente patrón):

```ts
const maltreatmentReported = z.object(
  withVersion({
    // ── Categoría ──────────────────────────────────────────────────────
    maltreatment_type: z.enum([
      "physical_abuse",            // golpes, tortura, mutilación
      "neglect",                   // negligencia general
      "abandonment",               // dejar al animal sin cuidado y partir
      "hoarding",                  // acumulación de animales en malas condiciones
      "dogfighting",               // peleas organizadas
      "food_water_deprivation",    // privación específica
      "inadequate_shelter",        // exposición climática, encierro inadecuado
      "tethering_chronic",         // encadenamiento permanente
      "commercial_breeding_abuse", // criaderos ilegales con malas condiciones
      "other",
    ]),
    maltreatment_type_other_detail: z.string().nullable().optional(),

    // ── Reporter ───────────────────────────────────────────────────────
    reporter_role: z.enum(["owner", "witness", "authority"]),
    reporter_contact: z
      .object({
        full_name: z.string().nullable(),
        dni: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().email().nullable(),
      })
      .nullable(),
    is_anonymous_to_authorities: z.boolean().default(false),

    // ── Accused (todo opcional, toggle "no conozco" lo deja null) ────
    accused: z
      .object({
        kind: z.enum(["physical", "legal"]),
        full_name: z.string().nullable(),
        dni_or_cuit: z.string().nullable(),
        address: z.string().nullable(),
        nationality: z.string().nullable().default("AR"),
        relationship_to_animal: z.enum([
          "owner",
          "neighbor",
          "caretaker",
          "unknown",
          "other",
        ]).nullable(),
      })
      .nullable(),

    // ── Tiempo (occurred_at vive en el event row; ESTE es el end) ────
    occurred_at_end: z.string().datetime().nullable(),
    time_unknown: z.boolean().default(false),

    // ── Ubicación (lat/lng en event row; ESTE es el human-readable) ──
    incident_location: z
      .object({
        street_address: z.string().nullable(),
        locality: z.string().nullable(),
        province: z.string().nullable(),
        location_note: z.string().nullable(),
      })
      .nullable(),
    location_unknown: z.boolean().default(false),

    // ── Animales involucrados ──────────────────────────────────────────
    animal_count: z.number().int().positive().nullable(),
    animal_condition_at_observation: z
      .enum([
        "apparently_healthy",
        "visibly_injured",
        "malnourished",
        "in_acute_distress",
        "unable_to_assess",
        "deceased",
      ])
      .nullable(),
    requires_urgent_intervention: z.boolean().default(false),

    // ── Narrativa (REQUERIDA) ──────────────────────────────────────────
    description: z.string().min(20).max(5000),

    // ── Severidad estimada por reporter (no driver de queue) ─────────
    severity: z.enum(["mild", "moderate", "severe"]).nullable(),

    // ── Subject linkage para ghost subjects ─────────────────────────
    // Si pet_events.pet_id apunta a un ghost subject, este flag es true.
    // El form fija ghost_subject_data al crear; downstream usa este flag
    // como shortcut para "este evento tiene un pet stub asociado".
    has_ghost_subject: z.boolean().default(false),

    // ── Moderation (auto-fill por el server, no por el reporter) ─────
    requires_moderation: z.boolean().default(false),
    moderation_reason: z.string().nullable(),
  }),
).strict();
```

Validaciones cruzadas (zod `.refine`):

- `maltreatment_type='other'` ⟹ `maltreatment_type_other_detail` requerido
- `is_anonymous_to_authorities=false` AND `reporter_role !== 'authority'` ⟹ al menos uno de `reporter_contact.{phone, email}` requerido
- `time_unknown=false` ⟹ `event.occurred_at` requerido
- `location_unknown=false` ⟹ `event.location_lat/lng` O `incident_location.{street_address, locality}` requerido

### 4.4 Nuevo `notification_type` values (TEXT, sin migración — solo doc)

- `maltreatment_report_received_welfare` → al welfare-officer (govt) cuyo `govt_assignments` cubre la jurisdicción
- `maltreatment_report_followup_reporter` → al reporter autenticado cuando el welfare-officer cambia el estado del caso
- `maltreatment_report_moderation_needed_admin` → al admin cuando una denuncia entra a la queue de moderación

### 4.5 Nuevo helper `lib/welfare-routing.ts`

```ts
export async function routeMaltreatmentReportToAuthorities(
  tx: Tx,
  event: PetEvent,
  payload: MaltreatmentReportedPayload,
): Promise<void> {
  // Routing por jurisdicción del evento (no del reporter):
  //   1. Si event.location_lat/lng presente → reverse-geocode → province/locality
  //   2. Else si payload.incident_location.{province, locality} → usar
  //   3. Else si payload.location_unknown → ghost_pet.jurisdiction_*
  //   4. Else: fallback admin queue
  //
  // Insertar notifications a govt users con `govt_assignments` matcheando.
  // Si no hay govt en scope → admin fallback (mismo patrón que symptom
  // surveillance pre-Fase 0 del admin page).
}
```

Reusa `findAuthoritiesForJurisdiction` del symptom-disease-surveillance feature ya implementado.

## 5. Form UX — wizard 5 pasos

Ruta: `/denunciar/maltrato` (pública, no auth-gated). Si está autenticado, prellenamos. Si no, el form acepta igual.

**Disclaimer permanente top de pantalla** (sticky bar):

> ⚠️ Esto es una denuncia de **maltrato animal** (Ley Nacional 14.346). Si lo que viste fue un accidente o pelea entre animales sin un humano agresor, usá [el reporte de incidentes](/eventos/nuevo/incidente).

### 5.1 Paso 1 — ¿Qué tipo de maltrato?

```
Seleccioná lo que mejor describe la situación:

( ) Abuso físico (golpes, tortura, mutilación)
( ) Negligencia (sin cuidado básico — comida, agua, higiene, atención veterinaria)
( ) Abandono (el dueño se fue y dejó al animal)
( ) Acumulación (muchos animales en condiciones inadecuadas — hoarding)
( ) Peleas (peleas organizadas o entrenamiento para pelear)
( ) Privación de alimento / agua
( ) Refugio inadecuado (exposición al clima, encierro extremo)
( ) Encadenamiento crónico (atado permanentemente)
( ) Criadero ilegal en malas condiciones
( ) Otro: [textarea corto]

[Siguiente →]
```

Multi-select **no** — uno solo, el principal. Si hay dos, dos denuncias.

### 5.2 Paso 2 — ¿Cuándo y dónde?

```
[ ] No conozco la fecha ni la hora del hecho

Fecha del hecho: [date picker]
Hora aproximada de inicio: [time picker, 15-min granularity]
Hora aproximada de fin (si aplica): [time picker]

[ ] No conozco la ubicación exacta

Dirección: [LocationFields mode="point" — text + map pin, bidirectional]
Nota sobre la ubicación: [textarea, opcional]
  ej: "puerta del fondo del galpón abandonado", "patio interno"
```

Usa el componente `LocationFields` que viene del spec bidirectional-geocoding (mismo entry point que `MarkLostForm`).

### 5.3 Paso 3 — ¿De qué animal/animales hablamos?

Branch A: **autenticado, tiene mascotas registradas**

```
( ) Es una de mis mascotas
    [Select: lista de mis mascotas con foto]
( ) Es otra mascota registrada en DIM
    [Buscar por public_token o nombre]
( ) Es un animal no registrado en DIM
```

Branch B: **no autenticado o sin mascotas**

```
Solo "Es un animal no registrado en DIM" disponible.
```

Cuando elige "no registrada" → ghost subject form:

```
¿Cuántos animales están en esta situación?
[ ] Uno solo
[ ] Pocos (2-5)
[ ] Varios (6-15)
[ ] Muchos (15+)
[ ] No estoy seguro

Para el animal principal (o el más representativo):

Especie: [perro / gato / conejo / otro: ___]
Color y marcas distintivas: [textarea]
  ej: "perro marrón mediano con una pata blanca"
Condición que observaste:
( ) Aparentemente sano
( ) Con heridas visibles
( ) Desnutrido / muy flaco
( ) En distress agudo (no se mueve / temblando / etc)
( ) No puedo evaluar
( ) Está muerto

[ ] Necesita intervención URGENTE (el animal puede morir si no actúa alguien hoy)
```

### 5.4 Paso 4 — ¿Quién es el denunciado?

```
[ ] No conozco los datos del denunciado

Si conocés algunos datos:

Tipo: ( ) Persona física  ( ) Empresa / institución (criadero, refugio, etc.)
Nombre completo: [text]
DNI o CUIT: [text]
Dirección: [text]
Relación con el animal:
( ) Es el dueño
( ) Es vecino del lugar
( ) Es cuidador / paseador
( ) No sé
( ) Otra
```

Todo opcional. Sin un dato es OK, el toggle "no conozco" pasa al siguiente.

### 5.5 Paso 5 — Tu identidad + adjuntos + narrativa

```
[ ] Quiero denunciar anónimamente
    (Si tildás esto, no vamos a compartir tu identidad con las
     autoridades. DIM guarda quién cargó la denuncia solo para
     prevenir abuso del sistema.)

Si NO anónima — datos del denunciante:

  (Si está autenticado): "Vas a denunciar como {profile.displayName}.
    Email: {email}. ¿Querés agregar teléfono?"

  (Si no autenticado):
    Nombre y apellido: [text, requerido]
    Email: [email, requerido]
    Teléfono: [tel, opcional]
    DNI: [text, opcional pero recomendado]

Adjuntos: hasta 5 archivos, 25 MB cada uno.
  [Drag-and-drop zone]
  Tipos: fotos, videos, audios, capturas de pantalla, PDFs.

Contanos qué pasó: [textarea 5000 chars, REQUERIDA, mínimo 20 chars]
  Placeholder: "Describí con todo el detalle que tengas: qué viste,
  cuándo empezó, si lo viste más de una vez, qué hicieron las personas
  involucradas. No borres chats ni capturas que tengas — son pruebas."

[Enviar denuncia]
```

Submit → server action `submitMaltreatmentReportAction` (§6).

### 5.6 Auto-save

`localStorage[`denuncia_maltrato_draft`]` con el state del wizard. TTL 7 días. Cuando vuelve, banner "Tenías una denuncia a medias del {date}. ¿La seguís?" con botón "Retomar" / "Descartar". Sin sync server.

## 6. Server action `submitMaltreatmentReportAction`

```ts
async function submitMaltreatmentReportAction(input: FormInput) {
  // 1. Validate input via Zod (the maltreatmentReported schema)
  const parsed = maltreatmentReportedSchema.parse(input);

  // 2. Rate-limit if not authenticated:
  //    max 3 reports per IP per day. Captcha on first submission per IP.
  if (!session) {
    await enforceRateLimit("maltreatment_report", req.ip);
    await verifyCaptcha(input.captchaToken);
  }

  return await db.transaction(async (tx) => {
    // 3. Resolve pet_id:
    let petId: string;
    let hasGhostSubject = false;

    if (input.subject_kind === "own_pet" || input.subject_kind === "other_dim_pet") {
      petId = await resolvePetByToken(tx, input.pet_token);
    } else {
      // 'unregistered_animal' → ghost subject
      petId = await createGhostSubject(tx, {
        species: input.ghost_species,
        color: input.ghost_color_marks,
        distinguishing_features: input.ghost_color_marks,
        jurisdiction_country: "AR",
        jurisdiction_province: input.incident_location?.province ?? null,
        jurisdiction_locality: input.incident_location?.locality ?? null,
      });
      hasGhostSubject = true;
    }

    // 4. Determine moderation flag:
    const requiresModeration =
      !session
      && input.attachments.length === 0
      && input.description.length < 100;

    // 5. Insert pet_events:
    const eventId = await tx.insert(petEvents).values({
      petId,
      eventType: "maltreatment_reported",
      occurredAt: input.time_unknown ? null : input.occurred_at,
      recordedAt: now(),
      recordedByUserId: session?.user.id ?? null,
      authorRole: input.reporter_role,
      authorOrganizationId: null,
      authorVerified: false,
      locationLat: input.location_lat,
      locationLng: input.location_lng,
      payload: {
        ...parsed,
        has_ghost_subject: hasGhostSubject,
        requires_moderation: requiresModeration,
        moderation_reason: requiresModeration ? "anonymous_no_attachments_short_description" : null,
      },
    }).returning({ id: petEvents.id });

    // 6. Insert attachments
    for (const file of input.attachments) {
      await tx.insert(attachments).values({
        eventId,
        uploadedByUserId: session?.user.id ?? null,
        storagePath: file.path,
        mimeType: file.mimeType,
        fileSize: file.size,
        caption: null,
      });
    }

    // 7. Route to welfare-officer queue (unless moderation):
    if (!requiresModeration) {
      await routeMaltreatmentReportToAuthorities(tx, event, parsed);
    } else {
      await notifyAdminsForModeration(tx, eventId, parsed.moderation_reason!);
    }

    // 8. Notify reporter (if authenticated) of submission confirmation:
    if (session) {
      await tx.insert(notifications).values({
        userId: session.user.id,
        notificationType: "maltreatment_report_submitted",
        severity: "info",
        title: "Denuncia enviada",
        body: requiresModeration
          ? "Tu denuncia fue recibida y está siendo revisada antes de ser derivada a la autoridad correspondiente."
          : "Tu denuncia fue enviada a la autoridad de protección animal de tu jurisdicción.",
        relatedEventId: eventId,
      });
    }

    return { ok: true, eventId };
  });
}
```

## 7. Welfare-officer queue — `/gob/maltrato`

Route govt scope-bound (parte del `/gob` portal, requiere `account_type='institutional'` + `role='govt'` + `govt_assignments` rows). Si no hay govt asignado a la localidad de un evento, fallback `/admin/maltrato`.

### 7.1 Sections

1. **Header con stats**: "23 denuncias activas · 4 urgentes · 6 pendientes de triage" en mi/s localidad/es asignada/s.
2. **Filter bar**: tipo de maltrato, condición del animal, urgent only, has-accused, has-attachments, jurisdicción específica.
3. **Lista ordenada**: por defecto `requires_urgent_intervention DESC, occurred_at DESC`.
4. **Detail view** (sub-ruta `/gob/maltrato/{eventId}`):
   - Resumen estructurado (todos los campos del payload)
   - Mapa con lat/lng (si está)
   - Galería de adjuntos
   - Pet info (real o ghost)
   - History de cambios de estado del caso (cada cambio es un `note_added` event con category)
   - Acciones: marcar como "en investigación", "elevada a fiscalía", "intervención realizada", "cerrada — no procedente", "cerrada — resuelta"

### 7.2 Estado del caso

No agrego columna `case_status` a pet_events. **Patrón eventos**: cada cambio de estado es un `note_added` con category específica:

- `note_added.category='maltreatment_case_triaged'` — primera revisión
- `note_added.category='maltreatment_case_under_investigation'`
- `note_added.category='maltreatment_case_escalated_to_fiscalia'`
- `note_added.category='maltreatment_case_intervention_completed'`
- `note_added.category='maltreatment_case_closed_unfounded'`
- `note_added.category='maltreatment_case_closed_resolved'`

El "estado actual" es una proyección sobre estos notes (último wins). UI lo cachea pero la fuente es el log.

### 7.3 Moderation queue separada — `/admin/maltrato/moderacion`

Eventos con `payload.requires_moderation=true` aparecen ahí. Admin revisa, decide:
- **Aprobar** → flippea `requires_moderation=false` (via un nuevo `note_added` con category `maltreatment_moderation_approved`) y dispara el routing a govt
- **Rechazar como spam** → marca con `note_added.category='maltreatment_moderation_rejected'` con reason. El evento queda en el log pero no se rutea.

## 8. Export a fiscalía MPF CABA — Fase 3 deferida

v1 NO incluye export automático. Lo que SÍ incluye v1: un botón "Generar texto para fiscalía" en el detail view de welfare-officer que produce un .txt o .pdf con el formato del relato esperado, listo para copy-paste en el form de fiscalías o adjuntar como anexo.

Generador (server-side, template):

```
Denuncia por maltrato animal — Ley Nacional 14.346
═════════════════════════════════════════════════

CATEGORÍA: {maltreatment_type_label}
JURISDICCIÓN: {province}, {locality}
FECHA Y HORA DEL HECHO: {occurred_at} (aprox.)
{si time_unknown}: La fecha y hora exactas no son conocidas.
LUGAR: {incident_location.street_address}, {locality}
{si location_note}: Detalle: {location_note}

CONDICIÓN DEL ANIMAL AL MOMENTO DE LA DENUNCIA:
{animal_condition_label}
Cantidad de animales involucrados: {animal_count o "No determinado"}

DENUNCIANTE:
{si is_anonymous_to_authorities}: Denuncia anónima.
{si no}: {full_name}, DNI {dni}, contacto: {phone or email}

DENUNCIADO:
{si accused null}: No se conocen los datos del denunciado.
{si no}: {kind_label} {full_name}, DNI/CUIT {dni_or_cuit}, dirección {address}
        Relación con el animal: {relationship_to_animal_label}

RELATO:
{description}

ANEXOS:
Se adjuntan {count} archivos como prueba (ver carpeta adjunta o entregados aparte).

═════════════════════════════════════════════════
Documento generado por MiMAR (Documento de Identificación para
Mascotas — DIM) el {generated_at}. Caso DIM #{event_id_short}.
```

Fase 3 podría agregar:
- PDF formal con header del Ministerio Público (si acuerdo institucional)
- Auto-submission via API si MPF abre una
- Mapping al "Tipo de documento", "Identidad de género", etc. del form fiscalía (campos que DIM no captura pero podría preguntar opcionalmente)

## 9. End-to-end happy path

```
T+0    Vecina en Belgrano ve perro encadenado al sol sin agua hace dos días.
       Abre /denunciar/maltrato desde su celular.

T+0    Paso 1: "Negligencia"
T+1m   Paso 2: "Hoy, aprox 11am-13pm. Calle Cabildo 2500."
       LocationFields auto-resolve lat/lng con Nominatim.
T+3m   Paso 3: "Animal no registrado".
       Especie: perro. Color: marrón mediano cola corta.
       Condición: "desnutrido / muy flaco".
       ✓ Necesita intervención URGENTE.
T+5m   Paso 4: "No conozco los datos del denunciado".
       Aporta: "El portero del edificio 2502 podría saber quién es el dueño."
T+8m   Paso 5:
       ☐ NO anónimo. Nombre, email, teléfono.
       Adjunta: 2 fotos del perro + 1 video de 15 segundos (~12 MB total).
       Narrativa: "Hace dos días que paso por este lugar y veo al
       perro atado al árbol, sin agua, sin sombra. Hoy lo escuché
       lloriquear. Las fotos lo muestran. El video es de hace 5 minutos
       cuando volví. Es urgente."
       Submit.

T+8m   submitMaltreatmentReportAction:
       · Crea ghost subject pet (status='ghost_subject', species='perro',
         color='marrón mediano cola corta', jurisdiction Belgrano CABA)
       · Inserta pet_events maltreatment_reported con payload v2 completo
       · Inserta 3 attachments
       · routeMaltreatmentReportToAuthorities → busca govt assignados a
         CABA · Belgrano → 1 match → notifica a la welfare officer
       · Inserta notification "Denuncia enviada" para la reporter
         (autenticada para este caso, opted in al email)

T+8.5m Welfare officer recibe push/email. Abre /gob/maltrato.
       Ve la denuncia en top del queue (requires_urgent=true).
       Click → detail view. Lee, mira fotos, mira video, mira mapa.

T+15m  Welfare officer agrega note_added category='maltreatment_case_triaged'
       y category='maltreatment_case_under_investigation'. Crea task
       (offline) de despachar inspector a Cabildo 2500.

T+2h   Inspector va, encuentra al perro, le ofrece agua, contacta al
       dueño (que vive en el edificio 2502), entrega cédula con
       intimación administrativa. Saca al perro del sol.

T+1d   Welfare officer entra detail view del caso. Agrega
       note_added category='maltreatment_case_intervention_completed'
       con resumen de la acción tomada. Notification a la reporter:
       "Tu denuncia generó intervención. El animal fue asistido."

T+30d  Welfare officer evalúa si escala a fiscalía o cierra.
       Si escala: usa el botón "Generar texto para fiscalía" → .txt
       descargable → lo lleva (junto con adjuntos) al MPF.
       note_added category='maltreatment_case_escalated_to_fiscalia'.
       Si cierra: note_added category='maltreatment_case_closed_resolved'.
```

## 10. Edge cases

- **Reporter spammea 10 denuncias en 5 minutos.** Rate-limit (D6) lo bloquea. Las que sí pasaron entran a moderation queue automáticamente (D14).
- **Reporter denuncia a su ex pareja con datos falsos.** No es prevenible automáticamente. La moderation queue + el welfare-officer investigando dan dos filtros. Si se descubre falsa, `maltreatment_case_closed_unfounded` y la reporter recibe notif explicando — y si reincide, el admin puede banear la cuenta (mecanismo banear-cuenta no en scope v1, sí en admin page).
- **Reporter anónimo pero está logueado.** Toggle "anónimo" set true en payload. La row de event sí tiene `recorded_by_user_id` para auditoría interna pero el welfare-officer ve "Reporter: anónimo". Si el welfare-officer **DEBE** contactar al reporter (e.g., audiencia), un admin puede romper el anonimato bajo demanda judicial — flow no implementado v1, documentado como "Reserved for legal compelled disclosure".
- **Múltiples denuncias del mismo hoarding por distintos vecinos.** Cada una es su propio evento. El welfare-officer ve la cluster en `/gob/maltrato` (mismo locality + similar payload). Linkado manualmente en v1 (`note_added.category='related_to_event'` con event_id). De-dup automático fuera de scope.
- **Reporter no autenticado quiere recibir update.** Sin user_id no hay notification target. Solución: si dejó email, mandamos un email transaccional (1 inicial: "denuncia recibida"). Updates posteriores requieren cuenta. v1 simplificado: solo el email inicial; updates por email se deferran.
- **Ghost subject que después se rescata.** Welfare-officer triggea intake flow (Flow 1 de org-portal-event-flows.md) usando el `pet_id` del ghost. El intake action detecta `status='ghost_subject'` y, en lugar de crear nuevo pet, **upgradea**: flippea status a `active`, completa identidad faltante, crea ownership row, registra `shelter_intake_recorded` event con `previous_status='ghost_subject'` en payload. El log de eventos welfare anterior queda colgado del mismo pet — continuidad total.
- **Reporter borra mientras está cargando.** localStorage tiene la mitad — banner "tenías una denuncia a medias" lo retoma. Si el browser se cierra sin localStorage (incognito), el draft se pierde — aceptable.
- **Reporter sube archivo malicioso.** Validamos mime types al upload (whitelist: image/*, video/*, audio/*, application/pdf) y storage scan downstream (Supabase Storage tiene policies). EXIF de fotos se preserva (la metadata puede ser prueba).
- **Animal está deceased y la denuncia es por la muerte.** `animal_condition_at_observation='deceased'`. El evento maltreatment_reported va igual. Si el animal estaba registrado en DIM, **NO** flippea status del pet a `deceased` automáticamente (eso es un `death_recorded` event, otro path). Welfare-officer triage decide si abre death_recorded como evento separado.
- **Welfare-officer no existe en la jurisdicción del incidente** (CABA con govt cargado OK, pero un caso en interior provincia sin govt asignado). Routing fallback a admin (`/admin/maltrato`). Admin recibe queue y puede actuar igual.

## 11. RLS y security

| Surface | Lee | Escribe |
|---|---|---|
| `/denunciar/maltrato` form | Página pública, server component | Server action `submitMaltreatmentReportAction` — accepta anon, rate-limited |
| `/gob/maltrato` queue | Authenticated govt user, scope-bound. RLS sobre `pet_events` para SELECT donde `event_type='maltreatment_reported'` AND jurisdicción del evento ∈ scope del govt | Server action `addCaseNoteAction` para cambiar estado (insert `note_added` con category) |
| `/admin/maltrato` y `/admin/maltrato/moderacion` | Admin, scope universal | Idem |
| Ghost subject pet | Server-side queries via Drizzle (bypass RLS); no surface owner-facing | `createGhostSubject` solo desde `submitMaltreatmentReportAction` |
| Attachments | Welfare-officer + admin + reporter (si auth) | Reporter only on submit |

**PII del reporter:**
- Si `is_anonymous_to_authorities=true`: el welfare-officer ve "Anónimo" en el queue. La row del evento conserva `recorded_by_user_id` para audit interno. Solo admins con cap `read_anonymized_reporter` (NEW) pueden quebrar — documentado en audit_log inmediato.
- Si false: welfare-officer ve email/phone/nombre.

**Disclosure al denunciado:**
- El denunciado NUNCA recibe notificación de DIM. Si fiscalía/justicia procede, la notificación al denunciado es responsabilidad del proceso judicial, no de DIM.

**Captcha y rate-limit:**
- Anonymous: 3 reports per IP per día, captcha mandatorio.
- Authenticated: 10 reports per user per día, sin captcha.
- Si excede: 429 con mensaje claro.

## 12. Phasing

**Fase 1 — Schema foundation (1 PR).**
- Migración `pet_status` add value `'ghost_subject'`
- Trigger sobre `ownerships` rejecting INSERTs con pet.status='ghost_subject'
- Filtros en `/mis-mascotas`, `/adoptar` query, `/p/[publicToken]` para excluir ghost subjects
- Extender Zod `lib/event-schemas.ts` con `maltreatmentReportedSchema` v2 (reemplaza el placeholder existente)
- `notification_type` nuevos valores (doc only)
- Tests: ghost subject no aparece en surfaces owner-facing; ownership reject works

**Fase 2 — Form + server action + ghost subject creation (1-2 PRs).**
- `app/(public)/denunciar/maltrato/page.tsx` con wizard 5 pasos
- LocationFields del bidirectional-geocoding (asume Fase 2 spec implementada)
- localStorage auto-save
- Captcha integration (e.g., hCaptcha) para anon
- Server action `submitMaltreatmentReportAction` con todo el flujo
- `createGhostSubject` helper
- `routeMaltreatmentReportToAuthorities` helper (reusa `findAuthoritiesForJurisdiction`)
- Confirmation page post-submit
- E2E mínimo: anon submit con ghost subject, auth submit con pet conocido

**Fase 3 — Welfare-officer queue `/gob/maltrato` (1-2 PRs).**
- `app/(gob)/gob/maltrato/page.tsx` (queue) y `/gob/maltrato/[eventId]/page.tsx` (detail)
- `addCaseNoteAction` para cambios de estado (note_added events con category)
- Fallback `/admin/maltrato` para casos sin govt-en-scope
- Galería de adjuntos en detail
- Mapa con lat/lng (MapLibre, ya en stack)
- Tests del queue ordering, filters, scope-binding

**Fase 4 — Moderation queue (1 PR).**
- `/admin/maltrato/moderacion` con la lista de eventos con `requires_moderation=true`
- Acciones approve/reject
- Notifications al admin cuando entra algo nuevo a moderation
- Audit log de cada decisión

**Fase 5 — Generador de texto para fiscalía (1 PR).**
- Botón "Generar texto para fiscalía" en detail view
- Template + datos del payload → `.txt` o `.pdf` descargable
- Sin auto-submission

**Fase 6 — Polish (opcional, post-feedback).**
- Email transaccional a reporters anónimos con email (post-submit confirmación)
- Dedup de denuncias clustered (manual link via note_added category)
- "Mis denuncias" page para reporters autenticados (`/mis-mascotas/denuncias`)
- Push notification cuando el welfare-officer cambia estado

Total: ~6-8 PRs chicos, ~2 semanas. La Fase 1 destraba todo; Fase 2 es la mayor.

## 13. Cross-cutting touches a otros docs

- **`AGENTS.md` Event catalog** — actualizar el bullet de `maltreatment_reported` para reflejar el payload v2. Una sola edición.
- **`AGENTS.md` Data model · `Pet`** — agregar `ghost_subject` al enum `status`.
- **`AGENTS.md` Open questions** — marcar el item "Non-owner reporting flow for `abandonment_reported`, `maltreatment_reported`..." como "parcialmente cubierto por specs/2026-05-18-maltreatment-reporting-design.md (maltrato). Abandono pendiente."
- **`docs/superpowers/README.md`** — agregar la spec al índice.
- **`docs/legal-framework-full.md`** — agregar referencia a Ley 14.346 implementation status.
- **`lib/event-schemas.ts`** — reemplazar el placeholder de `maltreatment_reported` con el schema v2.

## 14. Lo que NO está en este diseño

- **Spec de `abandonment_reported`.** Mismo patrón (ghost subject, anonymous, queue). Se hace después con el patrón probado. D11.
- **Spec de `symptom_observed` non-owner reporting.** Symptom-disease-surveillance ya está implementado pero solo para pets registrados; el non-owner reporting sobre callejeros es feature aparte.
- **Auto-submission a fiscalía via API.** Fase 3 = generador de texto, no submission. API integration cuando exista convenio institucional.
- **Multi-locality cluster detection** (el mismo hoarding reportado por 5 vecinos en 3 días → auto-link). Manual en v1, automatizable post-feedback.
- **Public-facing report tracker** ("ver estado de mi denuncia anónima con código X"). Riesgo de leak; preferimos email transaccional para auth + sin tracker para anon.
- **Banear cuenta por denuncias falsas reincidentes.** Mecanismo en admin page spec, no acá.
- **OCR / vision sobre adjuntos** para extraer evidencia automática. Out of scope, post-v1.
- **Compensación / fondo de welfare al reporter.** Out of scope.
- **WhatsApp / Twilio bot para denuncia.** Surface más accesible — feature futuro, North Star compat (social media is the dominant channel — EAH 2018).
- **Re-identificación judicial del anónimo automática.** Reservado para legal compelled disclosure manual con audit.
- **Integration con Mascotas CABA / GCBA welfare team directly.** El `/gob` portal es genérico; convenios institucionales caso por caso.
- **Push notifications a inspectores externos** (policía ambiental, ONG locales). v1 cierra en welfare-officer; expansión a otros actores institucionales después.

---

## Próximo paso

Cuando este diseño tenga OK final, partimos en planes. Fase 1 desbloquea todo y es chica (1 PR de schema + filters). Fase 2 es el grueso del valor — form + server action + ghost subject. Fase 3 (queue welfare-officer) cierra el loop para que las denuncias sean *accionables*, no solo *recibidas*.

Si querés ajustar algo antes — copy de los disclaimers (la sticky bar es crítica para no mezclar incident con maltreatment), la lista de `maltreatment_type`, el comportamiento del ghost subject post-rescate, el rate-limit anon (3/día puede ser conservador), el set de categorías de `note_added` para case state — **mejor decirlo ahora**.

Preguntas abiertas concretas:

- **¿Captcha?** Recomiendo hCaptcha (gratis, GDPR-friendly, no Google). Alternativas: Cloudflare Turnstile, Friendly Captcha. Cualquiera de las tres es OK.
- **¿Permitir `pets.status='ghost_subject'` también para `abandonment_reported`?** Yo voto sí (mismo patrón, mismo spec extiende cuando llegue). Pero abre la puerta a ghosts proliferando — un GC manual via admin es saludable. Confirmá.
- **¿El reporter anónimo recibe email confirmación de submission si dejó email?** Yo voto sí pero acotado a UN solo email (recibimos tu denuncia). Updates posteriores requieren cuenta. Reduce abuse del email transaccional como vector spam.
