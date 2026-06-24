# Wave 2 — UX hardening — technical dev handoff (Items 8–15, 24)

> **Status:** 🟢 Ready for Claude Code · **Date:** 2026-06-18 · **Wave 2 del paquete metrics-IA**
> · Umbrella: `2026-06-18-metrics-ia-handoff-design.md` · De la crítica forward-looking 2026-06-18.
>
> **SECUENCIA — leer:** Wave 2 corre **al final del bloque autónomo**, después de Items 0–7 + Location P1/P2/P3.5.
> **CC ya está ejecutando: NO reordenes ni interrumpas lo en curso. Esto se toma cuando lo anterior está cerrado.**
> Items independientes entre sí (salvo donde se indica); priorizá 8 → 9 → 10, luego 11 → 12 → 13 → 14 (depende de Items 5 y 6) → 15 (corrección por enmienda; independiente, pero conviene tras Item 6 por `/historial`).

Formato: dev-handoff (layout, tokens, componentes/props, estados, responsive, edge cases, motion, a11y). Tokens reales del repo: `--color-ln-paper/ink/line/azul-900`, `--color-ln-op-navy/card/ink/mute/line`, `--font-ln-serif/sans/mono`. Componentes existentes: `Op*` (dashboard), `Ln*` (owner), `LnEmptyState`, `WizardShell`, `SuccessScreen`, `ConfirmDialog`.

---

## Item 8 — Loading & skeleton states (perceived performance) 🔴

### Overview
Hoy `loading.tsx` = **0** en toda la app; casi todo es `force-dynamic` con round-trip a Postgres → cada navegación congela la pantalla. Es PWA mobile y los dashboards de Items 2–4 suman agregación server-side. Objetivo: **el shell (Item 7 `AppShell`) pinta instantáneo; el contenido cae por streaming con skeletons.**

### Layout / arquitectura
- Un `loading.tsx` por segmento pesado: `app/gob/`, `app/admin/`, `app/org/[orgToken]/`, `app/gob/(cada subruta con fetch pesado)`, `app/(app)/mis-mascotas/[publicToken]/`, `app/(app)/inicio/`, **y los segmentos `(public)`** (`/adoptar`, `/refugios/[orgToken]`, `/casos/[publicCode]`, `/p/[publicToken]`). Lo público es la cara más visible y AGENTS marca `/p` mobile como "must be fast" (Track D) — incluir budget Lighthouse mobile para `/p`.
- Patrón preferido: el layout (shell) queda fuera del `Suspense`; el `main` envuelve los fetchers pesados en `<Suspense fallback={<XSkeleton/>}>` para **streaming** (no bloquear el shell). `loading.tsx` cubre el caso de navegación full-segment.

### Componentes nuevos
| Componente | Props | Notas |
|---|---|---|
| `components/ui/Skeleton.tsx` | `{ w?, h?, radius?, className? }` | Base con shimmer; átomo de todos los demás |
| `components/ui/dashboard/OpKpiSkeleton.tsx` | — | Igual footprint que `OpKpi` (evita layout shift) |
| `components/ui/dashboard/OpCardSkeleton.tsx` | `{ rows? }` | Para `OpCard` con tabla/lista |
| `components/ui/LnCardSkeleton.tsx` | — | Variante owner (paper) |

### Design tokens
| Token | Uso |
|---|---|
| `--color-ln-line` / `--color-ln-op-line` | color base del placeholder |
| gradient shimmer | `linear-gradient(90deg, line 0%, card 50%, line 100%)` animado |

### States & motion
| Elemento | Estado | Comportamiento |
|---|---|---|
| Skeleton | default | shimmer `1.5s linear infinite` |
| Skeleton | `prefers-reduced-motion` | **sin animación**, placeholder estático |
| Región | cargando | `aria-busy="true"` + `role="status"` con SR-text "Cargando…" |

