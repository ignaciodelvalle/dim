# 03 — /adoptar listing público · design spec (handoff)

> Surface pública para descubrir mascotas en adopción de refugios verificados. Sin auth para browsing; gate de auth al "Postularme".
>
> Spec base: [`docs/superpowers/specs/2026-05-18-adoption-listing-public-design.md`](../superpowers/specs/2026-05-18-adoption-listing-public-design.md) (v1.4 con D22 consent).

## Audiencias y journeys

| Audiencia | Journey | Surfaces |
|---|---|---|
| **Visitante anónimo** | descubre /adoptar via search/share → filtra por zona/especie → ve cards → entra a detail → clickea Postular → gate auth (signup/login con `apply_intent`) | `/adoptar`, `/adoptar/[petToken]`, `/refugios/[orgToken]` |
| **Owner autenticado** | mismo journey pero al Postular entra al wizard (spec 01) | idem + `/adoptar/[petToken]/postular` |
| **Refugio coordinator** | publica/pausa listing per-pet, edita listing copy | `/org/[orgToken]/mascotas/[publicToken]/adoptar` |

## Sitemap

```
/adoptar                            — listing público con filtros (NUEVO)
/adoptar/[petToken]                 — ficha de adopción (NUEVO, distinto de /p/[publicToken])
/adoptar/[petToken]/postular        — wizard 28q (cubierto en spec 01)
/refugios/[orgToken]                — perfil público refugio (existe — extender con grid de pets en adopción)
/org/[orgToken]/mascotas/[publicToken]/adoptar — config listing (existe — extender con campos curados)
```

---

## A. Componentes nuevos / extendidos

### A.1 `<AdoptionListingCard>` — card del grid

#### Variants

| Variant | Use when |
|---|---|
| `default` | Lista en `/adoptar` y `/refugios/[orgToken]`. |
| `featured` | Mascotas listadas en últimas 72h, mostradas con badge "Nueva" arriba del feed. |
| `compact` | Variante para `/refugios/[orgToken]` cuando hay 12+ pets (grid denso). |

#### Layout (default, mobile 360px)

```
[Card vertical, full-width en mobile, 33% en desktop]
  [Imagen 4:3 con object-fit:cover, lazy load, blur placeholder]
  [Org badge: avatar 24×24 + nombre, esquina superior izquierda con backdrop blur]
  [Status pill esquina superior derecha: "Nueva" / "Cachorra" si aplica]
  [Bottom content:
    [H3: {pet.name}]
    [Meta line: {speciesLabel} · {ageBucketLabel} · {sizeLabel}]
    [Locality: {jurisdiction_locality}, {jurisdiction_province}]
    [Footer: <Button variant="primary" size="sm" iconRight="arrow-right" fullWidth>Conocer a {pet.name}</Button>]
  ]
```

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `pet` | `AdoptionListingPet` | required | Subset projection (id, publicToken, name, primaryPhotoId, species, ageBucket, sizeEstimate, jurisdictionLocality, jurisdictionProvince, listedAt) |
| `org` | `OrgBadge` | required | `{ publicToken, displayName, avatarUrl, verified }` |
| `variant` | `'default' \| 'featured' \| 'compact'` | `'default'` | |
| `priority` | `boolean` | `false` | Pass to `<Image priority>` para hero card |

#### Estados

| State | Visual |
|---|---|
| Default | Card normal |
| Hover (desktop) | `transform: translateY(-2px)` + sombra ligeramente más profunda + border `var(--color-gob-celeste)` |
| Focus (kbd) | Mismo que hover + focus ring |
| Loading photo | Blur placeholder mientras carga |
| Missing photo | Placeholder con `<Icon name="paw" size={48}>` + bg `bg-gob-surface-alt` |

#### Accesibilidad

- Card entera es link wrapper: `<a href="/adoptar/[petToken]">` envuelve toda la card (no botón anidado).
- `aria-label` del link: "Ver a {pet.name}, {speciesLabel} {ageBucketLabel} en adopción en {org.displayName}".
- Imagen tiene `alt={pet.name}` específico (no genérico "Foto de mascota").
- El badge "Nueva" tiene `<span class="sr-only">Recién publicada — </span>` antes del visible.
- Org badge tiene `aria-label="Publicada por {org.displayName}"`.

