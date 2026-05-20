# 02 — Foster volunteers pool · design spec (handoff)

> Spec handoff-ready para el pool global de voluntarios de tránsito (owner→refugio). Cubre las 4 fases A/B/C/D del plan `docs/superpowers/plans/2026-05-18-foster-volunteers-pool.md`.

## Audiencias y journeys

| Audiencia | Journey | Surfaces |
|---|---|---|
| **Owner voluntario prospecto** | enrollment con pre-check (DNI + display_name + phone) → preferences → slots → espera propuestas | `/cuenta/ofrecerme-como-transito`, `/cuenta/transitos/*` |
| **Voluntario activo** | recibe propuesta → acepta/rechaza → cuida pet → cierra al final → opción "volver al pool" | `/cuenta/transitos/propuestas`, `/cuenta/transitos/propuestas/[proposalToken]`, `/cuenta/transitos/activos`, `/cuenta/transitos/historial` |
| **Org coordinator** | busca pool con filtros → ve match warnings → propone → espera respuesta → al accept materializa foster | `/org/[orgToken]/voluntarios`, `/org/[orgToken]/voluntarios/propuestas`, `/org/[orgToken]/transitos` (surface unificado) |

## Sitemap

```
/cuenta/ofrecerme-como-transito                  — enrollment + edit preferences (existe parcial)
/cuenta/transitos                                — hub: tabs activos / propuestas / historial (NUEVO)
/cuenta/transitos/activos                        — pets que cuido ahora
/cuenta/transitos/propuestas                     — propuestas pendientes de respuesta
/cuenta/transitos/propuestas/[proposalToken]     — accept/reject screen
/cuenta/transitos/historial                      — pasados (resueltos)
/org/[orgToken]/voluntarios                      — browse pool con filters
/org/[orgToken]/voluntarios/[volunteerId]        — voluntario detail (NUEVO)
/org/[orgToken]/voluntarios/[volunteerId]/proponer — propose pet specific to this volunteer (NUEVO)
/org/[orgToken]/voluntarios/propuestas           — propuestas emitidas por la org
/org/[orgToken]/transitos                        — surface unificado (member-based + voluntary pool + vecino)
/org/[orgToken]/pets/no-aptas                    — pets eligibility=false con motivo estructurado
```

---

## A. Componentes nuevos / extendidos

### A.1 `<VolunteerEnrollmentForm>`

#### Descripción

Form de inscripción al pool. Pre-check D13 (DNI verificado + display_name + phone). Si falta algo, mostrar checklist con CTA específico por item antes del form principal.

#### Layout

