# Plan Poncho — MiMAR

Adopción del sistema de diseño Poncho (gob.ar) en el stack moderno de MiMAR (Next.js 15 + React 19 + Tailwind v4 + Supabase). Las **decisiones marcadas** (DP1-DP13) son la doctrina del proyecto: capturan cómo deben quedar definidos los componentes para siempre.

---

## Estado actual

### Fase 1 — Tokens e identidad (completada)
- Paleta oficial Poncho en `app/globals.css` con CSS variables y utilidades Tailwind (`bg-gob-primary`, `text-gob-celeste`, etc.).
- Tipografía Encode Sans (4 pesos) via `@font-face`.
- 852 íconos `icono-arg` como webfont + componente `<Icon name="..." />`.
- Focus ring global con `:focus-visible` y celeste como ring.
- Modo oscuro con neutros y semánticas aclaradas.
- Soporte `prefers-reduced-motion`.
- Componente `<Button>` con 6 variantes (primary/secondary/success/danger/link/tag), 3 tamaños, estados loading/disabled, soporte `iconLeft`/`iconRight`.
- Página `/design` con paleta, tipos, botones, buscador client-side de íconos.
- Preview standalone en `docs/poncho/preview-fase1.html`.

### Fase 2 — Header y footer institucionales (completada)
- `<GobStripe>` decorativa (4px, celeste-blanco-celeste).
- `<AppHeader>` server component con marca + nav (estilo "liviano", sin organismo).
- `<HeaderNav>` client component con active state via `usePathname()`, drawer mobile con focus trap.
- `<AppFooter>` con 3 columnas configurables + licencia CC + link a argentina.gob.ar + cinta al pie.
- Route group `app/(public)/layout.tsx` que monta header + footer.
- `/design` movido a `app/(public)/design/page.tsx`.
- Preview standalone en `docs/poncho/preview-fase2.html`.

---

## Decisiones marcadas (doctrina Poncho)

Estas decisiones aplican a **todo** componente Poncho-flavored que se cree de acá en adelante.

### DP1 — Wrappers ricos sobre primitivos headless
Los componentes de formulario usan API tipo wrapper: `<Field label="..." error="..." helper="...">`. Manejan label, error, helper text, `aria-describedby` y `aria-invalid` automáticamente. Razón: consistencia + accesibilidad por default + menos chance de divergir en cada call site. Para casos extremos donde el wrapper no alcanza, se exportan los primitivos individuales (`<Label>`, `<Helper>`, `<ErrorMessage>`) como escape hatch.

### DP2 — Validación server-side con zod + form actions
Source of truth única: schemas zod en `lib/<dominio>/schema.ts`. Server actions usan `useFormState` (Next 15) y devuelven `{ errors, values }`. Componentes de formulario consumen `useFormState` y pasan `error` al `<Field>` correspondiente. Sin RHF, sin validación client-side por default. Razones: progressive enhancement, menos JS en el bundle, source of truth única, no se desincronizan client y server.

Excepción documentada: validación **cosmética** instantánea (tipo "DNI debe tener 8 dígitos" mientras se escribe) es aceptable con `useState` local sin librería. No reemplaza la validación server.

### DP3 — Tokens, nunca hex inline
Todo componente consume `var(--color-gob-*)` o utilidades Tailwind (`bg-gob-primary`, `text-gob-danger`). Hex codes en JSX/CSS son bloqueantes en code review. Excepción: previews en `docs/poncho/preview-*.html` que viven aislados sin Tailwind.

### DP4 — WCAG 2.1 AA mínimo, AAA donde sea fácil
Contraste: AA en todo, AAA cuando el token lo permite (ya validado en Fase 1). Touch targets ≥ 44×44 px en interactivos. Focus visible obligatorio. Labels asociados a inputs. Roles ARIA solo cuando HTML semántico no alcanza. Toda nueva pantalla pasa por el skill `design:accessibility-review` antes de merge.

