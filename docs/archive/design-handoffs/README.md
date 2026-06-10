# MiMAR — Design specs handoff (Poncho-flavored)

> Fecha: 2026-05-20 · Owner: Ignacio Del Valle
>
> Specs handoff-ready para las features planeadas de MiMAR. Cada spec asume el sistema de diseño Poncho definido en [`docs/poncho/PLAN.md`](../poncho/PLAN.md) (DP1–DP13) y reusa los componentes existentes (`<Button>`, `<AppHeader>`, `<AppFooter>`, `<HeaderNav>`) más los componentes de Fase 3 todavía pendientes.

## Convenciones compartidas

Todas las specs siguen las decisiones doctrinales de Poncho (`docs/poncho/PLAN.md`):

| Decisión | Aplicación en estas specs |
|---|---|
| DP1 — Wrappers ricos `<Field>` sobre primitivos | Toda input usa `<Field label error helper required>` con `useId` autoconectado a `aria-describedby` / `aria-invalid` |
| DP2 — Validación server-side con zod + form actions | Cada form action declara su schema en `lib/<dominio>/schema.ts`; las pantallas consumen `useFormState` |
| DP3 — Tokens, nunca hex | Solo `var(--color-gob-*)` o utilidades Tailwind (`bg-gob-primary`, `text-gob-celeste`, etc.) |
| DP4 — WCAG 2.1 AA | Touch ≥44×44, contraste verificado, focus visible obligatorio, labels asociadas, ARIA solo donde HTML no alcanza |
| DP5 — Mobile-first, drawer en mobile | Cada pantalla diseñada para 360px primero, breakpoints en 640/768/1024/1280 |
| DP6 — Server components default | Solo `"use client"` con razón explícita (estado, efecto, browser API) |
| DP7 — API consistente | `variant`, `size`, `loading`, `disabled`, `iconLeft/Right` con `IconName` (no JSX), `className`, pass-through `...rest` |
| DP8 — Trade-offs Poncho documentados | Variants outline donde corresponde, `btn-info` solo con `size="lg"` |
| DP9 — Empty states con `<EmptyState>` | Toda lista vacía usa el componente con icon / illustration / título / desc / CTA |
| DP10 — Microcopy en voz oficial AR | Tuteo, imperativo amable, error con sugerencia de acción, confirmaciones cálidas |
| DP11 — Lora solo para editorial | Encode Sans en toda UI funcional |
| DP12 — Toasts efímeros, alerts persistentes | Toast post-acción (3-5s), `<Alert>` inline persistente, `<SiteBanner>` para alerts site-wide |
| DP13 — Sin jQuery, sin Bootstrap 3 | Cada componente Poncho reconstruido en React + Tailwind |

## Componentes referenciados

| Componente | Estado | Spec/fuente |
|---|---|---|
| `<Button>` | ✅ shipped | `components/poncho/Button.tsx` — 6 variants, 3 sizes, loading/disabled, iconLeft/iconRight |
| `<AppHeader>`, `<AppFooter>`, `<HeaderNav>`, `<GobStripe>`, `<MobileMenu>` | ✅ shipped | `components/poncho/Layout/*` |
| `<Icon name={IconName}>` | ✅ shipped | `components/Icon.tsx` — 852 íconos icono-arg |
| `<Field>`, `<Input>`, `<Textarea>`, `<Select>`, `<Checkbox>`, `<Radio>`, `<CheckboxGroup>`, `<RadioGroup>`, `<FileInput>`, `<DateInput>`, `<FormError>`, `<FormSection>` | 🟢 Fase 3A planeada | DP1+DP2+DP4+DP7 |
| `<Alert>`, `<Toast>`, `<Toaster>`, `<SiteBanner>` | 🟢 Fase 3B | DP12 |
| `<Modal>`, `<ConfirmDialog>` | 🟢 Fase 3C | DP4+DP6+DP10 |
| `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>`, `<Panel>`, `<PanelHeader>`, `<PanelBody>` | 🟢 Fase 3D | DP3+DP7 |
| `<Breadcrumb>`, `<Tabs>`, `<TabList>`, `<TabPanel>` | 🟢 Fase 3E | DP4+DP5+DP6 |
| `<TramiteCard>`, `<Stepper>`, `<FormPage>` | 🟢 Fase 3F | DP4+DP5+DP7+DP10 |
| `<EmptyState>` | 🟢 Fase 3H | DP9+DP10 |
| `<Table>`, `<Pagination>`, `<TableFilters>` | 🟢 Fase 3I | DP4+DP5+DP7 |

