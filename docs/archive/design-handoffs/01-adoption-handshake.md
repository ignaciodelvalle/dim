# 01 — Adoption handshake unificado · design spec (handoff)

> Spec handoff-ready para implementar el flow completo de adopción con handshake en dos fases, postulación estructurada de 28 preguntas, contrato PDF per-adopción y firma electrónica simple.
>
> Plan de referencia: [`docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md`](../superpowers/plans/2026-05-20-adoption-handshake-unified.md). Esta spec es la capa de diseño que ese plan necesita para ejecutarse.

## Audiencias y journeys

| Audiencia | Journey | Surfaces |
|---|---|---|
| **Adoptante prospecto (owner autenticado)** | descubre pet → postula con wizard 28q → espera review → recibe handshake → lee contrato → acepta o rechaza | `/adoptar/[petToken]`, `/adoptar/[petToken]/postular`, `/mis-mascotas/postulaciones`, `/cuenta/adopciones/[handshakeToken]` |
| **Org coordinator/admin** | configura plantilla → review postulaciones → aprueba (= propone handshake atómicamente) → ve estado | `/org/[orgToken]/configuracion/adopciones`, `/org/[orgToken]/adopciones`, `/org/[orgToken]/adopciones/[applicationEventId]` |
| **Admin de plataforma** | puede configurar plantilla en nombre de cualquier org | `/admin/organizaciones/[orgToken]/configuracion/adopciones` |
| **Foster del pet** | recibe notificación de la finalización; el contrato puede listar al foster si está activo | (notif inbox) |

## Sitemap de pantallas nuevas/modificadas

```
/adoptar/[petToken]/postular        — wizard 28q v2 (reemplaza form actual de 4 campos)
/mis-mascotas/postulaciones         — listado de mis postulaciones (existe; suma estados nuevos)
/cuenta/adopciones                  — handshakes recibidos por el adoptante (NUEVO)
/cuenta/adopciones/[handshakeToken] — review + accept/reject del adoptante (NUEVO)
/org/[orgToken]/configuracion/adopciones      — plantilla contrato + override PDF (NUEVO)
/org/[orgToken]/adopciones                    — lista postulaciones + handshakes (existe; agrega handshake states)
/org/[orgToken]/adopciones/[applicationEventId] — detail de postulación con vista v2 + Aprobar = Proponer handshake
/org/[orgToken]/handshakes/[handshakeToken]    — vista org del handshake pendiente / cancel (NUEVO)
/casos/[publicCode]                  — case detail unificado (extender con kind `adoption_handshake`)
```

---

## A. Componentes nuevos / extendidos

### A.1 `<HandshakeProgress>` — stepper visual del handshake

#### Descripción

Stepper horizontal en desktop, compacto en mobile (`Paso X de 3` + dots). Comunica el estado de un handshake al adoptante y a la org. Tres estados terminales (`accepted` / `rejected` / `cancelled` / `expired`) más el in-progress.

#### Variants

| Variant | Use when |
|---|---|
| `propose` | El handshake recién se creó. Estado "Esperando que el adoptante revise". Dot activo = paso 2 de 3. |
| `accepted` | El adoptante aceptó. Stepper completo, último dot en verde. |
| `rejected` | El adoptante rechazó. Stepper cortado en paso 2, dot rojo. |
| `cancelled` | La org canceló. Stepper cortado en paso 2, dot amarillo. |
| `expired` | Pasaron los 14 días. Stepper cortado en paso 2, dot gris. |

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `status` | `'pending' \| 'accepted' \| 'rejected' \| 'cancelled' \| 'expired'` | required | El status del `adoption_handshakes` row |
| `proposedAt` | `Date` | required | Inicio del handshake |
| `resolvedAt` | `Date \| null` | `null` | Cuando se cerró (accepted/rejected/cancelled). Para `expired` se computa como `proposedAt + 14d`. |
| `expiresAt` | `Date` | required | Para mostrar "Quedan N días" cuando pending |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Compact en mobile, expandido en desktop |

#### Estados visuales

| Step | Pending | Accepted | Rejected / Cancelled / Expired |
|---|---|---|---|
| 1 — Postulación aprobada | ✓ `bg-gob-success` | ✓ `bg-gob-success` | ✓ `bg-gob-success` |
| 2 — Adoptante revisa contrato | spinner `text-gob-celeste` + "Quedan N días" | ✓ `bg-gob-success` | ✕ `bg-gob-danger` / `bg-gob-warning` / `bg-neutral-400` |
| 3 — Adopción firmada | dot `bg-neutral-300` | ✓ `bg-gob-success` + timestamp | — (no render) |

#### Accesibilidad

- Wrapper `role="list"` con `aria-label="Progreso de la adopción"`.
- Cada step es `role="listitem"` con `aria-current="step"` en el step activo.
- Cuando el handshake está pending, un `<time>` con `datetime={expiresAt.toISOString()}` para que screen readers lean la fecha.
- En mobile compacto, el SR-only completo del stepper está visible: `<span class="sr-only">Paso 2 de 3: Adoptante revisa el contrato. Quedan 12 días.</span>`.