```
<FormPage title="Ofrecerme como hogar de tránsito" lead="Inscribite en el pool de voluntarios. Los refugios cerca tuyo te van a poder proponer tránsitos según tus preferencias.">

  {!ready && (
    <PreCheckChecklist checks={checks} />
  )}

  {ready && (
    <>
      <FormSection title="Tu disponibilidad">
        <Field label="¿Cuántas mascotas podés alojar simultáneamente?" required helper="Cada inscripción al pool suma 1 slot. Podés inscribirte varias veces si tenés capacidad para más.">
          <Input name="initial_slots" type="number" min={1} max={5} defaultValue={1} />
        </Field>
        <Field label="Estado" required>
          <RadioGroup name="status" defaultValue="active">
            <Radio value="active" label="Activo — quiero recibir propuestas" />
            <Radio value="paused" label="Pausado — me anoto pero todavía no" />
          </RadioGroup>
        </Field>
      </FormSection>

      <FormSection title="Tus preferencias" description="Los refugios usan esto para proponerte tránsitos compatibles. No es bloqueante: si propusieran algo fuera de tus preferencias, recibís un aviso y vos decidís.">
        <Field label="Especies que estás dispuesto a recibir" required>
          <CheckboxGroup name="accepts_species" required>
            <Checkbox value="dog" label="Perros" />
            <Checkbox value="cat" label="Gatos" />
          </CheckboxGroup>
        </Field>

        <Field label="Tamaños">
          <CheckboxGroup name="accepts_sizes">
            <Checkbox value="small" label="Chico (< 10 kg)" />
            <Checkbox value="medium" label="Mediano (10–25 kg)" />
            <Checkbox value="large" label="Grande (25–40 kg)" />
            <Checkbox value="xl" label="Extra grande (> 40 kg)" />
          </CheckboxGroup>
        </Field>

        <Field label="¿Hasta cuántas semanas podés cuidar?" helper="Tránsitos típicos: 2-8 semanas. Dejá vacío si no tenés tope.">
          <Input name="max_weeks" type="number" min={1} max={52} />
        </Field>

        <Field label="¿Cachorros / gatitos chiquitos?" helper="Requieren alimentación frecuente y mayor cuidado.">
          <RadioGroup name="accepts_baby">
            <Radio value="yes" label="Sí" />
            <Radio value="no" label="No" />
          </RadioGroup>
        </Field>

        <Field label="¿Razas potencialmente peligrosas (PPP)?" helper="Ley CABA 4078 / Ley Prov 14.107. Implica responsabilidad legal adicional.">
          <RadioGroup name="accepts_dangerous_breeds">
            <Radio value="no" label="No" />
            <Radio value="yes" label="Sí — entiendo la responsabilidad legal" />
          </RadioGroup>
          {/* Si selecciona yes, muestra disclaimer en <Alert variant="warning"> */}
        </Field>

        <Field label="Otras restricciones / notas para el refugio" helper="Ej: 'No puedo con animales medicados', 'Prefiero hembras'. Va a ser visible en el pool.">
          <Textarea name="notes" rows={3} maxLength={300} />
        </Field>
      </FormSection>

      <FormSection title="Tu zona" description="Opcional. Si la dejás vacía, podés recibir propuestas de cualquier localidad.">
        <LocalityField name="locality_preferred" />
      </FormSection>

      <FormPage.Actions>
        <Button variant="link" href="/cuenta">Cancelar</Button>
        <Button variant="primary" type="submit">Inscribirme</Button>
      </FormPage.Actions>
    </>
  )}
</FormPage>
```

#### `<PreCheckChecklist>` — sub-componente

```
<Panel variant="alert">
  <PanelHeader><h2>Antes de inscribirte</h2></PanelHeader>
  <PanelBody>
    <ul role="list">
      <ChecklistItem ok={checks.isPersonalOwner} label="Cuenta personal de owner" cta={null} />
      <ChecklistItem ok={checks.dniVerified} label="DNI verificado" cta="Verificá tu DNI →" ctaHref="/cuenta/verificar-dni" />
      <ChecklistItem ok={checks.hasDisplayName} label="Nombre completo" cta="Completar perfil →" ctaHref="/cuenta/editar" />
      <ChecklistItem ok={checks.hasPhone} label="Teléfono de contacto" cta="Agregar teléfono →" ctaHref="/cuenta/editar" />
    </ul>
    <p className="helper">Los refugios necesitan estos datos para confiar en quien recibe a sus animales.</p>
  </PanelBody>
</Panel>
```

#### Estados

| State | UI |
|---|---|
| Pre-check pendiente | Solo `<PreCheckChecklist>` visible. Botón Inscribirme oculto. |
| Pre-check OK, primera vez | Form completo con defaults sugeridos. |
| Editing (ya inscripto) | Form pre-poblado. Header dice "Editá tus preferencias". Botón submit dice "Guardar cambios". Aparece nuevo CTA "Retirarme del pool" (link variant, en footer). |
| Submitting | Spinner en botón, disable form. |
| Success | Toast "Listo, estás en el pool. Te avisamos por mail cuando un refugio te proponga un tránsito." + redirect a `/cuenta/transitos`. |
| Error | `<Alert variant="danger">` arriba con error del server. |

#### Copy adicional

| Elemento | Texto |
|---|---|
| PPP disclaimer | "Las razas PPP requieren atestación legal en CABA y Prov. BA. Como foster sos responsable solidario durante el tránsito. Solo aceptá si tenés experiencia previa con razas grandes y conocés la normativa." |
| Withdrawal confirm | "¿Retirarte del pool? Las propuestas pendientes quedan canceladas y tus tránsitos activos siguen hasta cerrarse. Podés volver a inscribirte cuando quieras." |
| After withdrawal | "Te retiramos del pool. Gracias por haber participado. Los tránsitos activos siguen en `/cuenta/transitos/activos`." |

---

### A.2 `<ProposalReviewPanel>` — voluntario acepta/rechaza

#### Descripción