---

### A.2 `<AdoptionFiltersBar>`

#### Descripción

Filter bar sticky top en mobile, sidebar en desktop. Source of truth: searchParams del URL. Cada cambio dispara `router.push` con replace (no scroll up).

#### Filtros

| Filtro | Query param | Tipo | UI mobile | UI desktop |
|---|---|---|---|---|
| Especie | `?especie=` | `dog \| cat` | Pills horizontales sticky | Radio group sidebar |
| Provincia | `?provincia=` | string (PROVINCES) | Select | Select |
| Localidad | `?localidad=` | string libre dependiente de provincia | Combobox | Combobox |
| Edad | `?edad=` | `puppy \| junior \| young \| adult \| senior` | Pills | CheckboxGroup |
| Talle | `?talle=` | `small \| medium \| large \| xl` | Pills | CheckboxGroup |
| Energía | `?energia=` | `low \| medium \| high` | Select | RadioGroup |
| Bien con niños | `?ninos=` | `true \| any` | Switch | Checkbox |
| Bien con otros perros | `?perros=` | `true \| any` | Switch | Checkbox |
| Bien con gatos | `?gatos=` | `true \| any` | Switch | Checkbox |
| Necesita patio | `?patio=` | `true \| false \| any` | Switch tri-state | Tri-state |

#### Layout mobile

```
[Top sticky bar, full-width, bg neutro con border bottom]
  [Pills horizontales scrolleables: Especie, Edad, Talle]
  [Botón "Más filtros" → abre drawer]
  [Botón "Limpiar" si hay filtros aplicados]
```

Drawer mobile:

```
<Drawer side="bottom" title="Filtros">
  <Tabs>
    <Tab>Zona</Tab>
    <Tab>Personalidad</Tab>
    <Tab>Convivencia</Tab>
  </Tabs>
  [Tab content: campos del filtro correspondiente]
  <DrawerFooter>
    <Button variant="link">Limpiar todo</Button>
    <Button variant="primary">Ver {count} resultados</Button>
  </DrawerFooter>
</Drawer>
```

#### Layout desktop

Sidebar sticky 280px ancho con sections colapsables (`<details>` open por default):

```
<aside>
  <FormSection title="Especie"><RadioGroup name="especie"/></FormSection>
  <FormSection title="Zona"><Select name="provincia"/><LocalityCombobox/></FormSection>
  <FormSection title="Edad"><CheckboxGroup name="edad"/></FormSection>
  <FormSection title="Talle"><CheckboxGroup name="talle"/></FormSection>
  <FormSection title="Personalidad"><RadioGroup name="energia"/></FormSection>
  <FormSection title="Convivencia">[Checkboxes ninos/perros/gatos/patio]</FormSection>
  <div className="actions">
    <Button variant="link" type="reset">Limpiar</Button>
  </div>
</aside>
```

#### Estados

| State | UI |
|---|---|
| No filters | Pills + "Limpiar" oculto |
| 1+ filter | Pills muestran badge con valor (ej "Edad: Cachorra ✕") + botón "Limpiar todo" visible |
| Filter combo zero results | El grid muestra `<EmptyState>` con sugerencia "Probá relajar algún filtro" + chips de los aplicados para quitarlos rápido |

#### Accesibilidad

- Cada change input dispara form submit con `router.push` server-side. En mobile drawer, los cambios son client-side hasta tocar "Ver resultados" (commit).
- ARIA `<fieldset><legend>` por cada sección.
- El badge ✕ es botón con `aria-label="Quitar filtro {label}: {value}"`.

---

### A.3 `<AdoptionListingGrid>` — server-rendered grid

#### Descripción

Grid responsive de `<AdoptionListingCard>`. Paginación keyset (D8) con botón "Mostrar más".

#### Layout

| Breakpoint | Grid cols | Max card width |
|---|---|---|
| 360px | 1 | 100% |
| 640px | 2 | — |
| 1024px | 3 | — |
| 1280px+ | 4 | 320px |

```
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {pets.map(p => <AdoptionListingCard key={p.id} pet={p} org={p.org} priority={i < 4} />)}
</div>

{nextCursor && (
  <div className="mt-8 flex justify-center">
    <Button
      variant="secondary"
      iconRight="chevron-down"
      href={`/adoptar?${buildSearchParams({ ...filters, after: nextCursor })}`}
    >
      Mostrar más mascotas
    </Button>
  </div>
)}
```