### DP5 — Mobile-first, drawer en lugar de menú colapsado
Componentes nav se piensan primero para mobile (≤ 768px). Para listas / tabs / acordeón en mobile, drawer lateral antes que dropdowns o popovers. Sin `display:none` en streaming de Next.js — usar route segments o estado client.

### DP6 — Server components por default, client cuando hace falta
Cada nuevo componente arranca como server component. Se vuelve client (`"use client"`) solo si necesita: estado local, efectos, listeners de browser API, o hooks de React. Cuando un componente tiene una parte server y otra client, se parten en dos archivos (patrón: `AppHeader.tsx` server + `HeaderNav.tsx` client).

### DP7 — API consistente entre componentes
Convenciones compartidas en toda la biblioteca:

- `variant` para color/intención (`primary | secondary | success | danger | info | warning`).
- `size` para escala (`sm | md | lg`), con `md` default.
- `loading`, `disabled` como booleans.
- `iconLeft`, `iconRight` reciben `IconName` (no JSX) cuando aplican.
- `className` siempre pasable, se compone con clases internas (no override).
- Props pass-through al elemento HTML subyacente vía `...rest`.

### DP8 — Accesibilidad cumple Poncho original
Donde Poncho hizo trade-offs (algunos botones outline rojo, badges con contraste ajustado), MiMAR los respeta — pero documenta sus límites. Ej: `btn-info` solo aceptable con texto grande (≥ 18pt o 14pt bold), porque el contraste de `#2897d4` sobre blanco es 3.25 (AA Large solamente). El componente `<Button variant="info">` debería emitir warning en dev si se usa con `size="sm"`.

### DP9 — Empty states no son texto plano
Cualquier vista que pueda estar vacía (listado de mascotas, casos, denuncias, notificaciones) tiene un componente `<EmptyState>` con ícono o ilustración, título corto, descripción explicativa, CTA opcional. Texto plano de "No hay datos" es bug.

### DP10 — Microcopy en voz oficial argentina
- Tuteo argentino ("vos", no "tú").
- Lenguaje claro, directo, sin tecnicismos.
- Acciones en imperativo amable ("Registrá tu mascota", no "Realizar registro de mascota").
- Mensajes de error con sugerencia de acción ("Tu sesión expiró, ingresá de nuevo", no "Sesión expirada").
- Confirmaciones cálidas ("Listo, lo guardamos", no "Operación exitosa").

El skill `design:ux-copy` se invoca cuando se duda. Bloqueante en review si una pantalla nueva tiene microcopy genérico tipo "Cargando..." sin contexto.

### DP11 — Lora reservada para editorial
Encode Sans es la fuente por default. Lora (serif) se reserva para páginas tipo "Acerca de", "Términos", "Noticias", "Comunicados", donde la formalidad serif aporta peso institucional. No se usa en UI funcional. Su `@font-face` se carga lazy desde esas rutas, no en root.

### DP12 — Toasts efímeros, alertas persistentes
Distinción clara:

- **Toast**: feedback transitorio post-acción (3-5 segundos, auto-dismiss). "Vacuna registrada", "Mascota actualizada". Top-right en desktop, top-center en mobile. Aria-live polite.
- **Alert inline**: mensaje persistente dentro de una sección. Validación de form, advertencia contextual. Se cierra con click si es dismissible.
- **Banner sitio**: alerta a nivel app (emergencia sanitaria, mantenimiento). Sticky arriba del header, dismissible, persistido en localStorage.

Toast no es lo mismo que Alert — no se intercambian.

### DP13 — Sin jQuery, sin Bootstrap 3 CSS
Reiterado de la decisión original del plan. Si en algún momento aparece la tentación de cargar `poncho.min.css` global para "ahorrar tiempo", la respuesta es no. Cada componente Poncho que se aplique se reconstruye como componente React + Tailwind. La identidad Poncho se preserva; el carry-over técnico de Bootstrap 3 no.

---

## Fase 3 — Componentes funcionales

Ordenados por ROI (lo que más desbloquea pantallas, primero).

### Fase 3A — Formularios (1 semana)