#### Do's and don'ts

| ✅ Do | ❌ Don't |
|---|---|
| Mostrar "Quedan N días" en pending para crear urgencia útil | Mostrar un timer en tiempo real (segundos) — agrega ansiedad sin valor |
| Usar `<time>` semántico para fechas | Hardcodear formato de fecha — usar `formatRelativeDate` del helper |
| Cortar el stepper en estados terminales no-success (rojo/amarillo) | Mostrar todos los dots verdes si fue rechazo |

#### Ejemplo

```tsx
<HandshakeProgress
  status={handshake.status}
  proposedAt={handshake.proposedAt}
  resolvedAt={handshake.resolvedAt}
  expiresAt={handshake.expiresAt}
  size="md"
/>
```

---

### A.2 `<ContractPreview>` — embed del contrato con gating

#### Descripción

Container que muestra el PDF del contrato. Por defecto (mobile + Safari iOS) **NO** embebe el PDF — abre via signed URL en pestaña nueva (D7 del plan). En desktop con `<embed>` capability detectada, puede mostrar inline. Checkbox "Lo leí" se mantiene visible siempre y gatea al botón principal Aceptar/Rechazar.

#### Variants

| Variant | Use when |
|---|---|
| `link` | Default. Botón "Abrir contrato" → `target="_blank"` con signed URL. |
| `inline` | Desktop + flag `prefersInline` true. Embed `<object>` con fallback. |

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `signedUrl` | `string` | required | Signed URL del PDF generado (expira en 1h, regenerable) |
| `contractTitle` | `string` | required | "Contrato de adopción de {pet.name}" |
| `fileSize` | `string` | required | "~340 KB" formateado |
| `onReadConfirmed` | `(read: boolean) => void` | required | Callback al toggle del checkbox |
| `readConfirmed` | `boolean` | required | Estado controlado del checkbox |
| `disabled` | `boolean` | `false` | Cuando el handshake ya no es pending |

#### Estados

| State | Visual | Behavior |
|---|---|---|
| Default | Botón "Abrir contrato" `<Button variant="secondary" iconRight="external-link">` + checkbox unchecked | Click abre signed URL en pestaña |
| Read confirmed | Checkbox checked + texto "Confirmaste que leíste el contrato" en `text-gob-success` | Botón principal Aceptar se habilita |
| Loading signed URL | Skeleton 200px + spinner | Generar URL puede tardar 1-2s post-mount |
| Error generación | `<Alert variant="danger">` "No pudimos generar el contrato. Probá refrescar la página." + botón "Reintentar" | onClick refetch |
| Disabled (handshake resuelto) | El botón "Abrir contrato" sigue visible para download archive; checkbox no aparece | — |

#### Copy (es-AR, DP10)

| Elemento | Texto |
|---|---|
| Header card | "Contrato de adopción" |
| Subheader | "Generado para tu postulación de {pet.name}. Léelo completo antes de aceptar." |
| Botón abrir | "Abrir contrato (PDF, {fileSize})" |
| Checkbox label | "Leí el contrato completo y entiendo que estoy aceptando un compromiso legal." |
| Helper bajo checkbox | "Al aceptar quedás registrado como adoptante con fecha, hora y huella digital de aceptación." |
| Después de check | "Listo, podés continuar." |

#### Accesibilidad

- Checkbox tiene `aria-describedby` al helper inmediato.
- El botón "Abrir contrato" tiene `aria-describedby` al subheader que explica el contexto.
- La signed URL **siempre** se abre con `target="_blank" rel="noopener noreferrer"` — `noopener` por seguridad.
- En mobile, el botón "Abrir contrato" tiene `min-height: 48px` (target táctil más alto que default).

---

### A.3 `<ApplicationWizard>` — wizard 4 steps, 28 preguntas

#### Descripción

Wizard de postulación v2. 4 steps (Vivienda, Otros animales, Compromiso, Declaración jurada). Cada step es client component dentro de `app/adoptar/[petToken]/postular/wizard/`. State con `useReducer`, persistencia en `sessionStorage` (no localStorage, DP3 prohibido en cowork pero aquí está permitido en producción) con key `mimar.adoption-wizard.{petToken}`. Auto-clear al submit.

#### Steps