#### Estados

| State | UI |
|---|---|
| Loading initial | Skeleton grid de 6 cards (mobile: 4) |
| Empty | `<EmptyState icon="paw" title="No encontramos mascotas con esos filtros" description="Probá quitar algún filtro o ampliar la zona." action={<Button>Limpiar filtros</Button>}>` |
| End of feed | `<p className="text-muted">Esas son todas las mascotas en adopción que coinciden con tu búsqueda.</p>` |

---

### A.4 `<PetAdoptionDetail>` — `/adoptar/[petToken]`

#### Descripción

Página completa de ficha de adopción. Distinta de `/p/[publicToken]` (credencial DNI). Aquí el framing es "Conocé a {pet.name}".

#### Layout (mobile-first single column, desktop 2-column)

```
<main>
  <Breadcrumb items={[{ label: "Adopciones", href: "/adoptar" }, { label: pet.name }]} />

  {/* Hero section */}
  <section className="hero">
    <Gallery photos={pet.photos} alt={pet.name} />
    <div className="hero-meta">
      <h1>Conocé a {pet.name}</h1>
      <p className="lead">
        <Icon name="paw"/> {speciesLabel(pet.species)} · {ageBucketLabel(pet.adoptionAgeBucket)} · {sizeLabel(pet.adoptionSizeEstimate)}
      </p>
      <OrgBadgeLarge org={org} />
    </div>
  </section>

  {/* CTA banner (sticky en mobile abajo) */}
  <section className="sticky bottom-0 md:static md:mt-6 bg-white border-t md:border md:rounded-lg p-4 shadow-md md:shadow-none">
    <Button variant="primary" size="lg" fullWidth href={`/adoptar/${petToken}/postular`} iconRight="arrow-right">
      Postulate para adoptar a {pet.name}
    </Button>
    <p className="helper text-center mt-2">
      Vas a completar un formulario de 28 preguntas. El refugio te responde por mail.
    </p>
  </section>

  {/* Story */}
  {pet.adoptionStory && (
    <Panel>
      <PanelHeader><h2>La historia de {pet.name}</h2></PanelHeader>
      <PanelBody>
        <p>{pet.adoptionStory}</p>
      </PanelBody>
    </Panel>
  )}

  {/* Stats grid */}
  <Panel>
    <PanelHeader><h2>Conocela mejor</h2></PanelHeader>
    <PanelBody>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatItem icon="paw" label="Especie" value={speciesLabel(pet.species)} />
        <StatItem icon="ruler" label="Talle" value={sizeLabel(pet.adoptionSizeEstimate)} />
        <StatItem icon="clock" label="Edad" value={`${ageBucketLabel(pet.adoptionAgeBucket)}${pet.dateOfBirth ? ` (~${estimateYears(pet.dateOfBirth)} años)` : ''}`} />
        <StatItem icon="activity" label="Energía" value={energyLabel(pet.adoptionEnergyLevel)} />
        <StatItem icon="venus-mars" label="Sexo" value={sexLabel(pet.sex)} />
        <StatItem icon="chip" label="Microchip" value={pet.microchipNumber ? "Sí" : "No"} />
      </dl>

      <h3>Convivencia</h3>
      <ul role="list" className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <ConvivenciaItem flag={pet.adoptionGoodWithKids} label="Niños" />
        <ConvivenciaItem flag={pet.adoptionGoodWithDogs} label="Otros perros" />
        <ConvivenciaItem flag={pet.adoptionGoodWithCats} label="Gatos" />
        <ConvivenciaItem flag={pet.adoptionNeedsYard} label="Necesita patio" inverse={false} />
      </ul>
    </PanelBody>
  </Panel>

  {/* Requisitos del refugio */}
  {pet.adoptionRequirements && (
    <Panel>
      <PanelHeader><h2>Lo que {org.displayName} pide para adoptarla</h2></PanelHeader>
      <PanelBody>
        <p>{pet.adoptionRequirements}</p>
      </PanelBody>
    </Panel>
  )}

  {/* Org card */}
  <Panel>
    <PanelHeader>
      <h2>Sobre el refugio</h2>
    </PanelHeader>
    <PanelBody>
      <OrgIdentityRow org={org} />
      <p>{org.description}</p>
      <Button variant="secondary" href={`/refugios/${org.publicToken}`} iconRight="external-link">
        Ver perfil de {org.displayName}
      </Button>
    </PanelBody>
  </Panel>

  {/* Share intents */}
  <Panel variant="alt">
    <PanelHeader><h2>Ayudala a encontrar hogar</h2></PanelHeader>
    <PanelBody>
      <p>Compartir esta ficha en redes ayuda a que llegue a más gente.</p>
      <ShareIntents url={canonicalUrl} title={`${pet.name} busca hogar — MiMAR`} />
    </PanelBody>
  </Panel>
</main>
```