Pantalla `/cuenta/transitos/propuestas/[proposalToken]`. Muestra pet, refugio, contexto, expected weeks, notas, match warnings (si alguno), y los dos botones de decisión.

#### Layout

```
<main>
  <Breadcrumb items={[{ label: "Mis tránsitos", href: "/cuenta/transitos" }, { label: "Propuesta de tránsito" }]} />

  <Panel>
    <PanelHeader>
      <h1>Propuesta de tránsito</h1>
      <ProposalStatusBadge status={proposal.status} />
    </PanelHeader>
    <PanelBody>
      <PetIdentityCard pet={pet} compact={false} />

      <div className="meta-grid">
        <MetaItem icon="building" label="Refugio">
          <Link href={`/refugios/${org.publicToken}`}>{org.displayName}</Link>
        </MetaItem>
        <MetaItem icon="calendar" label="Duración estimada">
          {proposal.expectedWeeks ? `${proposal.expectedWeeks} semanas` : "Sin tope definido"}
        </MetaItem>
        <MetaItem icon="map-pin" label="Localidad del refugio">
          {org.locality}, {org.province}
        </MetaItem>
        <MetaItem icon="clock" label="Expira">
          <time dateTime={proposal.expiresAt.toISOString()}>
            {formatRelativeDate(proposal.expiresAt)} {/* "en 5 días" */}
          </time>
        </MetaItem>
      </div>

      {proposal.contextNotes && (
        <section>
          <h2>Mensaje del refugio</h2>
          <blockquote>{proposal.contextNotes}</blockquote>
        </section>
      )}

      {warnings.length > 0 && (
        <Alert variant="warning" icon="alert-triangle" title="Esta propuesta cruza algunas de tus preferencias">
          <ul role="list">
            {warnings.map(w => <li key={w.code}>{w.message}</li>)}
          </ul>
          <p>El refugio sabe esto y te lo propone igual. Vos decidís.</p>
        </Alert>
      )}
    </PanelBody>
  </Panel>

  {proposal.status === 'pending' && (
    <Panel>
      <PanelHeader><h2>Tu decisión</h2></PanelHeader>
      <PanelBody>
        <p>Si aceptás, {pet.name} pasa a tu cuidado oficialmente. Vas a poder registrar todo lo que pase con ella (peso, vacunas, visitas al vet) como si fuera tuya. Cuando llegue el momento, vas a poder devolverla al refugio o, si el caso lo amerita, postularte para adoptarla.</p>

        <div className="actions">
          <Button variant="link" onClick={openReject}>No puedo</Button>
          <Button variant="success" iconLeft="check" onClick={openAccept}>Aceptar tránsito</Button>
        </div>
      </PanelBody>
    </Panel>
  )}

  {proposal.status === 'accepted' && (
    <Alert variant="success">
      Aceptaste el tránsito el {formatDate(proposal.respondedAt)}. {pet.name} está en tu lista en
      <Link href={`/mis-mascotas/${pet.publicToken}`}> Mis mascotas</Link>.
    </Alert>
  )}

  {/* etc. para rejected / cancelled / expired */}
</main>
```

#### Accept modal — co-foster opt-in (D17)

```
<ConfirmDialog
  title="Confirmar aceptación"
  description={`Estás por aceptar el tránsito de ${pet.name} con ${org.displayName}.`}
  variant="success"
  confirmLabel="Sí, aceptar"
  cancelLabel="Volver"
  extraField={
    <Field label="Co-fostering">
      <Checkbox name="allow_co_foster" defaultChecked={false}>
        Permito que {org.displayName} le asigne otro foster más a {pet.name}.
      </Checkbox>
      <p className="helper">Útil si vivís en pareja y queren compartir el cuidado, o si el refugio
      necesita backup en caso de imprevisto. Default: no.</p>
    </Field>
  }
  onConfirm={async (extra) => {
    const result = await acceptFosterProposalAction({
      proposalToken,
      allowCoFoster: extra.allow_co_foster === 'on',
    });
    if (result.ok) {
      toast.success(`Aceptaste el tránsito. ${pet.name} ya está en tu lista.`);
      router.push(`/mis-mascotas/${pet.publicToken}`);
    } else {
      toast.error(result.error);
    }
  }}
/>
```

#### Reject modal

