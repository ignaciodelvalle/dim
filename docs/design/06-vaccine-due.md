# 06 — Vaccine-due UX owner-side · design spec (handoff)

> Capa de recordatorios visibles al owner para vacunas próximas a vencer o vencidas. AGENTS.md: "Vaccination-due warning al owner (UX feature, NO compliance requirement)". Aprovecha el cron `/api/cron/vaccine-due` que ya existe y la columna `vaccination_administered.payload.next_due_at`.

## Audiencias y journeys

| Audiencia | Journey | Surfaces |
|---|---|---|
| **Owner con pets** | recibe push/in-app notification 14d antes del vencimiento → ve recordatorio en `/inicio` y en pet detail → clickea CTA y reserva turno o registra vacuna manual | `/inicio`, `/mis-mascotas/[publicToken]`, `/notificaciones`, `/mis-mascotas/[publicToken]/vacunas` |
| **Owner que reserva** | desde el card "Vacuna vencida de {pet}" → clickea "Reservar turno" → `/turnos/buscar?species=...&type=vaccination&locality=...` | igual + `/turnos/buscar` |

## Sitemap (extensiones a rutas existentes)

```
/inicio                              — agregar sección "Recordatorios" arriba (existe)
/mis-mascotas                         — agregar badge contador en cards (existe)
/mis-mascotas/[publicToken]           — sección destacada "Próximas vacunas" arriba (existe)
/mis-mascotas/[publicToken]/vacunas   — lista con estados visuales (existe — extender)
/mis-mascotas/[publicToken]/vacunas/programar — form para programar recordatorio manual (existe)
/notificaciones                       — categoría "Salud" agrupada (existe — agrupar)
```

---

## A. Componentes nuevos

### A.1 `<ReminderCard>` — tarjeta de recordatorio

#### Variants

| Variant | Use when |
|---|---|
| `upcoming` | Vacuna programada con `next_due_at` en próximos 14d, no vencida |
| `due_soon` | `next_due_at` en próximos 7d |
| `overdue` | `next_due_at` pasada |
| `overdue_critical` | `next_due_at` pasada >30d (rabia, distemper, parvo — reportable) |
| `success` | Vacuna registrada que respondió a un recordatorio (auto-dismiss después de 24h) |

#### Layout

```
[Card horizontal mobile, narrow desktop]
  [Icon vaccine 32px, color according variant]
  [Block:
    [Title: "{Vaccine name} de {pet.name}" (medium 14px)]
    [Subtitle: "{Status text} — {relative date}" (12px muted)]
  ]
  [Actions:
    <Button variant="primary" size="sm" iconLeft="calendar-plus">Reservar turno</Button>
    <Button variant="link" size="sm">Registrar manual</Button>
    <Button variant="ghost" size="sm" iconLeft="x" aria-label="Posponer"/>
  ]
```

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `reminder` | `Reminder` | required | Row de `reminders` table |
| `pet` | `Pet` | required | Para mostrar nombre + foto |
| `variant` | computed | computed | Derivado de `nextDueAt` vs now |
| `onDismiss` | `() => void` | optional | Posponer 7d |
| `onRegister` | `() => void` | optional | Marca como completo + abre form de vacuna |

#### Estados visuales por variant

| Variant | Border | Icon color | Status text | Action label |
|---|---|---|---|---|
| upcoming | `border-l-gob-info` | `text-gob-info` | "Próxima — vence en 12 días" | "Reservar turno" |
| due_soon | `border-l-gob-warning` | `text-gob-warning-text` | "Vence pronto — quedan 5 días" | "Reservar ya" |
| overdue | `border-l-gob-danger` | `text-gob-danger` | "Vencida hace 8 días" | "Reservar urgente" |
| overdue_critical | `border-l-gob-danger bg-gob-danger/5` | `text-gob-danger` | **"Vencida hace 45 días — vacuna obligatoria"** | "Reservar urgente" |
| success | `border-l-gob-success` | `text-gob-success` | "✓ Registrada" | (no actions, auto-dismiss) |

#### Copy ejemplos