#### `<ConvivenciaItem>` — tri-state (yes/no/unknown)

| Flag value | Visual |
|---|---|
| `true` | `<Icon name="check" className="text-gob-success"/>` + label |
| `false` | `<Icon name="x" className="text-gob-danger"/>` + label tachado |
| `null` | `<Icon name="help-circle" className="text-muted"/>` + label en gris |

Cuando es `null`: tooltip "{org} todavía no sabe esto sobre {pet.name}".

#### `<ShareIntents>`

```
<div className="flex flex-wrap gap-3">
  <Button variant="secondary" size="sm" iconLeft="brand-whatsapp" href={`https://wa.me/?text=${encoded}`}>WhatsApp</Button>
  <Button variant="secondary" size="sm" iconLeft="brand-instagram" onClick={copyForInstagram}>Para Stories</Button>
  <Button variant="secondary" size="sm" iconLeft="brand-facebook" href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}>Facebook</Button>
  <Button variant="secondary" size="sm" iconLeft="copy" onClick={copyLink}>Copiar link</Button>
</div>
```

Click en "Para Stories" → copia el link al clipboard + toast "Listo, pegalo en tu Story. También se descargó un sticker con la foto de {pet.name}." (descarga PNG 1080×1920 con foto + nombre + QR + url).

---

### A.5 `<AdoptionListingConfigForm>` — `/org/[orgToken]/mascotas/[publicToken]/adoptar`

#### Descripción

Form para que el refugio cure el listing copy. Editable cualquier momento mientras el pet sigue en custodia.

#### Layout

```
<FormPage title={`Listing de adopción — ${pet.name}`}>
  <PanelHeader>
    <h1>Listing de adopción de {pet.name}</h1>
    <ListingStatusPill status={listingStatus} />
  </PanelHeader>

  {/* Toggle publicar/pausar/despublicar */}
  <Panel>
    <PanelBody>
      <RadioGroup name="listing_state" defaultValue={currentState}>
        <Radio value="unpublished" label="No publicada" helper="Solo visible en tu portal." />
        <Radio value="published" label="Publicada en /adoptar" helper="Visible al público. Acepta postulaciones." />
        <Radio value="paused" label="Pausada" helper="No aparece en /adoptar pero guardamos el contenido editado." />
      </RadioGroup>
    </PanelBody>
  </Panel>

  <FormSection title="Storytelling" description="Lo que el público lee en la ficha. Tono cálido y honesto rinde más que lista de hechos.">
    <Field label="Historia de la mascota" required helper="Cómo llegó al refugio, qué pasó con su vida hasta ahora. 200-2000 caracteres.">
      <Textarea name="adoption_story" rows={8} minLength={50} maxLength={2000} />
    </Field>
    <Field label="Requisitos para adoptarla" helper="Ej: 'Hogar sin perros chicos', 'Familia sin niños menores de 8'. Opcional.">
      <Textarea name="adoption_requirements" rows={4} maxLength={1000} />
    </Field>
  </FormSection>

  <FormSection title="Datos operativos" description="Lo que el público filtra. Si no sabés algo, dejalo en 'no especificado'.">
    <Field label="Bucket de edad" required>
      <Select name="adoption_age_bucket">
        <option value="">Elegí</option>
        <option value="puppy">Cachorra (&lt;6m)</option>
        <option value="junior">Joven (6m-1a)</option>
        <option value="young">Adolescente (1-3a)</option>
        <option value="adult">Adulta (3-7a)</option>
        <option value="senior">Mayor (7+a)</option>
      </Select>
    </Field>
    <Field label="Talle estimado" required>
      <Select name="adoption_size_estimate">{/* small/medium/large/xl */}</Select>
    </Field>
    <Field label="Nivel de energía">
      <Select name="adoption_energy_level">
        <option value="">No especificado</option>
        <option value="low">Tranquila</option>
        <option value="medium">Activa</option>
        <option value="high">Muy enérgica</option>
      </Select>
    </Field>
  </FormSection>

  <FormSection title="Convivencia" description="Si no sabés todavía, dejalo en 'no sabemos'.">
    <Field label="¿Bien con niños?"><TriStateRadio name="adoption_good_with_kids" /></Field>
    <Field label="¿Bien con otros perros?"><TriStateRadio name="adoption_good_with_dogs" /></Field>
    <Field label="¿Bien con gatos?"><TriStateRadio name="adoption_good_with_cats" /></Field>
    <Field label="¿Necesita patio o casa con espacio exterior?"><TriStateRadio name="adoption_needs_yard" /></Field>
  </FormSection>

  <FormSection title="Otros datos">
    <Field label="Aporte sugerido (ARS)" helper="Opcional. Algunos refugios piden un aporte para cubrir veterinario.">
      <Input name="adoption_fee_ars" type="number" min={0} />
    </Field>
  </FormSection>

  <FormSection title="Fotos" description="El público elige por la foto. Subí 3-6 buenas, primero la mejor.">
    <PhotoGalleryEditor petId={pet.id} max={6} />
  </FormSection>

  <FormPage.Actions>
    <Button variant="link" type="button" onClick={cancel}>Cancelar</Button>
    <Button variant="primary" type="submit">Guardar listing</Button>
  </FormPage.Actions>