**Objetivo**: cubrir el 100% de los inputs que MiMAR necesita.

**Entregables**:
- `<Field label helper error required>` wrapper que orquesta label, helper, error, y conecta `aria-describedby` / `aria-invalid` con el input child via `useId`.
- `<Input>` text/email/tel/url/password/number con estados focus/error/disabled, soporte `inputMode`, `pattern`, `maxLength`.
- `<Textarea>` con autosize opcional.
- `<Select>` nativo estilado (no headless por ahora — el nativo en mobile es mejor UX).
- `<Checkbox>` y `<Radio>` con label inline propio (no requieren `<Field>` wrapper porque la layout es distinta).
- `<CheckboxGroup>` y `<RadioGroup>` con `fieldset` + `legend` automáticos.
- `<FileInput>` con preview de archivo, soporte de drop, validación de mime/size.
- `<DateInput>` que envuelve `<input type="date">` con fallback decente en Safari mobile.
- `<FormError>` (banner) para errores globales del form.
- `<FormSection>` con título, descripción, y agrupación visual.

**Decisiones DP1, DP2, DP3, DP4, DP6, DP7 aplican**.

**Patrón de uso esperado**:

```tsx
// app/intake/IntakeForm.tsx
"use server";

import { intakeSchema } from "@/lib/intake/schema";

export async function registerPet(prev: State, formData: FormData) {
  const parsed = intakeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  // ...
}
```

```tsx
// Componente
const [state, formAction] = useFormState(registerPet, { errors: {} });

<form action={formAction}>
  <Field label="Nombre de la mascota" error={state.errors?.name?.[0]} required>
    <Input name="name" />
  </Field>
  <Field label="DNI del responsable" error={state.errors?.dni?.[0]} helper="Sin puntos ni guiones">
    <Input name="dni" inputMode="numeric" pattern="[0-9]{7,8}" />
  </Field>
  <Button variant="primary" type="submit">Registrar</Button>
</form>
```

**Diferido**: combobox con autocomplete async (para localidades/especies/razas — `LocalityCombobox.tsx` ya existe, se migra después). Date range picker. Validación instantánea inline (más allá del cosmetic permitido en DP2).

**Criterio de salida**: 100% de inputs de MiMAR cubiertos por la biblioteca + página `/design/forms` con ejemplos de cada uno + ejemplo end-to-end de form con server action.

---

### Fase 3B — Alertas y toasts (2-3 días)

**Objetivo**: feedback consistente.

**Entregables**:
- `<Alert variant="info|success|warning|danger" dismissible onDismiss>` con ícono a la izquierda, contenido flexible, close button opcional.
- `<Toast>` + `<Toaster>` provider. API: `toast.success("Listo")`, `toast.error("Algo falló")`, `toast.info(...)`, `toast.warning(...)`. Auto-dismiss configurable.
- `<SiteBanner>` para alertas a nivel app, sticky encima del header, persistencia opt-in via localStorage key.

**Decisiones DP3, DP4, DP10, DP12 aplican**.

**Diferido**: alertas con CTA inline (botón dentro del alert), variantes ricas tipo "newsletter prompt". Se ven cuando aparezca el caso de uso.

**Criterio de salida**: `/design/feedback` con los 3 componentes y ejemplos de uso.

---

### Fase 3C — Modales y diálogos (2-3 días)

**Objetivo**: confirmaciones destructivas + formularios chicos sin route change.

**Entregables**:
- `<Modal open onClose title>` basado en `<dialog>` nativo (con polyfill solo si necesario para Safari). Maneja Esc, click outside, focus trap nativo, scroll lock.
- `<ConfirmDialog title description variant="danger|warning" onConfirm onCancel>` para confirmaciones rápidas.
- Patrón documentado: para forms en modal, usar el mismo wrapper de Fase 3A — sin duplicar componentes.

**Decisiones DP4, DP6, DP10 aplican**. El componente es client por necesidad.

**Diferido**: animaciones avanzadas de entrada/salida. Multi-step dialogs. Drawer dialog (lateral). Se piensan cuando aparezcan.