```
<Modal title="Rechazar propuesta">
  <p>¿Por qué no podés tomar el tránsito de {pet.name}?</p>
  <Field label="Motivo" required>
    <Select name="rejection_reason">
      <option value="no_capacity_now">Sin capacidad ahora</option>
      <option value="not_a_match">No me cierra el perfil</option>
      <option value="distance">Está muy lejos</option>
      <option value="ppp_concern">No me animo con esa raza</option>
      <option value="other">Otro motivo</option>
    </Select>
  </Field>
  <Field label="Comentario adicional (opcional)">
    <Textarea name="rejection_notes" rows={2} maxLength={300} />
  </Field>
  [Actions]
</Modal>
```

---

### A.3 `<VolunteerSearchPanel>` — org browse pool

#### Descripción

`/org/[orgToken]/voluntarios`. Tabla server-rendered con filtros (especies, tamaños, zona, slots disponibles, accepts_dangerous_breeds, accepts_baby). Match score visible si tenés un pet contextual seleccionado.

#### Layout

```
<main>
  <Breadcrumb items={[{ label: org.displayName, href: ... }, { label: "Voluntarios" }]} />
  <h1>Voluntarios en el pool</h1>
  <p className="lead">Personas que ofrecen su casa para tránsitos. Filtralos por preferencias y proponé una mascota concreta.</p>

  <TableFilters action={`/org/${orgToken}/voluntarios`}>
    <Field label="Especie">
      <Select name="species"><option value="">Cualquiera</option><option>dog</option><option>cat</option></Select>
    </Field>
    <Field label="Tamaño">
      <Select name="size"><option value="">Cualquiera</option>...</Select>
    </Field>
    <Field label="Zona">
      <LocalityField name="locality" />
    </Field>
    <Field label="Acepta PPP">
      <Select name="dangerous_breeds"><option>Indiferente</option><option>Sí</option><option>No</option></Select>
    </Field>
    <Field label="Disponibilidad">
      <Select name="status"><option>Activo (con slots)</option><option>Pausado</option><option>Todos</option></Select>
    </Field>
    <Field label="Para esta mascota (opcional)">
      <Select name="contextPetToken">
        <option value="">— Sin pet específica —</option>
        {/* pets de la org en shelter_custody con eligibility=true */}
      </Select>
    </Field>
  </TableFilters>

  {volunteers.length === 0 ? (
    <EmptyState
      icon="users"
      title="No hay voluntarios que coincidan"
      description="Probá relajar los filtros o esperá: el pool crece todo el tiempo."
      action={null}
    />
  ) : (
    <Panel>
      <PanelBody>
        <ul role="list" className="volunteer-list">
          {volunteers.map(v => <VolunteerListItem key={v.id} volunteer={v} contextPet={contextPet} />)}
        </ul>
        <Pagination cursor={nextCursor} />
      </PanelBody>
    </Panel>
  )}
</main>
```

### A.4 `<VolunteerListItem>`

```
[Card row]
  [Avatar 56×56]
  [Block:
    {displayName} <MatchScoreBadge score={score} warnings={warnings} />  (si contextPet definido)
    {locality_preferred ?? 'Sin zona definida'} · {available_slots} slots
    Acepta: {species.join(', ')} · {sizes.join(', ')}
    {notes && <em>{notes}</em>}
  ]
  [Actions:
    <Button variant="secondary" size="sm" href={`/voluntarios/${id}`}>Ver detalle</Button>
    <Button variant="primary" size="sm" href={`/voluntarios/${id}/proponer?petToken=${contextPet?.publicToken}`}>Proponer mascota</Button>
  ]
```

### A.5 `<MatchScoreBadge>`

#### Descripción

Pill que muestra score numérico + tooltipped warnings cuando hay mismatches con un pet contextual. Score: porcentaje de match hard (especie+tamaño+slots) y warnings para soft (PPP, locality, etc.).

#### Variants

| Score range | Color | Label |
|---|---|---|
| 80-100% | `bg-gob-success/15 text-gob-success` | "Match excelente" |
| 50-79% | `bg-gob-info/15 text-gob-info` | "Match parcial" |
| 0-49% | `bg-gob-warning/15 text-gob-warning-text` | "Match con avisos" |

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `score` | `number 0-100` | required | % de match |
| `warnings` | `Array<{code, message}>` | `[]` | Lista de avisos |
| `size` | `'sm' \| 'md'` | `'sm'` | |