| Step | # | Título | Preguntas | Campos schema |
|---|---|---|---|---|
| 1 | 7q | "Sobre tu hogar" | Tipo de vivienda, propia/alquilada, alquiler permite mascotas?, balcón/patio, casa con protecciones?, integrantes, edades, decisión unánime?, alergias?, dónde dormirá | `housing_type`, `rental_pets_allowed`, `has_balcony_or_yard`, `home_has_protection`, `household_size`, `household_ages`, `household_unanimous`, `household_allergies`, `sleep_arrangement` |
| 2 | 7q | "Otros animales en tu vida" | Tuviste mascotas antes?, qué pasó con ellas?, tenés mascotas ahora?, detalle de cada una (especie/sexo/edad/castrada/vacunada/desparasitada), marca de alimento | `has_previous_pets`, `previous_pets_outcome`, `has_current_pets`, `current_pets_detail` (array repeat-able), `current_pets_food_brand` |
| 3 | 8q | "Compromiso y previsiones" | Podés cubrir los costos?, castrarás si hace falta?, qué hacés si te mudás?, qué hacés si el nuevo lugar no permite?, qué hacés si hay embarazo?, qué hacés en vacaciones?, en qué caso devolverías?, aceptás follow-up post-adopción? | `can_cover_costs`, `will_castrate_if_needed`, `plan_if_move`, `plan_if_new_place_disallows`, `plan_if_pregnancy`, `plan_if_vacation`, `return_reasons`, `accepts_post_adoption_followup` |
| 4 | 1q + consent | "Declaración" | Checkbox declaración jurada (DP22: consent compartir historial con refugio) | `declared_truthful_at`, `profile_sharing_consent_at` |

#### Layout

Cada step renderea dentro de `<FormPage>`:

```
[Breadcrumb: Adopciones › Negrita › Postulación]
[H1: "Postulate para adoptar a Negrita"]
[Stepper compact mobile, full desktop: 1 ─ 2 ─ 3 ─ 4]
[Lead: "Step N: {Título}"]
[Form fields del step]
[FormPage footer fijo: ← Atrás · Siguiente →]
```

En el último step, el footer cambia a `← Atrás · Enviar postulación`.

#### Estados del wizard

| State | Descripción | UI |
|---|---|---|
| `idle` | Wizard recién montado | Renderea step 1 |
| `step:N` | El usuario está en step N | Renderea step correspondiente |
| `validating` | El usuario tocó Siguiente | Spinner en botón Siguiente, disable botones |
| `error` | Validación zod falló | Cada `<Field>` muestra error específico; banner top `<Alert variant="danger">` con "Revisá los campos marcados" |
| `submitting` | Step 4 → submit final | Spinner en botón Enviar, disable form |
| `success` | Server action OK | Toast `toast.success("Listo, recibimos tu postulación. Te avisamos por mail cuando el refugio responda.")` + redirect a `/mis-mascotas/postulaciones` |
| `submit-error` | Server falló | `<Alert variant="danger">` con error + botón Reintentar |

#### Persistencia

- SessionStorage key: `mimar.adoption-wizard.{petToken}.v2`
- Persiste el `state.data` del reducer en cada cambio (debounced 500ms).
- Al success borra la key.
- Al mount, intenta hidratar desde sessionStorage; si la versión de schema no match (`v2`), descarta.
- Al cambiar de step **valida solo los campos de ese step** (zod `.pick()` parcial) antes de avanzar.

#### Validación

- Cliente: validación cosmética en blur (DNI 8 dígitos, edad 0-30, etc.) — DP2 exception.
- Servidor: validación zod completa en `submitAdoptionApplicationAction`. El schema v2 está en `lib/event-schemas.ts` (ver plan §5.1).
- Errores volverían como `state.errors[field] = [string]` desde `useFormState`. El wizard los redistribuye al step correspondiente.

#### Accesibilidad

- `<Stepper>` con `role="list"` + cada step `aria-current="step"` o `aria-disabled` según corresponda.
- En cada Step component, el `<h1>` se actualiza vía `<title>` del head para anunciar el cambio. SR-only fallback: `<div aria-live="polite" class="sr-only">Paso 2 de 4: Otros animales en tu vida</div>`.
- Foco se mueve al `<h1>` del nuevo step (con `tabIndex={-1}` + `.focus()` post-render).
- Cada `<Field>` tiene `aria-required="true"` si su campo es requerido, `aria-invalid="true"` si tiene error, y el error se conecta vía `aria-describedby`.
- Los radio groups (housing_type) usan `<fieldset>` + `<legend>` automáticos por `<RadioGroup>`.
- El array `current_pets_detail` usa un `<fieldset>` por entry con `<legend>` "Mascota 1", "Mascota 2", etc. y un botón "Agregar otra mascota" con `aria-label="Agregar otra mascota a la lista"`.

#### Copy completo de los 28 campos

(Solo los que requieren copy explícito; los obvios — nombre, especie — usan label corto.)

**Step 1 — Sobre tu hogar**

| Campo | Label | Helper | Tipo |
|---|---|---|---|
| `housing_type` | "¿En qué tipo de vivienda vivís?" | — | RadioGroup: `casa_con_patio` "Casa con patio", `casa_sin_patio` "Casa sin patio", `departamento` "Departamento", `otro` "Otro" |
| `rental_pets_allowed` | "¿La vivienda es propia?" + "Si es alquilada, ¿el contrato permite mascotas?" | "Marcá la opción que aplique a tu caso" | RadioGroup: `propia` "Es propia", `alquilada_si` "Alquilada, permite", `alquilada_no` "Alquilada, no permite" |
| `has_balcony_or_yard` | "¿Hay balcón, patio o terraza?" | — | RadioGroup yes/no |
| `home_has_protection` | "¿Las ventanas y balcones tienen protección? (rejas, mallas, redes)" | "Si tenés balcón sin proteger, comprometete a instalar protección antes de la entrega" | RadioGroup yes/no/will-install (3 opciones) |
| `household_size` | "¿Cuántas personas viven en la casa?" | — | Number input min=1 max=20 |
| `household_ages` | "¿Qué edades tienen?" | "Ej: 35, 33, 8, 3" | Text input |
| `household_unanimous` | "¿Todos están de acuerdo con adoptar?" | "La decisión tiene que ser de todo el hogar" | RadioGroup yes/no |
| `household_allergies` | "¿Alguien tiene alergia a animales?" | — | RadioGroup yes/no |
| `sleep_arrangement` | "¿Dónde va a dormir la mascota?" | "Adentro, en una habitación específica, en patio cubierto..." | Textarea, 200 char max |

