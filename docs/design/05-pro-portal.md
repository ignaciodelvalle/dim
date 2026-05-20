# 05 — /pro vet independiente · design spec (handoff)

> Portal para veterinarios independientes (no afiliados a una clínica). Scope: **scheduling y libreta** — sin intake, foster, adopción, ni gestión organizacional. AGENTS.md: "El independiente opera como service provider".

## Audiencias y journeys

| Audiencia | Journey | Surfaces |
|---|---|---|
| **Vet independiente** | login → ve agenda del día → atiende turno → emite eventos clínicos en la libreta del pet | `/pro`, `/pro/agenda`, `/pro/agenda/turnos/[appointmentToken]` |
| **Vet con setup pendiente** | crea servicios (vacunación, control, esterilización) → define horarios → activa el listing | `/pro/servicios`, `/pro/servicios/nuevo`, `/pro/servicios/[offeringToken]/agenda` |
| **Owner que reserva con un vet pro** | busca en `/turnos/buscar` → ve servicio del vet → reserva slot | `/turnos/buscar` (existe, ya integra ofertas /pro) |

## Sitemap

```
/pro                                  — dashboard home (NUEVO)
/pro/servicios                        — listado de servicios ofrecidos (existe parcial)
/pro/servicios/nuevo                  — crear servicio (existe parcial)
/pro/servicios/[offeringToken]        — detail offering
/pro/servicios/[offeringToken]/agenda — agenda específica del offering (schedule rules)
/pro/agenda                           — agenda combinada (todos los offerings)
/pro/agenda/turnos/[appointmentToken] — turno detail con form para emitir eventos
/pro/perfil                           — perfil público del vet (qué ven los owners) (NUEVO)
/pro/setup                            — onboarding wizard primera vez (NUEVO)
```

---

## A. Componentes nuevos

### A.1 `<VetSetupWizard>` — onboarding primera vez

#### Descripción

Wizard 4 pasos para vet que recién obtuvo `professional.provider` capability. Lleva al vet desde "tengo la capability" a "estoy listo para recibir turnos".

#### Steps

| Step | Título | Acción |
|---|---|---|
| 1 | "Tus datos profesionales" | Matrícula provincial, especialidades, foto, descripción 100-500 char |
| 2 | "Tu ubicación de atención" | Domicilio (geocoded), ¿atendés a domicilio?, radio de cobertura |
| 3 | "Tus servicios" | Crea 2-4 servicios base (vacunación, control, esterilización, urgencia) con duración default + precio sugerido |
| 4 | "Tu agenda" | Define disponibilidad semanal (días + bloques horarios) |

#### Layout

`<FormPage>` + `<Stepper>` igual que el adoption wizard (spec 01). Persistencia en sessionStorage.

Después del setup, redirect a `/pro` con toast "¡Listo! Ya podés recibir turnos."

### A.2 `<VetProfile>` — perfil público

#### Descripción

Vista que ven los owners cuando consideran reservar con este vet. Combina datos profesionales + servicios + agenda preview.

#### Layout

```
<main>
  <Breadcrumb items={[{ label: "Vets", href: "/turnos/buscar?type=vet" }, { label: vet.displayName }]} />

  <Panel>
    <PanelHeader>
      <h1>Dr/a. {vet.displayName}</h1>
      <p className="lead">{vet.specialties.join(' · ')}</p>
    </PanelHeader>
    <PanelBody>
      <div className="grid md:grid-cols-[280px_1fr] gap-6">
        <div>
          <Image src={vet.photoUrl} alt={vet.displayName} width={280} height={280} />
          <dl className="meta">
            <dt>Matrícula</dt><dd>{vet.matricula}</dd>
            <dt>Atendiendo desde</dt><dd>{formatDate(vet.activeSince)}</dd>
            <dt>Verificado</dt><dd>{vet.verified ? '✓' : '—'}</dd>
          </dl>
        </div>
        <div>
          <h2>Sobre el profesional</h2>
          <p>{vet.description}</p>

          <h2>Servicios y precios</h2>
          <ul role="list">
            {vet.offerings.map(o => (
              <li key={o.id}>
                <strong>{o.name}</strong> · {o.duration_min} min · ${o.price_ars}
                <Button variant="primary" size="sm" href={`/turnos/buscar/${o.publicToken}`}>Reservar</Button>
              </li>
            ))}
          </ul>

          <h2>Ubicación</h2>
          <LocationMap point={vet.location} />
          <p>{vet.locality}, {vet.province}</p>
          {vet.atHome && <Badge>Atiende a domicilio en radio {vet.radiusKm} km</Badge>}
        </div>
      </div>
    </PanelBody>
  </Panel>
</main>
```