#### Accesibilidad

- Botón role="button" con `aria-describedby` al tooltip.
- Tooltip se abre con focus y con `:hover`.
- En mobile sin hover, el tap abre un `<Popover>` con la lista de warnings.

---

### A.6 `<ProposePetForm>`

#### Descripción

Form `/org/[orgToken]/voluntarios/[volunteerId]/proponer`. Selecciona pet, ingresa expected_weeks + context_notes. Muestra warnings en vivo según el match.

#### Layout

```
<FormPage title={`Proponer tránsito a ${volunteer.displayName}`}>
  <Field label="Mascota a proponer" required>
    <Select name="petToken">
      <option value="">— Elegí una mascota —</option>
      {/* pets en shelter_custody con eligibility=true */}
    </Select>
  </Field>

  {selectedPet && (
    <MatchPreview pet={selectedPet} volunteer={volunteer} warnings={warnings} />
  )}

  <Field label="Duración estimada (semanas)" helper="Aprox. Si no sabés todavía, dejá vacío.">
    <Input name="expected_weeks" type="number" min={1} max={52} />
  </Field>

  <Field label="Mensaje al voluntario" required helper="Contale brevemente quién es la mascota y por qué pensaste en él/ella. 200-500 caracteres.">
    <Textarea name="context_notes" rows={5} minLength={50} maxLength={500} required />
  </Field>

  <FormPage.Actions>
    <Button variant="link" href={`/voluntarios/${volunteer.id}`}>Cancelar</Button>
    <Button variant="primary" type="submit">Enviar propuesta</Button>
  </FormPage.Actions>
</FormPage>
```

#### MatchPreview

Si hay warnings, mostrar `<Alert variant="warning">` enumerando cada uno con tono educativo:

```
Atención: esta propuesta cruza algunas preferencias del voluntario.

· Tamaño "grande" no está en sus preferencias declaradas (acepta chico, mediano).
· La mascota es PPP. El voluntario no marcó accepts_dangerous_breeds.

El voluntario va a ver estos avisos antes de aceptar. Si todavía querés proponer, escribí
en el mensaje por qué pensás que igual es un buen match.
```

---

### A.7 `<TransitosHub>` — `/cuenta/transitos`

Hub central del voluntario. Tabs (route segments por DP6):

```
[H1: Mis tránsitos]

<Tabs>
  <Tab href="/cuenta/transitos/activos" badge={activeCount}>Activos</Tab>
  <Tab href="/cuenta/transitos/propuestas" badge={pendingCount}>Propuestas</Tab>
  <Tab href="/cuenta/transitos/historial">Historial</Tab>
</Tabs>

[Children render por route]

<Panel>
  <PanelHeader><h2>Mi disponibilidad</h2></PanelHeader>
  <PanelBody>
    <p>Slots disponibles: {availableSlots}</p>
    <p>Estado: <StatusPill status={volunteer.status} /></p>
    <Button variant="secondary" size="sm" href="/cuenta/ofrecerme-como-transito">Editar preferencias</Button>
  </PanelBody>
</Panel>
```

### A.8 `<TransitoActivoCard>` — en `/cuenta/transitos/activos`

```
[Card]
  [Pet identity row]
  [Meta: {pet.species}, {pet.age_bucket}, {pet.size_estimate}]
  [Refugio: {org.displayName}]
  [Active since: {fosterAssignedAt}]
  [Co-foster: {allow_co_foster ? "Permitido" : "No permitido"}]

  [Actions: <Button href={`/mis-mascotas/${pet.publicToken}`}>Ver libreta</Button> | <Button variant="secondary" onClick={openEndFoster}>Terminar tránsito</Button>]
```

### A.9 `<EndFosterDialog>`

```
<Modal title={`Terminar tránsito de ${pet.name}`}>
  <p>¿Por qué terminás el tránsito?</p>
  <Field label="Motivo" required>
    <Select name="end_reason">
      <option value="returned">La devuelvo al refugio</option>
      <option value="other_completion">Otra finalización</option>
    </Select>
  </Field>
  <Field label="Notas">
    <Textarea name="end_notes" rows={3} maxLength={300} />
  </Field>
  <p className="helper">Si la querés adoptar, no termines el tránsito acá. Postulate desde la página de la mascota.</p>
  [Actions: Volver / Terminar]
</Modal>
```