### Edge cases
- **Conexión lenta (el porqué):** el shell instantáneo + skeleton evita la sensación de "colgado". Mismo footprint que el contenido real → **cero layout shift (CLS)**.
- **Error:** ya existe `error.tsx` por segmento; el skeleton es solo para el estado de carga.
- **Llega vacío:** el skeleton se reemplaza por `LnEmptyState`, no por skeleton infinito.

### Tests
- Que cada segmento pesado tenga `loading.tsx`. Visual/RTL: el skeleton expone `role="status"` y respeta `prefers-reduced-motion`. (No e2e de timing.)

---

## Item 9 — Event-forms long-tail: consistencia + mobile 🟡

### Overview
Los 17+ forms de `eventos/nuevo` (que tras Item 6 reciben todo el tráfico vía `/anotar`) no tuvieron pase de consistencia ni de mobile. Auditar contra las 4 reglas de diseño (`AGENTS.md → Design rules`) y pulir mobile.

### Auditoría (matriz a completar por CC, una fila por form)
| Form | Verbo correcto (regla 2) | `WizardShell` si ≥3 pasos/destructivo (regla 3) | `SuccessScreen` si trámite (regla 4) | L1/L2 correcto (regla 1) | Mobile OK |
|---|---|---|---|---|---|
| vacuna, antiparasitario, peso, vet, clinico, microchip, microchip-reemplazo, mordedura, esterilizacion, medicacion-inicio, medicacion-fin, embarazo, fallecimiento, tatuaje, nota, atestar-raza, checkin | … | … | … | … | … |

### Especificación mobile (aplica a todos)
| Elemento | Spec |
|---|---|
| Touch target | ≥ 44×44px (CTA, chips, selects) |
| Inputs | `font-size ≥ 16px` (evita zoom iOS); `inputmode`/`enterkeyhint` correctos (`numeric` para peso/dosis, `tel` para teléfono) |
| CTA primaria | footer **sticky** en `WizardShell` (alcanzable con pulgar); un solo primario por paso |
| Errores | inline bajo el campo, `aria-describedby`, foco al primer error en submit fallido |

### States
| Elemento | Estado | Comportamiento |
|---|---|---|
| Submit | loading | spinner + disabled + texto "Registrando…" |
| Submit | error | alerta arriba (`OpFormAlert`/equivalente owner) + foco |
| Form | éxito (trámite) | `SuccessScreen` con código + próximos pasos (no redirect mudo) |

### Edge cases
- Texto largo (nombre de vacuna/clínica): truncar con tooltip, no romper layout.
- Sin conexión a mitad de submit: estado de error recuperable, no perder lo cargado.

### A11y
- Orden de foco lógico; labels asociadas; el `SuccessScreen` mueve foco al heading de confirmación.

---

## Item 10 — Operator action layer: búsqueda global + selección en lote 🟡

### Overview
Los dashboards muestran agregados; falta ir del agregado al **registro puntual** y **actuar en lote**. Dos piezas: omnibox de búsqueda y patrón de bulk-select.

### 10.1 Búsqueda global (`ContextSearch`)
- **Ubicación:** slot `actions` de `OpTopbar` (operador). Atajo teclado `/` o `⌘K`.
- **Query:** mascota (nombre/DIM token/chip), persona (nombre/DNI), caso (publicCode). Scope-aware (jurisdicción del operador) + log de PII-query (igual que `/gob/usuarios`).
- **Componente:** `components/ui/dashboard/OpOmnibox.tsx` — input + dropdown de resultados agrupados por tipo, navegable con teclado.

| Estado | Comportamiento |
|---|---|
| vacío | placeholder "Buscar mascota, persona o caso…" + hint del atajo |
| escribiendo | debounce 250ms, `role="combobox"` + `aria-activedescendant` |
| sin resultados | "Sin coincidencias en tu jurisdicción" |
| cargando | spinner inline en el dropdown |