**Criterio de salida**: `/design/dialogs` con ejemplos + uso real en alguna pantalla actual ("¿Eliminar vacuna?").

---

### Fase 3D — Card y Panel (3 días)

**Objetivo**: contenedor consistente para listados de mascotas, casos, denuncias.

**Entregables**:
- `<Card>` simple: surface blanca, border, radius. Slots `<CardHeader>`, `<CardBody>`, `<CardFooter>` opcionales.
- `<Panel>` con `<PanelHeader>` (título + acciones) y `<PanelBody>`. Equivalente a Poncho `panel`.
- Migración guía de `PetCard.tsx` para usar `<Card>` — se ejecuta como tarea aparte después de validar primitivos.

**Decisiones DP3, DP7 aplican**.

**Diferido**: cards con imagen full-bleed, cards interactivas con hover lift, cards skeleton. Cuando aparezca el caso.

**Criterio de salida**: `/design/surfaces` con Card + Panel + ejemplos de listado.

---

### Fase 3E — Breadcrumb y Tabs (3 días)

**Objetivo**: navegación interna en áreas anidadas.

**Entregables**:
- `<Breadcrumb items>` con variante mobile (truncado con `...` middle, solo último visible).
- `<Tabs>` con `<TabList>` + `<TabPanel>` basado en patrón de Next.js (route segments) cuando los tabs son rutas reales, o estado client cuando son secciones lógicas. Documentar cuándo usar cada uno.

**Decisiones DP4, DP5, DP6 aplican**.

**Diferido**: tabs scrollables horizontalmente, tabs con badges. Cuando aparezca.

**Criterio de salida**: `/design/navigation` con breadcrumb + ambas variantes de tabs.

---

### Fase 3F — Tarjetas de trámite y Stepper (1 semana)

**Objetivo**: patrón gob.ar de landing pública + flujos multi-paso.

**Entregables**:
- `<TramiteCard>` patrón típico gob.ar: ícono grande, título, descripción 2-3 líneas, CTA. Variantes: vertical (default) y horizontal (con imagen al lado).
- `<Stepper>` para flujos multi-paso (adopción, intake, denuncia D2). Indica progreso, paso actual, completados. Mobile-first: stepper compacto que muestra "Paso 2 de 5" + dots.
- Layout `<FormPage>` que combina breadcrumb + título + lead + stepper opcional + form + footer fijo de acciones.

**Decisiones DP4, DP5, DP7, DP10 aplican**.

**Diferido**: stepper editable (volver a pasos previos), stepper vertical para mobile alto, stepper con guards async. Cuando lo necesite intake o denuncias en concreto.

**Criterio de salida**: `/design/patterns` con TramiteCard + Stepper + landing pública demo + `FormPage` aplicado a un flujo real.

---

### Fase 3G — Banner sitio y páginas de error (3 días)

**Objetivo**: comunicación a nivel app + errores con identidad oficial.

**Entregables**:
- `<SiteBanner>` ya prevista en 3B pero integrada al `<AppHeader>` opcionalmente.
- `app/not-found.tsx` (404), `app/error.tsx` (500), `app/forbidden.tsx` (403) con identidad consistente: ícono grande, título grande, mensaje claro, sugerencia de acción, botón a inicio.

**Decisiones DP9, DP10 aplican.**

**Diferido**: páginas de error con búsqueda integrada, página de mantenimiento. Cuando aparezca.

**Criterio de salida**: las 3 páginas funcionando + screenshot test (cuando esté Fase 2 visual regression).

---

### Fase 3H — Empty states con ilustraciones (1 semana)

**Objetivo**: que vistas vacías comuniquen, no solo informen.

**Entregables**:
- `<EmptyState icon|illustration title description action>` componente.
- Set inicial de 6-8 ilustraciones oficiales Poncho o creadas ad-hoc (mascota + lupa, refugio, libreta, denuncia, sin notificaciones, sin turnos).
- Aplicación a las 6 pantallas con listados vacíos más frecuentes.