Al cerrar, prompt-first (D16) en notificación: "Tu tránsito de {pet.name} terminó. ¿Querés volver al pool para recibir nuevas propuestas?" + 2 botones [Sí, sumar +1 slot] [Ahora no].

---

## B. Pantallas — detail

### B.1 `/cuenta/ofrecerme-como-transito` — ver A.1

### B.2 `/cuenta/transitos` (hub) y sub-rutas — ver A.7, A.8

### B.3 `/cuenta/transitos/propuestas/[proposalToken]` — ver A.2

### B.4 `/org/[orgToken]/voluntarios` — ver A.3

### B.5 `/org/[orgToken]/voluntarios/[volunteerId]` (detail)

```
[Breadcrumb: Voluntarios › {displayName}]

<Panel>
  <PanelHeader>
    <h1>{displayName}</h1>
    <StatusPill status={volunteer.status} />
  </PanelHeader>
  <PanelBody>
    [Meta grid: locality, slots, accepted species/sizes, accepts_baby, accepts_dangerous_breeds, max_weeks]
    [Notes en blockquote]
    [DNI verified: ✓ desde {date}]
    [Phone visible al coordinator: {phone}]
    [Histórico en plataforma: N fosters completados con avg duration X, Y aceptaciones / Z rechazos]
  </PanelBody>
</Panel>

<Panel>
  <PanelHeader><h2>Acciones</h2></PanelHeader>
  <PanelBody>
    <Button variant="primary" href={`./proponer`}>Proponer mascota</Button>
    <Button variant="secondary" href={`/casos?subject_user=${volunteerId}`}>Ver casos relacionados</Button>
  </PanelBody>
</Panel>

<Panel>
  <PanelHeader><h2>Tránsitos previos con tu org</h2></PanelHeader>
  <PanelBody>
    {previous.length > 0 ? <PreviousFostersTimeline items={previous} /> : <EmptyState ...>}
  </PanelBody>
</Panel>
```

### B.6 `/org/[orgToken]/transitos` — surface unificado

Tabla con filtro de origen:

| Pet | Foster | Origen | Iniciado | Co-foster | Estado | Actions |
|---|---|---|---|---|---|---|
| Negrita | Ana López | Pool voluntario | 12/05/2026 | No | Activo | Ver, Terminar |
| Pipo | Juan Perez (member) | Member-based | 03/04/2026 | Sí (Marta) | Activo | Ver, Terminar |
| Bicho | Liliana (vecina) | Vecino-en-tránsito | 18/05/2026 | — | Activo | Ver, Coordinar entrega |

Filtros: origen, estado (activo/cerrado), pet species, fecha desde-hasta.

### B.7 `/org/[orgToken]/pets/no-aptas`

Lista de pets con `adoption_eligible = false`. Cada item muestra el motivo estructurado (`medical_treatment`, `behavioral`, `quarantine`, `legal_hold`, `recovery`, `other`) y notas. CTA "Marcar como apta" cuando corresponda.

```
[Filter pills: Todos · Médico · Conducta · Cuarentena · Legal · Otro]

<ul role="list">
  {pets.map(p => (
    <PetCard variant="ineligible" key={p.id}>
      <PetIdentityRow pet={p} />
      <EligibilityPill reason={p.adoption_ineligible_reason} since={p.adoption_eligibility_set_at} />
      {p.adoption_ineligibility_notes && <p>{p.adoption_ineligibility_notes}</p>}
      <Button variant="secondary" size="sm" href={`/mascotas/${p.publicToken}/eligibility`}>Cambiar eligibility</Button>
    </PetCard>
  ))}
</ul>
```

---

## C. Estados del case `foster_placement`

```
                  foster_proposal_resolved (accepted) ─┐
                                                       │
                                                       ▼
                                                ┌───────────┐
                                                │  active   │
                                                └───────────┘
                                                       │
                          ┌────────────────────────────┼─────────────────────────┐
                          │                            │                         │
                  foster_ended (returned)   adoption_finalized           death_recorded
                          │                            │                         │
                          ▼                            ▼                         ▼
                  ┌──────────────────┐         ┌──────────────────┐    ┌──────────────────┐
                  │ closed_returned  │         │ closed_adopted   │    │ closed_pet_died  │
                  └──────────────────┘         └──────────────────┘    └──────────────────┘
```

