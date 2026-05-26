# `/perdidas` — Public lost-pet catalog — implementation plan

**Date:** 2026-05-26
**Status:** Plan — not started
**Source:** Mockup `portal-perdidas.html` (`BoardPublicPerdidas` + `PublicLostCard` components in the bundler dump).

## What this is

A public, anonymous-friendly catalog of pets currently in `status='lost'`. Mirror of the existing `/adoptar` surface (which lists pets eligible for adoption), but the emotional register is urgency rather than welcome — red palette, time-since-lost prominent, last-known location front-and-center.

Click on a card → existing public credential at `/p/[publicToken]` (which already promotes to **Tier 1 LOST** when `pet.status === 'lost'`). No new credential surface needed.

## Why now

The mockup explicitly references this catalog and we surfaced it during the redesign audit on 2026-05-26 as **the only public surface that does not exist yet** (denuncias, adoptar, public credential, in-memoriam are all live). Currently lost pets are only visible to (a) the owner via their own profile, (b) anyone who scans the QR, (c) govt at `/gob/perdidas` (internal). A vecino who doesn't know the QR has no way to discover that a pet is lost in their barrio.

## What exists today we can lean on

- **`/adoptar`** (`app/adoptar/page.tsx` + `AdoptionFiltersBar.tsx`, 199 + 224 LOC) — exact mirror to copy. URL is source of truth (D11), server-rendered, cursor pagination, filter bar with native `<form GET>`, card grid 1→3 cols.
- **`lib/adoption-listing.ts`** + **`lib/adoption-listing-query.ts`** — paired helpers we'll mirror as `lib/lost-listing.ts` + `lib/lost-listing-query.ts`.
- **`fetchLostPets`** in `lib/govt-dashboards.ts:198-300` — does the heavy lifting already: joins `pets` with the latest `status_changed → 'lost'` event, surfaces `markedLostAt` + `lastSeenLat/Lng`, resolves active owner. Govt-scoped; we'll generalize for the public path.
- **`/p/[publicToken]`** — destination of every card. Already renders Tier 1 LOST when status='lost'. No change.
- **Poncho `(public)` shell** — `app/(public)/layout.tsx` wraps with `AppHeader` + `AppFooter`. `/perdidas` goes under the same group as `/adoptar`.
- **`pet.disclose*WhenLost` columns** — 5 disclosure flags already enforced on the credential. The catalog respects the same flags (next section).

## UX from the mockup

Vertical stack inside `max-w-6xl` (same width as `/adoptar`). All sections in display order:

1. **Red urgency band** above the hero — `bg-red-600 text-white`, line: *"{N} mascotas perdidas en las últimas 24 horas · Si encontraste alguna, dejá tu contacto desde su credencial — el dueño recibe la notificación al instante."*
2. **Hero** — H1 *"Mascotas **perdidas** cerca tuyo"* (the word "perdidas" tinted red), subtitle: *"Animales marcados como perdidos por sus dueños. Si reconocés alguno o lo viste cerca, abrí su credencial y dejá tu contacto."*
3. **KPI strip** — 4 metric cards: Activas · Críticas (24h) · Últimas 24h · Últimos 7 días.
4. **Filter bar** (`<form method="GET">`) — Especie, Provincia, Localidad, Cuándo se perdió, Tamaño, Color, Buscar button.
5. **Quick filters row** — checkbox chips: Visto hoy · Esta semana · Con microchip · Castrado/a · Crítica · A 5 km de mí.
6. **Result count + sort** — *"{N} mascotas perdidas en tu zona · ordenadas por más recientes"* + sort select (Más recientes / Más cerca / Hace más tiempo).
7. **Card grid** — `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]` (slightly more flexible than `/adoptar`'s fixed 1→3). Each card:
   - Square photo (aspect-1/1)
   - Top-left pennant **PERDIDA/PERDIDO** with `clip-path` arrow
   - Top-right chip **time-since-lost** (color-graded by urgency: <24h red, <7d amber, older neutral)
   - Below the photo: Name (serif, large) · Breed · sex · age · size · color
   - Highlighted box *"Visto por última vez"* with neighborhood + city + relative time
   - Optional pet note (italic, 2 lines clamped)
   - Footer: chip / castrado/a badges (left) + *"Ver credencial →"* (right, red)
8. **Pagination** — *"Mostrar más"* link with `?cursor=` (same as `/adoptar`).
9. **CTA card at bottom** — *"¿Perdiste a tu mascota? Marcala como perdida desde su libreta…"* with a *"Reportar pérdida"* button → `/mis-mascotas` (or `/login` if anonymous).

## Data model and query

No schema changes. Everything we need is already on `pets` + `pet_events`.

### Privacy: which pets show up?

Every pet with `status='lost'` shows up in the catalog. The catalog is the public projection of the lost state — same trust boundary as the QR scan. Two policy points:

- **Location precision**: `lastSeenLat/Lng` from the `status_changed` event are exact. The card shows **neighborhood + city only** — never raw coordinates. (Same precision as the credential.)
- **Owner identity**: not exposed in the catalog. The card has no owner name. The credential is where disclosure flags decide what shows.
- **`discloseLastLocationWhenLost = false`**: hide the *"Visto por última vez"* box entirely on that card. Still shows in the catalog with name/photo/time-lost. Province/locality from `pets.jurisdiction*` (already non-private) can stay.

### Query helper — `lib/lost-listing-query.ts`

Mirror `lib/adoption-listing-query.ts`. Signature:

```ts
export async function queryLostListing(
  filters: LostFilters,
  cursor: string | null,
  limit: number,
): Promise<{ items: LostListingItem[]; nextCursor: string | null }>;
```

Implementation borrows from `fetchLostPets`:
1. Base SELECT from `pets` where `status='lost'`, joined with the latest `status_changed → 'lost'` event for `markedLostAt + lastSeenLat/Lng`.
2. Apply filters: species, province, locality, color (from `pets.color`), size (from `pets.size_estimate` if present), microchip-present, sterilized, time-bucket (hoy / esta semana / etc.).
3. Apply privacy: if `discloseLastLocationWhenLost` is false, NULL out `lastSeenLat/Lng/neighborhoodLabel` on the row.
4. Sort: `markedLostAt DESC` by default.
5. Cursor pagination: encode `(markedLostAt, petId)` like `/adoptar` does.

### Quick-filter encoding

Each quick filter is a separate URL param so they compose:

- `visto=hoy|semana`
- `chip=1`
- `castrado=1`
- `criticidad=critical`
- `cerca=1` (geo-prox — see deferred)

The `<form GET>` posts to `/perdidas?...` and rerenders server-side. Same pattern as `/adoptar`.

### Filter labels (mirror existing helpers)

`lib/lost-listing.ts` exports the parse/format helpers and label maps, copying `lib/adoption-listing.ts`'s shape: `parseSearchParams`, `buildSearchParams`, `<thing>Label()` for each enum.

## Routing and shell

- Path: **`/perdidas`** (top-level, under `app/perdidas/page.tsx`, no route group — so it picks up `(public)` shell automatically just like `/adoptar` does).
- `export const dynamic = "force-dynamic"` (URL is source of truth, server-rendered per request).
- `generateMetadata` builds title from filters (mirror `/adoptar`: *"perros perdidos en La Plata — MiMAR"*).
- OG image: defer until phase 4. Static social image works for v1.

## Phased plan

Ordered by ascending risk. Each phase = 1 PR.

### Phase 1 — Data layer (no UI yet)

- `lib/lost-listing.ts` — types, label maps, `parseSearchParams`, `buildSearchParams`. Pure functions, unit-testable.
- `lib/lost-listing-query.ts` — `queryLostListing` (the join + privacy + sort + cursor).
- Tests: filter parsing roundtrips, query returns expected shape with sample seed data.
- No route exposed yet.

### Phase 2 — Page + filter bar + card grid (no quick filters, no KPI, no urgency band)

- `app/perdidas/page.tsx` — mirror `/adoptar` structure: hero + filter bar + result count + card grid + pagination.
- `app/perdidas/LostFiltersBar.tsx` — native `<form GET>` with the 6 main filters.
- `app/perdidas/LostListingCard.tsx` — square photo + pennant + time-since chip + name + breed line + last-seen box (gated by disclosure flag) + footer.
- Tests: e2e through a seeded lost pet (smoke).

### Phase 3 — Urgency band + KPI strip + quick filters

- Red band above the hero with the *N pets in last 24h* line.
- 4-metric KPI strip computed in the page handler (1 extra count query).
- Quick filter chips below the main bar. They compose with the main filter form on submit.

### Phase 4 — SEO + sitemap + bottom CTA

- `generateMetadata` polished (filter-aware title + description).
- `app/sitemap.ts` — add `/perdidas` (or generate per-province if useful).
- Bottom CTA card *"¿Perdiste a tu mascota?"* → `/mis-mascotas` (or `/login?next=/mis-mascotas` if anonymous).
- Open-graph image generation. Optional — fallback to static MiMAR OG works for v1.

## Open decisions

1. **Featured ordering**: `/adoptar` uses `featuredScore` to surface refugio-promoted pets. `/perdidas` doesn't need promotion — chronological (newest lost first) is the right default. Skip the score.
2. **Time bucket for "visto hoy" / "esta semana"**: based on `markedLostAt`, not on a sighting event (sightings flow doesn't exist yet — see lost cockpit follow-ups).
3. **Critical urgency cutoff**: mockup uses *"críticas en las últimas 24 horas"* — what makes a pet critical? Default: any pet marked lost in last 24h is *critical*. After 24h it's *recent* (amber), after 7 days *older* (neutral). All thresholds derived; nothing in the schema needs to change.
4. **Pets with no photo**: show with a fallback letter avatar (same as `/adoptar`'s `<PetListingCard>` does today). Don't hide — visibility wins.
5. **Pets without province/locality**: include in the catalog without a location card; the filter just doesn't catch them. Vecinos can still recognize the face.
6. **Indexing/SEO**: `/perdidas` should be indexable. Individual `/p/[token]` pages are already indexable when `status='lost'`. Confirm no robots.txt rule excludes them.

## Deferred (not in this plan)

- **"A 5 km de mí"** quick filter — needs `navigator.geolocation` client-side + a ranking step. Real-time geo proximity is harder than the rest. Ship the chip but mark disabled (mirror of the *no-link* pattern we used for `/tracking`).
- **Sort by distance** — same dependency on geo.
- **Map view** (cluster pins on a CABA / AMBA map) — separate spec; do not bundle into the catalog launch.
- **Owner-toggle to opt out of the catalog** — privacy escape hatch (*"mi mascota está perdida pero no quiero que aparezca en el listado público"*). Worth a column on `pets` later (`disclose_in_lost_catalog`, default true) but defer until someone asks. Today the QR is already public; the catalog only widens discovery.
- **`featured` / sponsored listings** — `/perdidas` is not a marketplace. No sponsorship.
- **Pet-found / mark-recovered widget on the catalog row** — the credential already has it. Don't duplicate.

## Risks

- **Privacy by surprise**: a vecino discovering a pet in the catalog (vs only via QR scan) feels different to some owners. The disclosure flags from #148's lost cockpit (already shipping) cover the granular case; the catalog respects them.
- **Stale rows**: pets get marked found but the catalog ranks by `markedLostAt`. As long as the query filters on `status='lost'`, found pets drop out instantly. No worker needed.
- **Owner-side: catalog churn**: a pet marked lost → found → lost again appears twice in the timeline of `status_changed` events. The query picks the **latest** `to_status='lost'` event per pet, so the catalog shows the current episode only.

## Estimated effort

| Phase | Files | LOC est. | Time |
|---|---|---|---|
| 1 — data layer | 2 new + 1 test | ~300 | 0.5 day |
| 2 — UI base | 3 new | ~400 | 1 day |
| 3 — urgency + KPI + quick filters | edits | ~200 | 0.5 day |
| 4 — SEO + sitemap + CTA | edits | ~100 | 0.25 day |
| **Total** | — | **~1000 LOC** | **~2.25 days** |