**Step 2 — Otros animales**

| Campo | Label | Helper | Tipo |
|---|---|---|---|
| `has_previous_pets` | "¿Tuviste mascotas antes?" | — | RadioGroup yes/no |
| `previous_pets_outcome` | "Contanos qué pasó con ellas" | "¿Murieron de viejas, las regalaste, las perdiste, etc.?" — visible solo si previous=yes | Textarea, 300 char max |
| `has_current_pets` | "¿Tenés mascotas ahora?" | — | RadioGroup yes/no |
| `current_pets_detail` | "Detalle de cada mascota" | "Agregá una entrada por cada animal — visible solo si current=yes" | Array repeat-able: species (radio perro/gato/otro), sex (radio m/f), age_years (number), castrated (radio), vaccinated (radio), dewormed (radio) |
| `current_pets_food_brand` | "¿Con qué alimento las alimentás?" | "Marca y tipo. Ayuda al refugio a estimar costos." — visible solo si current=yes | Text input |

**Step 3 — Compromiso**

| Campo | Label | Helper | Tipo |
|---|---|---|---|
| `can_cover_costs` | "¿Podés cubrir alimento, veterinario y emergencias?" | "Adoptar implica un gasto promedio de $30.000-80.000 mensuales en CABA" | RadioGroup yes/no |
| `will_castrate_if_needed` | "Si todavía no está, ¿la vas a castrar?" | "Obligatorio en CABA según Ordenanza 41.831" | RadioGroup yes/no |
| `plan_if_move` | "¿Qué hacés si te mudás?" | "Contanos brevemente" | Textarea |
| `plan_if_new_place_disallows` | "¿Y si el nuevo lugar no permite mascotas?" | "Esta es una pregunta importante — pensá la respuesta" | Textarea |
| `plan_if_pregnancy` | "¿Qué hacés si hay embarazo o llegada de bebé?" | — | Textarea |
| `plan_if_vacation` | "¿Quién la cuida cuando viajás?" | "Familia, pet sitter, guardería..." | Textarea |
| `return_reasons` | "¿En qué caso la devolverías al refugio?" | "Adoptar es un compromiso pero queremos saber tu honestidad" | Textarea |
| `accepts_post_adoption_followup` | "¿Aceptás que el refugio te haga seguimiento durante 6 meses?" | "Mensajes ocasionales para saber cómo está. Es parte del contrato." | RadioGroup yes/no |

**Step 4 — Declaración**

```
[Checkbox grande, no marcado por default]
"Declaro bajo juramento que la información que completé es verdadera. Entiendo que cualquier
falsedad puede ser causal de rechazo de mi postulación o de revocación del contrato de adopción."

[Checkbox separado, no marcado por default — D22]
"Acepto compartir con {nombre_del_refugio} mi historial de mascotas, fosters y adopciones
registradas en MiMAR para esta postulación. El refugio sólo accederá mientras mi postulación
esté abierta."

[Helper bajo el segundo: "Ley 25.326 — consentimiento informado y revocable."]

[Botón Enviar — disabled hasta ambos checks marcados]
```

#### Edge cases

- **Visitante anónimo clickea Postular en `/adoptar/[petToken]`** → no entra al wizard. Redirige a `/login?returnTo=...&apply_intent={token}` y el `apply_intent` token contiene `{petToken, browsedFilters}`. Post-auth vuelve a `/adoptar/[petToken]/postular`.
- **Owner sin DNI verificado** → primera pantalla del wizard muestra `<Alert variant="warning">` "Verificá tu DNI antes de postular — toma 2 minutos" + link a `/cuenta/verificar-dni?returnTo=...`. El wizard NO se bloquea pero la postulación queda en `requires_verification` server-side.
- **Owner postula al mismo pet 2 veces** → server action rechaza con error "Ya tenés una postulación pending para esta mascota". El wizard muestra `<Alert>` con link a la postulación existente.
- **Pet ya tiene `adoption_finalized`** → la página `/adoptar/[petToken]` devuelve `notFound()`. No se llega al wizard.
- **El wizard se interrumpe (cierra navegador)** → al volver, hidrata desde sessionStorage y restablece step + datos. Toast "Recuperamos tu postulación. Estabas en el paso 3."

---