| Variant | Title | Subtitle |
|---|---|---|
| upcoming rabia | "Antirrábica de Negrita" | "Próxima dosis: 18 de junio (en 14 días)" |
| due_soon polivalente | "Polivalente de Pipo" | "Vence pronto — quedan 4 días" |
| overdue parvo | "Parvovirus de Bicho" | "Vencida hace 12 días" |
| overdue_critical rabia | "Antirrábica de Negrita" | "Vencida hace 45 días — obligatoria por Ley CABA. Reservá un turno hoy." |

#### Accesibilidad

- Card es un `<article>` con `aria-labelledby` al título.
- Variant `overdue_critical` agrega `role="alert"` para que screen readers la prioricen.
- "Posponer" button tiene `aria-label="Posponer recordatorio 7 días"`.
- El "X" para dismiss no elimina el recordatorio — solo lo oculta hasta el próximo día.

---

### A.2 `<RemindersSection>` — `/inicio` y `/mis-mascotas/[publicToken]`

#### Descripción

Sección que agrupa recordatorios activos del usuario. En `/inicio` aparece arriba si hay 1+ `overdue` o 3+ `due_soon/upcoming`. En pet detail aparece siempre con scope del pet.

#### Layout (global, en `/inicio`)

```
<section aria-labelledby="reminders-heading">
  <h2 id="reminders-heading">Recordatorios de salud</h2>

  {criticalReminders.length > 0 && (
    <div className="grid gap-3" role="list">
      {criticalReminders.map(r => <ReminderCard key={r.id} reminder={r} pet={r.pet} variant="overdue_critical" />)}
    </div>
  )}

  {otherReminders.length > 0 && (
    <details open={criticalReminders.length === 0}>
      <summary>
        {otherReminders.length} {otherReminders.length === 1 ? 'recordatorio' : 'recordatorios'} adicionales
      </summary>
      <div className="grid gap-3" role="list">
        {otherReminders.map(r => <ReminderCard key={r.id} reminder={r} pet={r.pet} />)}
      </div>
    </details>
  )}
</section>
```

#### Layout (pet-scoped, en `/mis-mascotas/[publicToken]`)

```
{petReminders.length > 0 && (
  <Panel>
    <PanelHeader>
      <h2>Próximas vacunas</h2>
      <Link href={`/mis-mascotas/${pet.publicToken}/vacunas`}>Ver libreta de vacunas →</Link>
    </PanelHeader>
    <PanelBody>
      <ul role="list" className="grid gap-3">
        {petReminders.map(r => <ReminderCard key={r.id} reminder={r} pet={pet} compact />)}
      </ul>
    </PanelBody>
  </Panel>
)}
```

### A.3 `<VacunasTimeline>` — `/mis-mascotas/[publicToken]/vacunas`

#### Descripción

Vista de la libreta de vacunación. Combina histórico de `vaccination_administered` events con próximas `reminders` activas. Reemplaza la lista actual con timeline visual.

#### Layout

```
<main>
  <Breadcrumb items={[{ label: "Mis mascotas", href: "/mis-mascotas" }, { label: pet.name, href: `/mis-mascotas/${publicToken}` }, { label: "Vacunas" }]} />

  <h1>Libreta de vacunación de {pet.name}</h1>

  {petReminders.length > 0 && (
    <Panel>
      <PanelHeader><h2>Próximas</h2></PanelHeader>
      <PanelBody>
        <ul role="list" className="grid gap-3">
          {petReminders.map(r => <ReminderCard key={r.id} reminder={r} pet={pet} />)}
        </ul>
      </PanelBody>
    </Panel>
  )}

  <Panel>
    <PanelHeader>
      <h2>Histórico aplicado</h2>
      <Button variant="primary" iconLeft="plus" href={`/mis-mascotas/${publicToken}/eventos/nuevo/vacuna`}>Registrar vacuna</Button>
    </PanelHeader>
    <PanelBody>
      {history.length === 0 ? (
        <EmptyState
          icon="vaccine"
          title="Sin vacunas registradas"
          description="Cuando apliques o registres una vacuna, va a quedar acá."
          action={<Button variant="primary" href={`/mis-mascotas/${publicToken}/eventos/nuevo/vacuna`}>Registrar la primera</Button>}
        />
      ) : (
        <ol className="timeline">
          {history.map(v => <VacunaTimelineDot key={v.id} vacuna={v} />)}
        </ol>
      )}
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader>
      <h2>Programar recordatorio manual</h2>
    </PanelHeader>
    <PanelBody>
      <p>Si tu vet te dijo cuándo es la próxima dosis pero no te dieron turno, programá un recordatorio acá.</p>
      <Button variant="secondary" href={`/mis-mascotas/${publicToken}/vacunas/programar`}>Programar</Button>
    </PanelBody>
  </Panel>
</main>
```