**Decisiones DP9, DP10 aplican.**

**Diferido**: ilustraciones animadas. Set completo de ilustraciones para todos los empty states. Encargo de ilustraciones a designer si el ROI no aparece desde el principio.

**Criterio de salida**: `<EmptyState>` con 6 ilustraciones + aplicado a las 6 pantallas críticas.

---

### Fase 3I — Tablas y paginación (1 semana, solo si admin lo requiere)

**Objetivo**: vistas administrativas con datos densos.

**Entregables**:
- `<Table>` semántica con `<Thead>`, `<Tbody>`, `<Tr>`, `<Th>`, `<Td>`, soporte para `sticky header`, zebra opcional, hover, mobile responsive (scroll horizontal o card layout colapsado).
- `<Pagination>` con cursor-based para listados grandes.
- `<TableFilters>` patrón con `<Field>` + chip badges + clear all.

**Decisiones DP4, DP5, DP7 aplican.**

**Diferido**: tablas con sort headers, tablas con expansión por fila, virtual scroll. Cuando admin lo pida en concreto.

**Criterio de salida**: `/design/data` con tabla + paginación + filtros + ejemplo de listado admin.

---

### Fase 3J — Branding oficial (diferido)

**Objetivo**: cuando se defina el organismo titular, sumar marca oficial.

**Entregables previstos**:
- SVG del escudo nacional en `public/brand/`.
- SVG de logos oficiales (argentina.gob.ar, organismo titular).
- Componente `<Brand variant="escudo|argentina|presidencia|organismo">` con espacios de respeto correctos.
- Variante "institucional fuerte" del `<AppHeader>` para páginas como `/gob`, `/org`, `/acerca`.

**Estado**: diferido hasta que se defina el organismo titular. No bloquea pre-release.

---

## Diferido conscientemente

Estas cosas no entran en Fase 3 — el ROI no compensa el costo de implementación previo.

- **Charts / big numbers de dashboard**. Solo si admin lo requiere antes de pre-release. Si no, usar Recharts ad-hoc cuando aparezca.
- **Social share buttons**. Cuando aparezca el caso real (mascotas perdidas con share masivo).
- **Calendar / date picker custom**. Native `<input type="date">` cubre el 90% de los casos. Custom solo para slots de turnos veterinarios si el nativo no alcanza.
- **Lightbox / galería de fotos**. Cuando el listado de mascotas crezca a 5+ fotos por mascota.
- **Mapa con estilo Poncho** (`poncho-map.css`). Mantenemos maplibre-gl con tema custom; el wrapping con Poncho llega si hay necesidad de consistencia visual cross-org.
- **`device-breadcrumb.css`** versión mobile. El Breadcrumb de Fase 3E ya cubre mobile con truncado responsive — no hace falta importar el CSS específico de Poncho.
- **Marcas oficiales en preview**. Hasta que esté definido el organismo, sin escudo.
- **Variantes de header institucional fuerte**. Misma razón.
- **Internationalization** del microcopy. La app es es-AR; si se suma pt-BR o en-US se planifica aparte.

---

## Resumen ejecutivo

| Sub-fase | Duración | Estado |
|---|---|---|
| 3A — Formularios | 1 semana | Próximo paso |
| 3B — Alertas + toasts | 2-3 días | |
| 3C — Modales | 2-3 días | |
| 3D — Card / Panel | 3 días | |
| 3E — Breadcrumb + Tabs | 3 días | |
| 3F — Tarjetas trámite + Stepper | 1 semana | |
| 3G — Banner + páginas de error | 3 días | |
| 3H — Empty states + ilustraciones | 1 semana | |
| 3I — Tablas + paginación | 1 semana | Solo si admin lo requiere |
| 3J — Branding oficial | — | Diferido hasta organismo titular |

**Total Fase 3 (sin 3J)**: ~5-6 semanas a tiempo parcial.

Las 13 decisiones marcadas (DP1-DP13) son cómo MiMAR aplica Poncho — para siempre.