### A.4 `<TemplateForm>` — config plantilla contrato (org-side)

#### Descripción

Form de configuración de la plantilla de contrato per-org. Vive en `/org/[orgToken]/configuracion/adopciones`. Permite a la org cargar sus datos institucionales (representante legal, DNI, dirección), agregar cláusulas extra opcionales (markdown) y subir un PDF override (escape hatch D14).

#### Layout

```
<FormPage title="Plantilla de contrato de adopción" lead="Configurá los datos que MiMAR va a usar para generar cada contrato.">

  <FormSection title="Datos institucionales" description="Aparecen en el header del contrato.">
    <Field label="Representante legal" required>
      <Input name="legal_representative_name" />
    </Field>
    <Field label="DNI del representante" required helper="Sin puntos ni guiones">
      <Input name="legal_representative_dni" inputMode="numeric" pattern="[0-9]{7,8}" />
    </Field>
    <Field label="Cargo" helper="Ej: Presidenta, Coordinadora, Apoderada">
      <Input name="legal_representative_role" />
    </Field>
    <Field label="Domicilio institucional" required>
      <Textarea name="institutional_address" rows={2} />
    </Field>
  </FormSection>

  <FormSection title="Cláusulas estándar" description="Estas 12 cláusulas se incluyen automáticamente en todo contrato.">
    [Lista read-only de las 12 cláusulas con disclosure expand/collapse — usa <details>]
  </FormSection>

  <FormSection title="Cláusulas extra" description="Opcional. Markdown soportado. Se agregan al final del contrato.">
    <Field label="Texto adicional">
      <Textarea name="extra_clauses_md" rows={6} placeholder="Ej: 'El adoptante se compromete a enviar una foto al mes durante el primer año.'" />
    </Field>
  </FormSection>

  <FormSection title="Vista previa" description="Generamos un PDF con datos de ejemplo para que veas cómo queda.">
    <Button variant="secondary" iconLeft="file-text">Generar vista previa</Button>
  </FormSection>

  <details>
    <summary>Avanzado — Subir PDF custom (override)</summary>
    [Form de override que reemplaza la generación automática]
  </details>

  <FormPage.Actions>
    <Button variant="link" type="button">Cancelar</Button>
    <Button variant="primary" type="submit">Guardar plantilla</Button>
  </FormPage.Actions>
</FormPage>
```

#### Estados

| State | UI |
|---|---|
| Initial (sin plantilla) | Formulario vacío, `<Alert variant="warning">` arriba: "Configurá la plantilla antes de aprobar postulaciones. Sin esto no podés finalizar adopciones." |
| Plantilla activa | Formulario poblado, `<Alert variant="success">` arriba: "Plantilla activa desde {fecha}. Editar la guarda como nueva versión." |
| Plantilla custom PDF | Sección Avanzado expandida con preview del PDF actual + botón "Reemplazar" + "Eliminar override" |

#### Copy

| Elemento | Texto |
|---|---|
| Save success toast | "Plantilla guardada. Ya podés aprobar postulaciones." |
| Save error | "No pudimos guardar la plantilla. Probá refrescar y volver a intentar." |
| PDF override removed | "Eliminamos el PDF custom. Volvimos al contrato auto-generado." |

#### Accesibilidad

- Cada `<FormSection>` es un `<fieldset>` con `<legend>`.
- La sección "Avanzado" usa `<details>` nativo (DP6 — no usamos JS para esto).
- El botón "Generar vista previa" abre el PDF en nueva pestaña con `target="_blank"` — anuncia con `aria-describedby` "Se abre en una pestaña nueva".

---

### A.5 `<HandshakeDecisionPanel>` — accept/reject del adoptante

#### Descripción

Panel principal de `/cuenta/adopciones/[handshakeToken]`. Muestra `<HandshakeProgress>`, `<ContractPreview>`, datos del pet+org, y los dos botones de decisión. Persistencia: ninguna — la decisión es atómica server-side.

#### Layout