### A.4 `<VacunaTimelineDot>`

Timeline item vertical:

```
[Vertical line continua]
[Dot 16×16: success/warning/info según freshness]
[Card horizontal:
  [Date 80px]
  [Block:
    [Title: {vaccineName} — {brand ?? 'Marca no especificada'}]
    [Subtitle: Administrada por {administeredBy} · Lote {batch ?? 'N/A'}]
    [Próxima: {nextDueAt ?? '—'}]
  ]
  [Right: chevron-right (→ evento detail)]
]
```

### A.5 `<ScheduleReminderForm>` — `/mis-mascotas/[publicToken]/vacunas/programar`

#### Descripción

Form simple para programar un recordatorio sin asociar a evento de vacuna existente. Útil cuando el owner tiene info del vet pero no registró todavía la vacuna pasada.

```
<FormPage title={`Programar recordatorio de vacuna — ${pet.name}`}>
  <FormSection title="Tipo de vacuna">
    <Field label="Vacuna" required helper="Ej: Antirrábica, Polivalente, Sextuple, Triple felina">
      <Input name="vaccine_name" maxLength={80} />
    </Field>
  </FormSection>

  <FormSection title="Fecha de vencimiento">
    <Field label="¿Cuándo vence o se debe aplicar?" required>
      <Input name="next_due_at" type="date" min={today} />
    </Field>
    <Field label="¿Cuántos días antes querés que te avisemos?" defaultValue={14}>
      <Select name="warning_days_before">
        <option value="7">7 días</option>
        <option value="14">14 días</option>
        <option value="30">30 días</option>
      </Select>
    </Field>
  </FormSection>

  <FormSection title="Notas">
    <Field label="Comentarios (opcional)" helper="Ej: 'Marca específica indicada por la vet'">
      <Textarea name="notes" rows={2} maxLength={200} />
    </Field>
  </FormSection>

  <FormPage.Actions>
    <Button variant="link" type="button">Cancelar</Button>
    <Button variant="primary" type="submit">Programar recordatorio</Button>
  </FormPage.Actions>
</FormPage>
```

---

## B. Notification design

### B.1 In-app notifications

Cada cron run (`/api/cron/vaccine-due`) detecta `reminders` con `due_at` entre [now, now+14d] o `due_at < now` y inserta `notifications` rows con:

| Field | Value |
|---|---|
| `user_id` | owner del pet |
| `severity` | `info` (upcoming), `warning` (due_soon), `urgent` (overdue), `urgent` (overdue_critical) |
| `category` | `health` |
| `title` | "Vacuna de {pet.name}: {vaccineName}" |
| `body` | Según variant (ver A.1 copy table) |
| `cta_label` | "Reservar turno" |
| `cta_url` | `/turnos/buscar?species={pet.species}&type=vaccination&locality={pet.jurisdictionLocality}` |
| `related_pet_id` | pet.id |
| `related_reminder_id` | reminder.id |

#### Anti-spam

- Por `(reminder_id, user_id)`: máximo 1 notification por semana mientras siga `upcoming`.
- Cuando pasa a `due_soon` → 1 notification nueva diaria los primeros 3 días, después cada 3 días.
- Cuando pasa a `overdue` → 1 daily las primeras 2 weeks, después weekly.
- Crítico (overdue_critical, vacunas reportables como rabia/parvo/distemper en CABA) → daily indefinido hasta que se registre la vacuna o se posponga el reminder.

### B.2 Email (futuro)

Pendiente integración con servicio de email. Plan: vacuna `overdue_critical` >30d genera 1 email per week.

### B.3 Push notification (futuro)

PWA push subscription. Misma lógica con throttling.

---

## C. Pet card — badge global

En `/mis-mascotas` (lista) cada `<PetCard>` agrega un badge si tiene recordatorios:

```
{vaccineReminderState && (
  <Badge variant={vaccineReminderState.variant} icon="vaccine" aria-label={vaccineReminderState.label}>
    {vaccineReminderState.shortLabel}
  </Badge>
)}
```

| State | Variant | Short label | Full label (aria) |
|---|---|---|---|
| Hay upcoming | `info` | "Vacunas próximas" | "Tiene vacunas a programar en próximos 14 días" |
| Hay due_soon | `warning` | "Vacuna pronto" | "Tiene una vacuna que vence pronto" |
| Hay overdue | `danger` | "Vacuna vencida" | "Tiene una vacuna vencida" |
| Hay overdue_critical | `danger` (animated subtle pulse) | "URGENTE" | "Tiene una vacuna obligatoria vencida" |
| Sin pendientes | (sin badge) | — | — |

---

## D. /notificaciones — agrupamiento por categoría

La inbox existente agrega filtro por categoría:

```
<Tabs>
  <Tab href="?cat=all">Todas ({total})</Tab>
  <Tab href="?cat=health" badge={healthCount}>Salud</Tab>
  <Tab href="?cat=custody">Custodia</Tab>
  <Tab href="?cat=adoption">Adopciones</Tab>
  <Tab href="?cat=welfare">Denuncias</Tab>
  <Tab href="?cat=admin">Sistema</Tab>
</Tabs>
```

Notifications de vacunas se agrupan visualmente cuando hay 3+ del mismo pet/vacuna:

```
[Notification group]
  [Header: "{pet.name}: 4 recordatorios de Antirrábica"]
  [Lista colapsada con disclosure]
```

---

## E. Edge cases

| Caso | Decisión |
|---|---|
| Owner tiene 8 pets con muchas vacunas | `<RemindersSection>` muestra max 3 critical + colapsado el resto en `<details>` |
| Vacuna ya registrada después de notif sent | Notif legacy queda en inbox como "Resuelta" con check verde; no se borra (audit trail) |
| User pospone N veces el mismo reminder | Cap a 3 posponer-7d. Después de la 3ra, el botón Posponer dice "Posponer 30 días" (cooldown) |
| Pet muerto con reminders activos | `death_recorded` cron-cierra reminders activos. No más notifs. |
| Reminder con `next_due_at` muy futuro (>1 año) | El cron solo dispara cuando está dentro de 14d. Mientras tanto, el card existe en `/vacunas` pero sin notif. |
| Owner cambia jurisdicción del pet | Las CTAs "Reservar turno" usan la nueva jurisdicción. Reminders no se re-emiten. |
| Race: owner registra vacuna manual + cron crea notif simultáneamente | Server action al registrar vacuna marca `notifications` relacionadas como read+resolved en el mismo tx |

---

## F. Accesibilidad

- `<ReminderCard>` variant `overdue_critical` tiene `role="alert"` para anuncio inmediato.
- Badge en pet card tiene `aria-label` descriptivo (no solo color).
- Animación de pulse en critical respeta `prefers-reduced-motion`.
- Posponer button con `aria-describedby` al status text actual.
- Modal de posponer (cuando aplica) anuncia el cambio via aria-live.

---

## G. Resumen archivos a crear

| Archivo | Propósito |
|---|---|
| `components/poncho/ReminderCard.tsx` | A.1 |
| `components/poncho/Badge.tsx` (si no existe) | C |
| `app/(app)/inicio/_components/RemindersSection.tsx` | A.2 global |
| `app/(app)/mis-mascotas/[publicToken]/_components/PetReminders.tsx` | A.2 pet-scoped |
| `app/(app)/mis-mascotas/[publicToken]/vacunas/page.tsx` | A.3 (existe — extender con timeline) |
| `app/(app)/mis-mascotas/[publicToken]/vacunas/VacunasTimeline.tsx` | A.3 |
| `app/(app)/mis-mascotas/[publicToken]/vacunas/VacunaTimelineDot.tsx` | A.4 |
| `app/(app)/mis-mascotas/[publicToken]/vacunas/programar/page.tsx` | A.5 (existe — refinar) |
| `app/(app)/notificaciones/page.tsx` | D (existe — agregar tabs) |
| `app/api/cron/vaccine-due/route.ts` | B (existe — extender lógica con throttling) |
| `lib/vaccine-reminder-state.ts` | shared helper para computar variant |