</FormPage>
```

#### Estados

| State | UI |
|---|---|
| Pet sin eligibility set | Banner `<Alert variant="warning">` arriba: "Marcá la mascota como apta para adopción antes de publicar." + link a `/eligibility` |
| Pet eligibility=false | Banner `<Alert variant="danger">` "Esta mascota está marcada como no apta. No podés publicarla hasta cambiar la eligibility." con motivo |
| Pet in_custody_dispute | Banner danger "Esta mascota está en disputa de custodia. El listing está bloqueado hasta resolverse." |
| Pet rabies_observation_status='active' | Banner danger "Esta mascota está en observación rábica (10 días). El listing se reactivará automáticamente al cerrar la observación." |
| Pet lost | Banner warning "Esta mascota está perdida. Mientras tanto sale del listing público. Volverá automáticamente al recuperarla." |

---

## B. Pantallas

### B.1 `/adoptar` — listing principal

```
<main>
  <HeroSection>
    <h1>Adoptá en MiMAR</h1>
    <p className="lead">Mascotas que esperan hogar en refugios verificados de toda Argentina.</p>
    <SearchAutocomplete /> {/* Buscador por nombre/locality */}
  </HeroSection>

  <div className="grid md:grid-cols-[280px_1fr] gap-6">
    <AdoptionFiltersBar />
    <div>
      <ResultsHeader count={count} filters={filters} />
      <AdoptionListingGrid pets={pets} nextCursor={nextCursor} />
    </div>
  </div>
</main>
```

`<ResultsHeader>` muestra "{count} mascotas en adopción" + chips de filtros aplicados con ✕ para quitarlos individualmente.

### B.2 `/adoptar/[petToken]` — ver A.4

### B.3 `/refugios/[orgToken]` — extender perfil público

Existe el perfil público. Agregar al final una sección:

```
<Panel>
  <PanelHeader>
    <h2>Mascotas en adopción ({orgPets.length})</h2>
    {orgPets.length > 12 && (
      <Link href={`/adoptar?org=${org.publicToken}`} className="link">Ver todas →</Link>
    )}
  </PanelHeader>
  <PanelBody>
    {orgPets.length > 0 ? (
      <AdoptionListingGrid pets={orgPets.slice(0, 12)} variant="compact" />
    ) : (
      <EmptyState icon="paw" title="No tiene mascotas publicadas ahora" description="Volvé a revisar en unos días." />
    )}
  </PanelBody>