## D. Notification matrix

| Evento | Recipient | Title | Body | CTA |
|---|---|---|---|---|
| Proposal received | Volunteer | "{Org} te propone un tránsito" | "Querés cuidar a {pet.name} durante {expectedWeeks} semanas?" | `/cuenta/transitos/propuestas/{proposalToken}` |
| Proposal accepted | Org coordinators | "{Volunteer} aceptó el tránsito de {pet.name}" | (opt: cofoster status) | `/org/.../transitos` |
| Proposal rejected | Org coordinators (opcional segun org settings) | "{Volunteer} rechazó la propuesta" | "Motivo: {reason}" | `/voluntarios/{id}` |
| Cascade auto-cancel (D18) | Otras orgs con proposal pending al mismo voluntario | "{Volunteer} aceptó otro tránsito" | "Tu propuesta para {pet.name} se canceló. {Volunteer} se completó la capacidad." | `/voluntarios` |
| Foster ended (manual) | Foster + Org coordinators | "Tránsito de {pet.name} cerrado" | "Motivo: {reason}. Gracias por cuidar a {pet.name}!" | `/cuenta/transitos/historial` |
| Re-enroll prompt (D16) | Volunteer | "Tu tránsito de {pet.name} terminó. ¿Volvés al pool?" | "Si querés recibir nuevas propuestas, sumá +1 slot." | inline 2-button notification |
| Proposal expired (cron 7d) | Org coordinators | "Tu propuesta venció" | "{Volunteer} no respondió en 7 días. Podés proponerla a otro voluntario." | `/voluntarios` |

---

## E. Edge cases

| Caso | Decisión |
|---|---|
| Voluntario withdraws con tránsitos activos | Los tránsitos siguen hasta cerrarse normalmente. Status del voluntario pasa a `withdrawn`. Propuestas pending se cancelan. |
| Org pierde verification mid-proposal | Las propuestas pending se cancelan automáticamente. Notificación al voluntario. |
| Voluntario accepta propuesta pero la pet murió antes (race) | Server action valida `pet.status != 'deceased'` en el tx. Si murió en el ínterin, rechazar con error visible "Esta mascota lamentablemente falleció. La propuesta fue cancelada." |
| Pet en cuarentena de rabia recibe propuesta | Server-side check `rabies_observation_status='active'` bloquea propose. UI muestra error claro. |
| Voluntario en pausa recibe propuesta (race) | Hidden de search pero la URL directa al propose form rechaza. |

---

## F. Resumen archivos a crear

| Archivo | Propósito |
|---|---|
| `app/(app)/cuenta/ofrecerme-como-transito/FosterVolunteerForm.tsx` | A.1 (existe parcial, completar) |
| `app/(app)/cuenta/ofrecerme-como-transito/PreCheckChecklist.tsx` | A.1 sub |
| `app/(app)/cuenta/transitos/page.tsx` | A.7 hub |
| `app/(app)/cuenta/transitos/activos/TransitoActivoCard.tsx` | A.8 |
| `app/(app)/cuenta/transitos/propuestas/[proposalToken]/ProposalReviewPanel.tsx` | A.2 |
| `app/(app)/cuenta/transitos/EndFosterDialog.tsx` | A.9 |
| `app/org/[orgToken]/voluntarios/VolunteerSearchPanel.tsx` | A.3 |
| `app/org/[orgToken]/voluntarios/VolunteerListItem.tsx` | A.4 |
| `components/poncho/MatchScoreBadge.tsx` | A.5 |
| `app/org/[orgToken]/voluntarios/[volunteerId]/proponer/ProposePetForm.tsx` | A.6 |
| `app/org/[orgToken]/voluntarios/[volunteerId]/MatchPreview.tsx` | A.6 sub |
| `app/org/[orgToken]/voluntarios/[volunteerId]/page.tsx` | B.5 |
| `app/org/[orgToken]/transitos/UnifiedTransitosTable.tsx` | B.6 |
| `app/org/[orgToken]/pets/no-aptas/PetCard.tsx` | B.7 + `<EligibilityPill>` |
| `components/poncho/EligibilityPill.tsx` | shared |