```
<main>
  <Breadcrumb items={[{ label: "Mis adopciones", href: "/cuenta/adopciones" }, { label: pet.name }]} />

  <Panel>
    <PanelHeader>
      <h1>Adopción de {pet.name}</h1>
      <HandshakeProgress status={handshake.status} ... />
    </PanelHeader>
    <PanelBody>
      [Pet identity card: foto, name, breed, age_bucket, fee si aplica]
      [Org card: logo, name, location, "Conocé al refugio →"]
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Contrato</h2></PanelHeader>
    <PanelBody>
      <ContractPreview
        signedUrl={handshake.signedUrl}
        contractTitle={`Contrato de adopción de ${pet.name}`}
        fileSize={handshake.contractSize}
        readConfirmed={readConfirmed}
        onReadConfirmed={setReadConfirmed}
        disabled={handshake.status !== 'pending'}
      />
    </PanelBody>
  </Panel>

  {handshake.status === 'pending' && (
    <Panel>
      <PanelHeader><h2>Tu decisión</h2></PanelHeader>
      <PanelBody>
        <p>Al aceptar quedás registrado como adoptante de {pet.name} con fecha y hora. La decisión es definitiva — si después necesitás devolverlo, hay un proceso de adopción reversada que pasa por el refugio.</p>

        <div className="flex flex-col gap-3 md:flex-row md:justify-end">
          <Button variant="link" onClick={openRejectModal}>No la voy a adoptar</Button>
          <Button variant="success" onClick={openConfirmModal} disabled={!readConfirmed}>
            Aceptar y firmar
          </Button>
        </div>
      </PanelBody>
    </Panel>
  )}

  {handshake.status === 'accepted' && (
    <Alert variant="success" icon="check-circle">
      <strong>Adopción firmada.</strong> {pet.name} es oficialmente tuya desde el {formatDate(handshake.acceptedAt)}.
      <br />
      <Link href={`/mis-mascotas/${pet.publicToken}`}>Ver a {pet.name} en mi lista →</Link>
    </Alert>
  )}

  {handshake.status === 'rejected' && (
    <Alert variant="info">
      Rechazaste esta adopción el {formatDate(handshake.resolvedAt)}. Si te equivocaste, contactá al refugio directamente.
    </Alert>
  )}

  {handshake.status === 'expired' && (
    <Alert variant="warning">
      El plazo de 14 días pasó. Si todavía querés adoptar a {pet.name}, contactá al refugio para que envíen una nueva propuesta.
    </Alert>
  )}
</main>
```

#### Confirm modal (al clickear Aceptar)

```
<ConfirmDialog
  open={open}
  onClose={close}
  title="Firmar adopción"
  description={`Estás por aceptar oficialmente la adopción de ${pet.name}.

Al hacerlo:
- ${pet.name} pasa a tu cuenta inmediatamente.
- Vas a recibir recordatorios de check-in durante 6 meses.
- El contrato queda firmado con tu identidad, fecha y hora.

¿Confirmás?`}
  confirmLabel="Sí, firmar adopción"
  cancelLabel="Volver"
  variant="success"
  onConfirm={async () => {
    setSubmitting(true);
    const result = await acceptAdoptionHandshakeAction({ handshakeToken });
    if (result.ok) {
      toast.success(`¡Felicitaciones! ${pet.name} ya es parte de tu cuenta.`);
      router.push(`/mis-mascotas/${pet.publicToken}`);
    } else {
      toast.error(result.error);
    }
  }}
/>
```

#### Reject modal

```
<Modal title="No voy a adoptar a {pet.name}" open={open} onClose={close}>
  <p>Contanos brevemente por qué no podés avanzar. Esto le ayuda al refugio a entender y a buscar otro hogar.</p>

  <Field label="Motivo" required>
    <Textarea name="rejection_reason" minLength={20} maxLength={500} required />
  </Field>

  <ModalFooter>
    <Button variant="link" onClick={close}>Volver</Button>
    <Button variant="danger" onClick={submitReject}>Enviar rechazo</Button>
  </ModalFooter>
</Modal>
```

---

### A.6 `<HandshakeListItem>` y `<ApplicationCard>` — listings

#### `<HandshakeListItem>` — usado en `/cuenta/adopciones`

```
[Card]
  [pet photo 80×80 round]   [pet name + breed + age]   [HandshakeProgress size=sm]   [chevron-right]
  [Refugio: {org.name}]
  {pending: Quedan N días para responder · accepted: Aceptada el ... · rejected: Rechazada · expired: Vencida}
```

#### `<ApplicationCard>` — usado en `/mis-mascotas/postulaciones`

Igual layout pero el estado refleja el `adoption_application` status (`pending`, `under_review`, `approved`, `rejected`, `withdrawn`, `awaiting_handshake`).

---

## B. Pantallas — detail por surface

### B.1 `/adoptar/[petToken]/postular` — wizard host

Server component. Carga pet, org, valida que pet siga listable. Renderea `<ApplicationWizard>` client.

```tsx
// Server
import { ApplicationWizard } from './wizard/ApplicationWizard';

export default async function PostularPage({ params }: { params: Promise<{ petToken: string }> }) {
  const { petToken } = await params;
  const { pet, org } = await loadPetAndOrgForPostulation(petToken);
  if (!pet || !org || !pet.adoptionListedAt || pet.adoptionListingPausedAt) notFound();

  const { user } = await requireUserOrRedirect(`/adoptar/${petToken}/postular`);

  // Pre-check: ya tiene application pending?
  const existing = await getExistingPendingApplication(user.id, pet.id);
  if (existing) {
    return <AlreadyAppliedView application={existing} pet={pet} />;
  }

  return (
    <FormPage>
      <Breadcrumb items={[{ label: "Adopciones", href: "/adoptar" }, { label: pet.name, href: `/adoptar/${petToken}` }, { label: "Postulación" }]} />
      <h1>Postulate para adoptar a {pet.name}</h1>
      <p className="lead">Completá estas 28 preguntas. El refugio las usa para conocerte y elegir la mejor casa para {pet.name}.</p>
      <ApplicationWizard
        petToken={petToken}
        petName={pet.name}
        orgName={org.displayName}
        userId={user.id}
        userProfile={{ displayName: user.displayName, dniVerified: user.dniVerified }}
      />
    </FormPage>
  );
}
```