### 10.2 Selección en lote (bulk)
- Ya existe `bulkRevokeAction` server-side sin UI completa — esta es la UI genérica.
- **Patrón:** columna de checkbox en las colas (`/gob/cola`, usuarios, organizaciones, maltrato) + **barra de acción sticky** que aparece cuando hay ≥1 seleccionado.
- **Componente:** `components/ui/dashboard/OpBulkBar.tsx` `{ count, actions[] }`.

| Estado | Comportamiento |
|---|---|
| nada seleccionado | barra oculta |
| algunos | "N seleccionados" + acciones + "limpiar" |
| todos (header checkbox) | seleccionar página; opción "seleccionar los N de la consulta" |
| acción destructiva | `ConfirmDialog` con motivo obligatorio (mín. 5 chars, igual que las server actions) |

### A11y
- Checkbox header con `aria-label`; barra bulk con `role="region" aria-label="Acciones en lote"`; conteo anunciado por `aria-live="polite"`.

---

## Item 11 — Accessibility hardening fuera de Track E 🟡

### Overview
Track E cubrió 3 flujos (credencial, denuncia, owner app). Faltan **tablas densas operadoras**, los **nuevos KPIs/charts** (Items 2–4) y el long-tail de forms (Item 9). Ley 26.653 aplica a todo.

### Checklist técnico
| Área | Requisito |
|---|---|
| KPIs/badges | significado **no solo por color**: `OpStateBadge`/`OpBreach` llevan icono + texto, no solo verde/rojo |
| Charts | alternativa textual: `<table>` oculta o `aria-label` con el resumen; foco/hover con teclado |
| Tablas densas | `<th scope>`, orden de foco por fila, sin trampas de foco; `caption` por tabla |
| Bulk-select (Item 10) | navegable y operable 100% por teclado |
| Contraste | los tiles nuevos pasan WCAG AA con tokens `--color-ln-op-*` (verificar los acentos sobre navy) |
| Automatizado | extender el pase `axe` del e2e (Track E) a `/gob/*`, `/admin/*`, `/org/*`, `/anotar` **y las públicas restantes** (`/adoptar`, `/refugios`, `/casos`, `/libreta/compartir`, `/r/invite`) — son las de mayor exposición (Ley 26.653); Track E solo cubrió credencial+denuncia+owner |

### Edge cases
- Texto internacional/largo en labels de chart no debe romper el alt-text.
- `prefers-reduced-motion` también aplica a transiciones de tiles/skeletons (Item 8).

---

## Item 12 — Case (expediente) UX coherence 🟢→🟡

### Overview
El "caso" es la abstracción central pero su UI vive dispersa (`casos`, `maltrato`, `decomisos`, `disputas`, `observaciones`), cada una distinta. Unificar el **case-detail** y la **cola**. (Datos: ya definidos en el cases-system spec; esto es la capa de presentación.)

### Componentes
| Componente | Props | Notas |
|---|---|---|
| `CaseDetailShell` | `{ code, kind, status, parties[], children }` | Header consistente: `OpCodeBadge` (código), `OpStateBadge` (estado), partes, normativa aplicable; tabs (Resumen/Timeline/Adjuntos/Acciones) |
| `CaseQueue` | `{ rows, filters, bulk? }` | Cola unificada con los mismos filtros/orden y bulk (Item 10) |

### States
| Estado de caso | Badge |
|---|---|
| open / escalated / closed / merged | tono consistente cross-kind (no inventar por pantalla) |

### Edge cases
- Caso con sujeto `unowned_animal` (sin pet registrada): header degrada con gracia.
- Multi-parte (disputa): lista de partes con rol, sin romper en mobile.

---

## Item 13 — Onboarding aha: primera mascota → credencial QR 🟢

### Overview
Estados vacíos buenos, pero el "aha" (tu mascota tiene una **credencial QR verificable**) no se entrega guiado. Cerrar el loop post-signup.

### Flujo
1. Post-signup (o desde el empty-state de `/mis-mascotas`) → wizard "Registrar tu primera mascota" (`WizardShell`).
2. Al crear → **`SuccessScreen` que muestra el QR de la credencial** (`PetCredentialCard`) con CTAs: "Compartir", "Imprimir cartel A4", "Ver perfil".