Componentes nuevos a sumar por estas specs (cubiertos in-line):

- `<PetCard variant="adoption|foster|libreta">` — extends `PetCard` actual con variants por contexto.
- `<CaseCard>` — card de caso con `<CaseBadge>` + meta + CTA.
- `<HandshakeProgress>` — stepper especializado para el handshake adopción (3 estados: propuesto / aceptado / vencido).
- `<ContractPreview>` — embed PDF con checkbox "lo leí" gating.
- `<MatchScoreBadge>` — pill con score numérico + warnings tooltipped.
- `<MetricCard>` — number + label + delta + sparkline (dashboards govt).
- `<MapChoropleth>` — mapa con jurisdicciones coloreadas (welfare/vigilancia).
- `<TimelineDot>` — punto en timeline vertical para libreta / case events.
- `<ReminderCard>` — recordatorio vacuna/checkin con due date + CTA.
- `<EligibilityPill>` — pill que muestra estado eligibility (apta/no apta/medical/quarantine/legal).

## Specs

| # | Feature | Ruta principal | Prioridad operativa |
|---|---|---|---|
| 01 | [Adoption handshake unificado](./01-adoption-handshake.md) | `/adoptar/[petToken]/postular`, `/cuenta/adopciones/[handshakeToken]`, `/org/[orgToken]/configuracion/adopciones` | 🔴 Alta — bloquea el siguiente release |
| 02 | [Foster volunteers pool](./02-foster-pool.md) | `/cuenta/ofrecerme-como-transito`, `/cuenta/transitos/*`, `/org/[orgToken]/voluntarios` | 🟠 Media-alta |
| 03 | [/adoptar listing público](./03-adoptar-public.md) | `/adoptar`, `/adoptar/[petToken]`, `/refugios/[orgToken]` | 🟠 Media-alta — feed la conversión a postulación |
| 04 | [Govt dashboards](./04-govt-dashboards.md) | `/gob/vigilancia`, `/gob/perdidas`, `/gob/maltrato`, `/gob/disputas` (+ admin universal) | 🟡 Media — depende del onboarding govt |
| 05 | ~~/pro vet independiente~~ | ~~`/pro`, `/pro/servicios`, `/pro/agenda`~~ | ⚪ **Archived** — el portal `/pro` fue deprecado; el flujo del vet independiente vive ahora dentro del org portal. Spec movida a [`../archive/05-pro-portal-design.md`](../archive/05-pro-portal-design.md) en sprint 1 PR-007. |
| 06 | [Vaccine-due UX](./06-vaccine-due.md) | `/mis-mascotas/[publicToken]` (cards), `/notificaciones`, `/inicio` | 🟢 Baja-media — quick win |

## Resumen ejecutivo

Las 6 specs comparten 4 patrones de pantalla:

1. **Wizard multi-step** (adoption postulación, foster proposal accept) — `<Stepper>` mobile-first + `<FormPage>` + persistencia en `useReducer` + autosave por step.
2. **Listing con filtros** (`/adoptar`, foster pool, casos govt) — server-rendered con searchParams como source of truth + `<TableFilters>` + paginación keyset + `<EmptyState>` curado.
3. **Detail de objeto** (pet adopción, voluntario, caso, postulación) — header con identidad + `<Tabs>` por aspectos + panel lateral con metadata + acciones contextuales por capability.
4. **Dashboard con métricas** (govt sanitary/analyst/welfare + /pro home + /inicio owner) — grid de `<MetricCard>` arriba + lista priorizada abajo + filtro temporal + drill-down a detail.

Las decisiones de copy (DP10) son consistentes:

- Acciones **imperativas amables** ("Postulate", "Aceptá", "Publicá", nunca "Realizar postulación").
- Confirmaciones **cálidas** ("Listo, recibimos tu postulación", "La adopción quedó firmada").
- Errores con **sugerencia de acción** ("Tu sesión expiró, ingresá de nuevo", "Subí una foto del DNI para continuar").
- Empty states con **CTA específico** ("Todavía no tenés mascotas. Registrá la primera →").
- Avisos sensibles (welfare, disputa, denuncia) en **voz formal pero empática** ("Recibimos tu denuncia. Vamos a contactarte en las próximas 72 horas.").

Toda copy está escrita en estas specs como referencia. El skill `design:ux-copy` se invoca si hay duda.