</Panel>
```

---

## C. SEO

- Cada ficha `/adoptar/[petToken]` genera `<title>{pet.name} en adopción — {speciesLabel} en {locality} — MiMAR</title>`.
- `<meta description>` ≤160 char: "{pet.name}, {age_bucket} {species_label} en adopción en {org.displayName}, {locality}. Postulate en MiMAR."
- OpenGraph: `og:image` = primary photo 1200×630, `og:type=article`, `og:url=canonical`.
- Schema.org JSON-LD: `Animal` schema (no oficial pero usado para pets) + `PostalAddress` del refugio.
- `/adoptar?provincia=...&especie=...` genera URLs canonical + meta description geo-localizada para que Google indexe.
- Sitemap dinámico `app/adoptar/sitemap.ts` con todas las pets listadas (actualizado on-demand).

---

## D. Edge cases

| Caso | Decisión |
|---|---|
| Pet listed pero sale del listing entre browse e ingreso a detail | `/adoptar/[petToken]` retorna 200 igual con banner "Esta mascota ya no está disponible. Pero {org} tiene otras en adopción →" |
| Filtro sin matches | EmptyState con chips de filtros aplicados como botones para quitarlos rápido |
| User entra a `/adoptar/[petToken]/postular` sin estar logeado | Redirect a `/login?returnTo=...&apply_intent={token}` (D6 del spec). Post-auth vuelve al wizard. |
| User ya tiene application pending para este pet | Página postulación muestra "Ya tenés una postulación pendiente" + link a `/mis-mascotas/postulaciones/[id]` |
| Photo missing | Placeholder con icono paw + bg neutro |
| Visitor en navegador sin JS | Cards funcionan (server-rendered), filtros funcionan via form GET, "Postular" funciona también |
| Mobile portrait pequeño (320px) | Layout colapsa a 1 col, filtros van todos a drawer |

---

## E. Accesibilidad — checklist global

- Cards tienen `<a>` envolvente con `aria-label` específico.
- Imagen de cada card tiene `alt={pet.name}`.
- Filters bar: cada `<fieldset>` con `<legend>` semántico.
- Pills de filtros aplicados son botones con `aria-label="Quitar filtro {label}"`.
- Gallery tiene navegación por teclado (← →) + announce de posición ("Foto 2 de 5").
- Stats grid usa `<dl><dt><dd>` semántico, no tabla.
- Share intents tienen `aria-label` específicos ("Compartir en WhatsApp", no solo el ícono).
- "Postulate" button en sticky mobile no se superpone con teclado virtual (uses `env(safe-area-inset-bottom)`).
- Contraste verificado en cards: text on white + text on blur'd image overlay.

---

## F. Resumen archivos a crear

| Archivo | Propósito |
|---|---|
| `app/adoptar/page.tsx` | B.1 (existe — extender) |
| `app/adoptar/AdoptionFiltersBar.tsx` | A.2 (existe — completar) |
| `app/adoptar/AdoptionListingGrid.tsx` | A.3 |
| `app/adoptar/AdoptionListingCard.tsx` | A.1 |
| `app/adoptar/SearchAutocomplete.tsx` | B.1 hero |
| `app/adoptar/ResultsHeader.tsx` | B.1 |
| `app/adoptar/[petToken]/page.tsx` | A.4 + B.2 |
| `app/adoptar/[petToken]/Gallery.tsx` | A.4 |
| `app/adoptar/[petToken]/ShareIntents.tsx` | A.4 |
| `app/adoptar/[petToken]/ConvivenciaItem.tsx` | A.4 |
| `app/adoptar/[petToken]/StatItem.tsx` | A.4 |
| `app/adoptar/sitemap.ts` | C |
| `app/refugios/[orgToken]/page.tsx` | B.3 (existe — extender) |
| `app/org/[orgToken]/mascotas/[publicToken]/adoptar/AdoptionListingForm.tsx` | A.5 (existe — extender con curated fields) |
| `app/org/[orgToken]/mascotas/[publicToken]/adoptar/PhotoGalleryEditor.tsx` | A.5 sub |
| `components/poncho/TriStateRadio.tsx` | shared |
| `components/poncho/ListingStatusPill.tsx` | shared |