### Spec
| Elemento | Spec |
|---|---|
| QR | render del `publicToken` (reusar `PetCredentialCard`); tamaño ≥ 200px en el success |
| CTAs | máx 3, regla de 4 verbos; "Compartir" usa Web Share API con fallback a copiar link |
| Copy | celebratorio pero sobrio (owner-voice guide) |

### Edge cases
- Usuario que entró con `intent=apply` (adopción): no forzar el wizard de mascota; respetar el `returnTo`.
- Sin foto: credencial con placeholder, no bloquear el aha.

### A11y
- Foco al heading del `SuccessScreen`; QR con `alt`/descripción textual del link.

---

## Item 14 — Owner hub & libreta como artefacto 🟡

> Depende de Item 5 (nudges) e Item 6 (`/anotar` canónico) existentes. De la crítica owner 2026-06-18.

### 14.1 — Reordenar `/cuenta` (IA del hub)
**Overview:** `app/(app)/cuenta/page.tsx` termina en una lista plana ("01 Acciones", `LnRegRow`) de ~10 ítems que mezcla rutina, **destinos ya duplicados en el nav** (Notificaciones, Mis denuncias, Mis organizaciones) y **destructivo** (Renunciar a rol, Desactivar — rojo) en el mismo nivel. Es la última IA owner sin reordenar (equivalente de lo que Item 6 hizo al perfil y Item 1 al nav operador).

**Layout target:** mantené identity card → verificaciones → privacidad; reemplazá la lista plana por grupos bajo `LnSectionHead`:
| Grupo | Ítems |
|---|---|
| Tu información | Editar mi información |
| Rol y organizaciones | Convertirme en profesional/organización · Crear consultorio · Mis organizaciones (solo si NO está en el nav) · Mis solicitudes · Tránsitos · Renunciar a rol veterinario |
| Privacidad y datos | Privacidad y derechos (Ley 25.326) |
| **Zona de riesgo** | Desactivar mi cuenta — **separada visualmente** (borde/tono de error), con `ConfirmDialog` (motivo, igual que hoy) |

**Quitar:** los ítems que ya viven en `OWNER_NAV` (Notificaciones, Mis denuncias) — no duplicar destinos (más visible tras Item 7, fuente única de nav).

**States/edge:** ítems de rol vet/foster aparecen según rol/capabilities; sin rol vet, "Renunciar" no se muestra. **A11y:** heading por grupo; la zona de riesgo claramente etiquetada y fuera del flujo de tab rutinario.

### 14.2 — Contrato aviso→acción (cerrar el loop)
**Overview:** garantizar que una notificación/nudge accionable lleve a la **acción prellenada en un toque** y vuelva, en vez de a una lista.

**Contrato:** cada notificación/nudge accionable expone un `actionHref` canónico → el form directo prellenado o `/anotar?kind={x}&pet={token}` (el hub ya acepta `kind`). Al confirmar → `SuccessScreen`/toast + retorno al origen (`returnTo`).

| Superficie | Cambio |
|---|---|
| Nudges de Item 5 (`/inicio`) | cada nudge con `actionHref` (vacuna vencida → form vacuna prellenado con la mascota) |
| Inbox `/notificaciones` | filas accionables con deep-link a la acción, no a una lista |
| Reminders (`vaccine-due` cron) | la notificación emitida incluye `actionHref` |
| `/anotar` | confirmar que `?kind=&pet=` prellena y respeta `returnTo` |

**Edge/idempotencia:** si la acción ya se hizo, el deep-link muestra estado "hecho", no un form duplicado. **`/inicio` mobile:** en el colapso a 1 columna, los nudges accionables van **antes** que los widgets informativos.