### B.2 `/cuenta/adopciones` — listado handshakes recibidos

Server component. Lista ordenada por `expiresAt asc` (los más urgentes primero), separada en "Pendientes" y "Resueltos".

```
<main>
  <h1>Mis adopciones</h1>
  <p className="lead">Acá ves todas las adopciones que iniciaste o estás por firmar.</p>

  {pending.length > 0 && (
    <Panel>
      <PanelHeader><h2>Pendientes de respuesta</h2></PanelHeader>
      <PanelBody>
        {pending.map(h => <HandshakeListItem key={h.id} handshake={h} />)}
      </PanelBody>
    </Panel>
  )}

  {resolved.length > 0 && (
    <Panel>
      <PanelHeader><h2>Resueltas</h2></PanelHeader>
      <PanelBody>
        {resolved.map(h => <HandshakeListItem key={h.id} handshake={h} />)}
      </PanelBody>
    </Panel>
  )}

  {pending.length === 0 && resolved.length === 0 && (
    <EmptyState
      icon="paw"
      title="Todavía no postulaste a ninguna adopción"
      description="Recorré las mascotas en adopción y postulate cuando encuentres una que te guste."
      action={<Button variant="primary" href="/adoptar" iconLeft="search">Ver mascotas en adopción</Button>}
    />
  )}
</main>
```

### B.3 `/cuenta/adopciones/[handshakeToken]` — review + decisión

Ver A.5 arriba.

### B.4 `/org/[orgToken]/configuracion/adopciones` — config plantilla

Ver A.4 arriba.

### B.5 `/org/[orgToken]/adopciones/[applicationEventId]` — application detail (extender)

La página existe. Cambios:

1. Renderea `readApplication(event)` → muestra todos los campos v2 en `<details>` colapsables agrupados por sección (vivienda / animales / compromiso / declaración).
2. Si el applicant tiene consent (D22), aparece nueva pestaña "Historial en MiMAR" que lista las mascotas+fosters+adopciones del applicant via la RLS scope-bound.
3. Botones: "Pedir más info" (notif al applicant, libre-texto), "Rechazar" (form motivos), "Aprobar y proponer adopción" (= `approveAdoptionApplicationAction` que internamente llama `proposeAdoptionHandshakeAction`).
4. Si la org no tiene template configurada, el botón Aprobar está disabled con tooltip "Configurá la plantilla de contrato primero" + link al config.

### B.6 `/org/[orgToken]/handshakes/[handshakeToken]` — vista org del handshake

Muestra `<HandshakeProgress>`, datos de la postulación que originó, contrato (link), botón "Cancelar handshake" con confirm modal (motivo obligatorio).

---

## C. Estados y transiciones del case `adoption_handshake`

```
                              propose
                                │
                                ▼
                          ┌───────────┐
                          │  pending  │ ◄── handshake creado (atómico con approve)
                          └───────────┘
                                │
              ┌─────────────────┼───────────────┐
              │                 │               │
       adopter accepts   adopter rejects  org cancels  (or auto-expire 14d)
              │                 │               │
              ▼                 ▼               ▼
       ┌────────────┐    ┌────────────┐  ┌────────────┐
       │  accepted  │    │  rejected  │  │  cancelled │
       └────────────┘    └────────────┘  └────────────┘
              │
              │ atomic cascade
              ▼
       ┌────────────────────────────┐
       │ adoption_finalized emitido │
       │ + ownership flip           │
       │ + cascade rejection rivals │
       │ + post-adoption reminders  │
       │ + listing case → followup  │
       └────────────────────────────┘
```

---

## D. Notification matrix

| Evento | Recipient | Title | Body | CTA |
|---|---|---|---|---|
| Application submitted | Org coordinators | "Nueva postulación para {pet.name}" | "{Applicant name} se postuló para adoptar a {pet.name}." | `/org/[orgToken]/adopciones/{eventId}` |
| Application approved → handshake proposed | Applicant | "{Org} aprobó tu postulación para {pet.name}" | "Tenés 14 días para revisar el contrato y firmar la adopción." | `/cuenta/adopciones/{handshakeToken}` |
| Handshake accepted | Org coordinators + foster (si distinto) | "¡{Applicant} firmó la adopción de {pet.name}!" | "La adopción quedó completada el {fecha}. Vas a recibir check-ins durante 6 meses." | `/org/[orgToken]/mascotas/{petToken}` |
| Handshake rejected | Org coordinators | "{Applicant} rechazó la adopción de {pet.name}" | "Motivo: {reason}" | application detail |
| Handshake cancelled by org | Applicant | "{Org} canceló la propuesta de adopción de {pet.name}" | "Motivo: {reason}. Contactá al refugio si querés saber más." | `/refugios/{orgToken}` |
| Handshake auto-expired | Applicant + Org coordinators | "El plazo para adoptar a {pet.name} venció" | "Pasaron los 14 días sin respuesta. Si todavía querés adoptar, el refugio puede enviar una nueva propuesta." | `/cuenta/adopciones` |
| Cascade auto-rejection (rival apps) | Rival applicants | "Otra postulación para {pet.name} fue finalizada" | "Sabemos que es decepcionante. {Org} tiene otras mascotas en adopción en MiMAR." | `/adoptar?org={orgToken}` |
| Post-adoption check-in due (mes 1/3/6/12) | Adopter | "¿Cómo está {pet.name}?" | "Pasaron N meses desde la adopción. Mandanos un check-in con foto." | `/mis-mascotas/{petToken}/eventos/nuevo/checkin` |
| Post-adoption check-in missed | Adopter + Org coordinators | "Recordatorio: check-in pendiente de {pet.name}" | "Pasó la fecha del check-in. Mandalo cuando puedas." | `/mis-mascotas/{petToken}` |