### A.3 `<ProDashboard>` — `/pro` home

#### Descripción

Dashboard del vet con vista del día + métricas semanales + accesos rápidos.

#### Layout

```
<main>
  <header>
    <h1>Hola, Dr/a. {firstName}</h1>
    <p className="lead">Hoy es {formatDate(today, 'EEEE d \'de\' MMMM')}</p>
  </header>

  <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <MetricCard label="Turnos hoy" value={todayCount} href="/pro/agenda?date=today" />
    <MetricCard label="Pendientes esta semana" value={weekCount} />
    <MetricCard label="Vacunaciones este mes" value={vaccsMonth} variant="success" />
    <MetricCard label="Servicios activos" value={offeringsCount} href="/pro/servicios" />
  </section>

  <Panel>
    <PanelHeader>
      <h2>Agenda de hoy</h2>
      <Button variant="link" href="/pro/agenda">Ver semana →</Button>
    </PanelHeader>
    <PanelBody>
      {todayAppointments.length === 0 ? (
        <EmptyState icon="calendar" title="Sin turnos hoy" description="Aprovechá para revisar pendientes o ajustar agenda." />
      ) : (
        <ul role="list">
          {todayAppointments.map(a => <AppointmentRow key={a.id} appointment={a} variant="dashboard" />)}
        </ul>
      )}
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Accesos rápidos</h2></PanelHeader>
    <PanelBody>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <TramiteCard icon="calendar-plus" title="Nuevo servicio" href="/pro/servicios/nuevo" />
        <TramiteCard icon="clock-edit" title="Editar agenda" href="/pro/agenda/editar" />
        <TramiteCard icon="vaccine" title="Aplicar vacuna walk-in" href="/pro/walkin?type=vaccination" />
        <TramiteCard icon="stethoscope" title="Registrar consulta" href="/pro/walkin?type=visit" />
        <TramiteCard icon="user" title="Mi perfil público" href="/pro/perfil" />
        <TramiteCard icon="settings" title="Configuración" href="/pro/configuracion" />
      </div>
    </PanelBody>
  </Panel>
</main>
```

### A.4 `<AppointmentRow>` — listado turnos

| Variant | Use when |
|---|---|
| `dashboard` | En `/pro` home — compact, solo info esencial |
| `list` | En `/pro/agenda` — extended con owner contact + pet quick links |
| `detail` | En `/pro/agenda/turnos/[token]` — header de la página |

Layout dashboard:

```
[Row]
  [Time 80px: "10:30 - 11:00"]
  [Pet identity row mini]
  [Service: {offering.name}]
  [Status pill: pending / confirmed / arrived / completed / cancelled / no_show]
  [Chevron-right]
```

### A.5 `<AppointmentDetailPanel>` — turno detail + emit events

#### Descripción

La pantalla más importante de `/pro`. El vet llega acá durante la visita y emite los eventos relevantes (vacuna, control, peso, dx). Diseñada para mobile-first porque muchas atenciones son a domicilio.

#### Layout