### 14.3 — Libreta como artefacto (consumir / compartir / exportar)
**Overview:** la libreta sanitaria es el valor central para el dueño, pero su UX de consumo está dispersa: el share es un sheet enterrado (`_share-libreta/ShareLibretaSheet.tsx`) y el export PDF está diferido (solo existe el cartel de perdido).

| Pieza | Spec |
|---|---|
| `ShareLibretaManager` | vista (no sheet enterrado) con **shares activos**: qué ve el vet (Tier 2), **vencimiento** del token, botón **revocar**. Modelo mental explícito de "quién puede ver y hasta cuándo". |
| `ExportLibretaButton` | **PDF de la libreta** (no solo cartel): estructura por tipo de evento + cronología; server-side on-the-fly si `pet_attachments` aún no está. |

**Edge:** libreta vacía (empty state, no PDF roto); token expirado (estado claro + re-emitir); pet sin eventos. **A11y:** PDF con estructura/etiquetas; lista de shares operable por teclado. **Nota:** engancha con `pet_attachments` (diferido) — si no está, el PDF se genera al vuelo y no se persiste.

---

## Item 15 — Corrección por enmienda (principio #2) 🟡

> **Implementa un principio locked, no lo rompe.** `AGENTS.md → Core principles #2`: *"Corrections are new events that reference earlier ones. No event is ever edited or deleted."* Hoy ese principio está declarado pero **no construido** (no hay event type de corrección ni UI). Esto lo construye. NO es owner-only.

### Problema
El log es append-only (RLS sin UPDATE/DELETE en `pet_events`) y no existe enmienda. Un dato mal cargado (fecha de vacuna, peso, visita) queda **incorrecto y visible para siempre** en la libreta — el documento sanitario que se le muestra al veterinario. Tensión clásica de logs inmutables, universal a todo owner.

### Decisiones cerradas
- **D1 — Enmienda = evento nuevo, nunca UPDATE/DELETE.** Nuevo event type `event_amended` (alta = one-line en `EVENT_TYPES` de `db/schema.ts` + Zod en `lib/event-schemas.ts`, sin migración, per la regla de extensión del catálogo). Payload reusando shapes existentes:
  `{ target_event_id, reason, changes: [{field, old, new}], actor_role: owner|vet|admin|govt, actor_user_id }` — `changes` calca `pet_profile_updated`; `actor_role/actor_user_id/reason` calca `microchip_replaced`.