---

## E. Edge cases (resumen)

| Caso | Decisión |
|---|---|
| Applicant elimina su cuenta entre approve y handshake accept | Handshake queda huérfano. Cron diario detecta `auth.users.deleted_at` y auto-cancela handshakes pending con razón `applicant_account_deleted`. Notif a org. |
| Org pierde verification durante el handshake pending | Handshake sigue valido (acuerdo bilateral). Audit log. Pero pet sale del `/adoptar` listing. |
| Pet muere durante handshake pending | `death_recorded` cascade-cancela el handshake (Atomically). Notif urgente a applicant: "{Org} nos informó que {pet.name} falleció el {fecha}. La propuesta de adopción se canceló. Lamentamos profundamente la noticia." |
| Adopter clickea Aceptar en una tab y Rechazar en otra | Server action es idempotente por `status='pending'`. La segunda llamada devuelve "Este handshake ya fue resuelto. Refrescá la página." |
| Signed URL del contrato vence (1h) | El frontend auto-refetch al expirar. Si falla, mostrar `<Alert>` con botón "Regenerar contrato". |
| Adopter no completa el wizard pero la pet se despublica | El sessionStorage queda con datos huérfanos. Al submit el server action retorna error "Esta mascota ya no está disponible para adopción". Wizard limpia y muestra `<EmptyState>` con CTA a `/adoptar`. |
| Mobile keyboard tapa el botón Continuar | `<FormPage>` footer es sticky bottom con `padding-bottom: env(safe-area-inset-bottom)`. Cuando el teclado abre, el footer reposiciona via `vh` dynamic. |

---

## F. Animaciones y motion

Respetando DP4 + `prefers-reduced-motion`:

| Motion | Trigger | Duración | Easing | Reduced motion |
|---|---|---|---|---|
| Step transition wizard | Click siguiente/atrás | 200ms | `cubic-bezier(0.4, 0, 0.2, 1)` | No motion, swap instantáneo |
| HandshakeProgress fill | Mount | 400ms staggered | ease-out | No motion |
| Checkbox "Lo leí" → button enable | Tick | 150ms opacity fade | linear | No motion |
| Toast in/out | Show/dismiss | 250ms slide + fade | ease-out | Opacity only |
| Modal open/close | Open | 200ms scale + fade | ease-out | No motion |

---

## G. Resumen de archivos a crear (handoff)

| Archivo | Propósito |
|---|---|
| `components/poncho/HandshakeProgress.tsx` | A.1 |
| `components/poncho/ContractPreview.tsx` | A.2 |
| `app/adoptar/[petToken]/postular/wizard/ApplicationWizard.tsx` | A.3 |
| `app/adoptar/[petToken]/postular/wizard/Step1Housing.tsx` | A.3 |
| `app/adoptar/[petToken]/postular/wizard/Step2OtherPets.tsx` | A.3 |
| `app/adoptar/[petToken]/postular/wizard/Step3Commitment.tsx` | A.3 |
| `app/adoptar/[petToken]/postular/wizard/Step4Declaration.tsx` | A.3 |
| `app/adoptar/[petToken]/postular/wizard/useWizardState.ts` | A.3 reducer + sessionStorage |
| `app/org/[orgToken]/configuracion/adopciones/page.tsx` | A.4 + B.4 |
| `app/org/[orgToken]/configuracion/adopciones/TemplateForm.tsx` | A.4 |
| `app/org/[orgToken]/configuracion/adopciones/PolicyOverrideForm.tsx` | A.4 advanced |
| `app/cuenta/adopciones/page.tsx` | B.2 |
| `app/cuenta/adopciones/[handshakeToken]/page.tsx` | A.5 + B.3 |
| `app/cuenta/adopciones/[handshakeToken]/HandshakeDecisionPanel.tsx` | A.5 |
| `app/cuenta/adopciones/HandshakeListItem.tsx` | A.6 |
| `app/org/[orgToken]/handshakes/[handshakeToken]/page.tsx` | B.6 |

Plus el handoff técnico ya documentado en [`docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md`](../superpowers/plans/2026-05-20-adoption-handshake-unified.md) (server actions, schema, migrations).