```
<main>
  <Breadcrumb items={[{ label: "Agenda", href: "/pro/agenda" }, { label: formatDate(a.scheduledAt, 'd MMM HH:mm') }]} />

  <Panel>
    <PanelHeader>
      <h1>Turno con {pet.name}</h1>
      <StatusPill status={a.status} />
    </PanelHeader>
    <PanelBody>
      <div className="meta-grid">
        <MetaItem icon="clock" label="Programado">{formatDateTime(a.scheduledAt)}</MetaItem>
        <MetaItem icon="user" label="Dueño/a">{owner.displayName}</MetaItem>
        <MetaItem icon="phone" label="Teléfono"><a href={`tel:${owner.phone}`}>{owner.phone}</a></MetaItem>
        <MetaItem icon="map-pin" label="Lugar">{a.locationDescription ?? 'En consultorio'}</MetaItem>
        <MetaItem icon="stethoscope" label="Servicio">{offering.name}</MetaItem>
      </div>

      <h2>Estado del turno</h2>
      <ButtonGroup>
        <Button variant={a.status === 'arrived' ? 'success' : 'secondary'} onClick={markArrived}>Llegó</Button>
        <Button variant={a.status === 'completed' ? 'success' : 'secondary'} onClick={markCompleted}>Atendido</Button>
        <Button variant="danger" onClick={openCancel}>No vino</Button>
      </ButtonGroup>
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader>
      <h2>Sobre {pet.name}</h2>
      <Link href={`/p/${pet.publicToken}`}>Ver credencial →</Link>
    </PanelHeader>
    <PanelBody>
      <PetIdentityRow pet={pet} />
      <dl className="meta-grid">
        <MetaItem icon="paw" label="Especie">{speciesLabel(pet.species)}</MetaItem>
        <MetaItem icon="ruler" label="Raza">{pet.breed}</MetaItem>
        <MetaItem icon="venus-mars" label="Sexo">{sexLabel(pet.sex)}</MetaItem>
        <MetaItem icon="calendar" label="Edad">{calculateAge(pet.dateOfBirth)}</MetaItem>
        <MetaItem icon="chip" label="Chip">{pet.microchipNumber ?? 'Sin chip'}</MetaItem>
        <MetaItem icon="weight" label="Último peso">{lastWeight} ({formatRelativeDate(lastWeightDate)})</MetaItem>
      </dl>

      {alerts.length > 0 && (
        <Alert variant="warning" title="Alertas en la libreta">
          <ul>
            {alerts.map(a => <li key={a.code}>{a.message}</li>)}
          </ul>
        </Alert>
      )}
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader>
      <h2>Registrar eventos</h2>
      <p className="helper">Lo que registres acá queda en la libreta de {pet.name} firmado por vos.</p>
    </PanelHeader>
    <PanelBody>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickEventButton icon="vaccine" label="Vacuna" href={`./eventos/vacuna?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="weight" label="Peso" href={`./eventos/peso?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="stethoscope" label="Consulta" href={`./eventos/vet?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="pill" label="Medicación" href={`./eventos/medicacion?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="microscope" label="Estudios" href={`./eventos/clinico?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="cut" label="Esterilización" href={`./eventos/esterilizacion?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="bug" label="Síntoma" href={`./eventos/sintoma?pet=${pet.id}&apt=${a.id}`} />
        <QuickEventButton icon="notes" label="Nota" href={`./eventos/nota?pet=${pet.id}&apt=${a.id}`} />
      </div>
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader>
      <h2>Eventos registrados en este turno</h2>
    </PanelHeader>
    <PanelBody>
      {eventsThisAppointment.length === 0 ? (
        <EmptyState icon="file" title="Todavía no registraste nada" description="Usá los accesos rápidos arriba." />
      ) : (
        <ul role="list">
          {eventsThisAppointment.map(e => <EventRow key={e.id} event={e} />)}
        </ul>
      )}
    </PanelBody>
  </Panel>
</main>
```

### A.6 `<QuickEventButton>`

Tile grande tap-friendly para mobile (min 88×88).

```
<Link href={href} className="tile" aria-label={`Registrar ${label}`}>
  <Icon name={icon} size={32} />
  <span>{label}</span>
</Link>
```

### A.7 `<OfferingForm>` — crear/editar servicio

```
<FormPage title={editing ? `Editar ${offering.name}` : "Nuevo servicio"}>
  <FormSection title="Datos básicos">
    <Field label="Nombre del servicio" required helper="Ej: Vacunación antirrábica, Control general, Esterilización">
      <Input name="name" maxLength={80} />
    </Field>
    <Field label="Descripción">
      <Textarea name="description" rows={3} maxLength={500} />
    </Field>
    <Field label="Tipo" required>
      <Select name="kind">
        <option value="vaccination">Vacunación</option>
        <option value="visit">Consulta</option>
        <option value="sterilization">Esterilización</option>
        <option value="emergency">Urgencia</option>
        <option value="other">Otro</option>
      </Select>
    </Field>
  </FormSection>

  <FormSection title="Duración y precio">
    <Field label="Duración (minutos)" required>
      <Input name="duration_min" type="number" min={5} max={240} step={5} defaultValue={30} />
    </Field>
    <Field label="Precio (ARS)" helper="Dejá vacío para 'A consultar'">
      <Input name="price_ars" type="number" min={0} />
    </Field>
  </FormSection>

  <FormSection title="Disponibilidad" description="Después de crear el servicio podés definir tu agenda específica.">
    <Field label="¿Activo?">
      <Switch name="active" defaultChecked />
    </Field>
  </FormSection>

  <FormPage.Actions>
    <Button variant="link" type="button">Cancelar</Button>
    <Button variant="primary" type="submit">{editing ? "Guardar" : "Crear servicio"}</Button>
  </FormPage.Actions>
</FormPage>
```

### A.8 `<ScheduleRulesEditor>` — define disponibilidad semanal

```
<FormPage title="Agenda de {offering.name}">
  <Panel>
    <PanelHeader><h2>Bloques de disponibilidad</h2></PanelHeader>
    <PanelBody>
      [Por cada día de la semana:]
      <WeekdayBlock day="monday" blocks={blocks.monday} onAdd={addBlock} onRemove={removeBlock} />
      <WeekdayBlock day="tuesday" ... />
      [...]
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Excepciones</h2></PanelHeader>
    <PanelBody>
      <p>Días puntuales donde NO atendés (feriados, vacaciones).</p>
      <DateRangePicker name="exceptions" multiple />
    </PanelBody>
  </Panel>

  <Panel>
    <PanelHeader><h2>Vista previa próximas 2 semanas</h2></PanelHeader>
    <PanelBody>
      <SlotsPreview rules={currentRules} weeks={2} />
    </PanelBody>
  </Panel>

  <FormPage.Actions>
    <Button variant="primary" type="submit">Guardar agenda</Button>
  </FormPage.Actions>
</FormPage>
```

`<WeekdayBlock>`:

```
<fieldset>
  <legend>{dayLabel(day)}</legend>
  <Switch name={`${day}_active`} defaultChecked={blocks.length > 0} />
  {blocks.map((b, i) => (
    <div key={i} className="time-range">
      <Input type="time" name={`${day}_${i}_from`} defaultValue={b.from} />
      <span>a</span>
      <Input type="time" name={`${day}_${i}_to`} defaultValue={b.to} />
      <Button variant="link" iconLeft="x" size="sm" onClick={() => onRemove(day, i)} aria-label="Quitar bloque" />
    </div>
  ))}
  <Button variant="secondary" size="sm" iconLeft="plus" onClick={() => onAdd(day)}>Agregar bloque</Button>
</fieldset>
```

### A.9 `<AgendaWeekView>` — `/pro/agenda`

#### Descripción

Vista semanal de la agenda. Mobile: lista vertical por día. Desktop: grid 7 columnas × 24h.

#### Layout mobile

```
[Date navigator: ← Semana del 18 al 24 → / Hoy]

<details open>
  <summary>Lunes 18 (3 turnos)</summary>
  [Lista de AppointmentRow variant="list"]
</details>
[Continúa por día...]
```

#### Layout desktop

```
[Date navigator + view toggle: Día | Semana | Mes]

<div className="agenda-grid">
  [Header: 7 columnas con día + fecha]
  [Body: 24h vertical con turnos absolute positioned]
</div>
```

### A.10 `<WalkInForm>` — `/pro/walkin`

#### Descripción

Atender un walk-in (sin appointment previo). El vet ingresa el chip / token del pet, lo identifica, y registra eventos directamente.

```
<FormPage title="Atención sin turno previo">
  <FormSection title="Identificar mascota">
    <Field label="Microchip o token público" helper="Ingresá uno de los dos para buscar al pet">
      <Input name="lookup" placeholder="985... o DIM-..." />
      <Button variant="secondary" size="sm">Buscar</Button>
    </Field>
  </FormSection>

  {found && (
    <Panel>
      <PanelBody>
        <PetIdentityRow pet={pet} />
        <p>Dueño: {owner.displayName} ({owner.phone})</p>
        <Button variant="primary" href={`/pro/agenda/turnos/walkin/${pet.publicToken}`}>Atender a {pet.name}</Button>
      </PanelBody>
    </Panel>
  )}

  {!found && lookup && (
    <Alert variant="warning">
      No encontramos un pet con esos datos. Si es la primera vez del pet en MiMAR, pedile al
      dueño que la registre primero — toma 2 minutos en /mis-mascotas/nueva.
    </Alert>
  )}
</FormPage>
```

---

## B. Pantallas

Las pantallas son las descritas arriba con los componentes correspondientes. Resumen:

| Ruta | Componente principal |
|---|---|
| `/pro` | `<ProDashboard>` (A.3) |
| `/pro/setup` | `<VetSetupWizard>` (A.1) |
| `/pro/perfil` | `<VetProfile>` (A.2) — versión editable |
| `/pro/servicios` | Lista de `<OfferingCard>` |
| `/pro/servicios/nuevo` y `/[token]` | `<OfferingForm>` (A.7) |
| `/pro/servicios/[token]/agenda` | `<ScheduleRulesEditor>` (A.8) |
| `/pro/agenda` | `<AgendaWeekView>` (A.9) |
| `/pro/agenda/turnos/[appointmentToken]` | `<AppointmentDetailPanel>` (A.5) |
| `/pro/walkin` | `<WalkInForm>` (A.10) |

---

## C. Authorship de eventos

Cuando el vet `/pro` emite un evento, `lib/event-authorship.ts` setea:

- `author_role = 'vet'`
- `author_organization_id = null` (independiente)
- `author_verified = vet.verified`
- `recorded_by_user_id = vet.id`

Esto se diferencia del vet en clínica (`/org/[orgToken]`) que setea `author_organization_id = org.id`. La libreta del pet muestra ambos correctamente: "Dr. García (Independiente, ✓ verificado)" vs "Clínica X · Dr. García".

---

## D. Edge cases

| Caso | Decisión |
|---|---|
| Vet pierde `professional.provider` mid-flow | Server actions rechazan con error claro + link a `/cuenta/upgrade` |
| Vet no completó setup pero accede a `/pro/agenda` | Redirect a `/pro/setup` con banner "Completá la configuración antes de recibir turnos" |
| Walk-in con pet sin chip ni token registrado | Form muestra Alert "Pet no encontrada" + CTA "Registrá la mascota primero" (link al dueño con un QR a `/mis-mascotas/nueva`) |
| Owner cancela turno mientras el vet lo abre | Real-time update via revalidatePath + toast "El dueño canceló este turno" |
| Vet emite vacuna pero olvida cerrar el turno | Cron diario detecta turnos pasadas las 24h sin status final y notifica al vet "Cerrá tus turnos pendientes" |

---

## E. Resumen archivos a crear

| Archivo | Propósito |
|---|---|
| `app/pro/page.tsx` | A.3 ProDashboard |
| `app/pro/setup/page.tsx` + steps | A.1 wizard |
| `app/pro/perfil/page.tsx` + edit form | A.2 |
| `app/pro/agenda/page.tsx` | A.9 |
| `app/pro/agenda/AppointmentRow.tsx` | A.4 |
| `app/pro/agenda/turnos/[appointmentToken]/AppointmentDetailPanel.tsx` | A.5 |
| `app/pro/agenda/turnos/[appointmentToken]/QuickEventButton.tsx` | A.6 |
| `app/pro/servicios/[offeringToken]/OfferingForm.tsx` | A.7 |
| `app/pro/servicios/[offeringToken]/agenda/ScheduleRulesEditor.tsx` | A.8 |
| `app/pro/servicios/[offeringToken]/agenda/WeekdayBlock.tsx` | A.8 sub |
| `app/pro/walkin/page.tsx` | A.10 |