- **D2 — Proyección (principio #7).** La libreta/timeline aplica la **última enmienda** al render; el evento original permanece en el log y se ve completo en `/historial`. El valor vigente muestra un indicador "Corregido el {fecha}" expandible al original. No se oculta nada.
- **D3 — Autoría por capability, no por rol (principio #3).** Quien puede escribir ese `event_type` puede enmendar el suyo: owner sus eventos; vet (Tier 4 futuro) los clínicos que cargó; admin/govt con `actor_role` propio. La affordance "Corregir" aparece solo si el viewer tiene la capability sobre ese evento.
- **D4 — Allowlist de enmendables.** Solo eventos clínicos rutinarios: `vaccination_administered`, `deworming_administered`, `weight_recorded`, `vet_visit_logged`, `clinical_info_logged`, `medication_started`, `note_added`, `sterilization_performed`. **No enmendables** (tienen flujos propios o peso legal/forense): `death_recorded`, `incident_reported`, `rabies_observation_*`, `disease_reported`, custodia/adopción (`adoption_reversed`/`custody_dispute_*` ya cubren su reversa). Para esos, "corregir" = su flujo dedicado, no `event_amended`.
- **D5 — Enmienda de admin/govt = acción sensible.** `reason` obligatorio (mín. 5 chars, como las otras acciones), va al **audit log**, y **notifica al owner** (tipo de notificación nuevo: "Un administrador corrigió un registro de {mascota}"). El admin no edita el viejo: apila enmienda visible. Transparencia total.

### Components (dev-handoff)
| Componente | Props | Notas |
|---|---|---|
| `AmendEventButton` | `{ eventId, eventType, canAmend }` | en `eventos/[eventId]`; render solo si `eventType ∈ allowlist` y `canAmend` |
| `AmendEventForm` | `{ event }` | prellena los valores actuales; al confirmar → `ConfirmDialog` con `reason` |
| `AmendedBadge` | `{ amendedAt, originalHref }` | indicador "Corregido el {fecha}" en la libreta, link al original en `/historial` |

### States / edge
| Estado | Comportamiento |
|---|---|
| evento no enmendable | sin botón "Corregir" (no error: simplemente no aplica) |
| sin capability | botón oculto |
| admin enmienda | `reason` obligatorio + warning "esto notifica al dueño y queda en auditoría" |
| enmienda de enmienda | permitida; siempre referencia el `target_event_id` original (cadena auditable) |
| evento ya enmendado | la libreta muestra el valor vigente; el original queda accesible, no se pisa |

### A11y
- "Corregir" con label claro; el `AmendedBadge` anuncia "registro corregido" a screen reader; foco al heading del form; el original sigue navegable por teclado en `/historial`.

### Por qué suma al norte
Libreta = documento sanitario compartido con vets y (futuro) gobierno → corregible-pero-auditable = confianza + integridad. Principio #8: datos limpios mejoran la señal poblacional sin perder trazabilidad. Cierra la brecha entre el principio #2 (locked) y el código.

### Lo que NO está
- No edita/borra eventos (sería violar el #2).
- No enmienda eventos legales/forenses (allowlist D4).
- No backfill retroactivo de correcciones históricas.

---

## Item 24 — Público: login intent-aware + UX de token expirado 🟡

> De la crítica de pantallas públicas 2026-06-18. Independiente; público-facing. (El modo `landing` de las superficies de aterrizaje es decisión D13 de **Item 7**, no acá.)

### 24.1 — Login con contexto de intención
**Overview:** el gate de adopción ya preserva la intención (`apply-intent` JWT + `returnTo` + `intent=apply`) — está bien resuelto. Falta el **copy contextual**: hoy redirige a `/login?intent=apply` sin explicar por qué.

**Spec:** la pantalla de login/signup lee `intent` y muestra copy explicativo del gate ("Necesitás una cuenta para postularte, así el refugio puede contactarte"). Un mapa `intent → headline/subcopy` en la pantalla de auth. Cubrir los intents existentes (`apply`, y cualquier otro `returnTo`-driven). No cambia el flujo, solo lo explica.

### 24.2 — Estados de token expirado/revocado
**Overview:** superficies por token (`/libreta/compartir/[shareToken]`, `/r/invite/[token]`, y los share de Tier-2) deben dar un mensaje claro cuando el token venció o fue revocado, no un error genérico.

**Spec:** estado dedicado "Este enlace expiró / fue revocado" + acción contextual (pedir uno nuevo al dueño / a la org). Reusa `LnEmptyState`/`SuccessScreen` según corresponda.

| Caso | Comportamiento |
|---|---|
| token válido | render normal |
| token expirado | "El enlace de la libreta venció el {fecha}. Pedile al dueño uno nuevo." |
| token revocado | "Este enlace fue revocado por el dueño." |
| invite ya usado/expirado | mensaje + CTA a contacto de la org |

### A11y
- Copy de intención asociado al heading del form; estados de token con foco al mensaje y CTA operable por teclado.

---

## Cierre por item (todos)
SDD test-first, Biome/typecheck verdes, docs en el mismo PR, flippear la fila en `docs/superpowers/README.md`. Ante contradicción, gana el spec del feature correspondiente. Item 8 se ancla a Item 7 (shell instantáneo); Item 11 depende de que Items 2–4 (tiles) e Item 9 (forms) existan para auditarlos.

## Lo que NO está en Wave 2
- Push/email (depende de SMTP / P2 — infra, no UI).
- Chapa física (`/t/[serial]`) — spec aparte ya diferido.
- Rediseño de tokens/paleta — Wave 2 es hardening, no re-skin.
