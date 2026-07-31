# PENDIENTES — cola única de trabajo abierto

> **Solo lo que falta.** Lo cerrado vive en los planes del 29, 30, 31 y 01-08.
> Actualizado 2026-08-01 tras las 10 reviews adversariales (RA-1..RA-10).
>
> **Marcador**: ~95 hallazgos confirmados · 34 cerrados · **61 abiertos**, de los
> cuales 19 están en cola ahora mismo.

---

## 🚨 GATE DE DEPLOY — antes de que esto sirva en un entorno real

Cuatro acciones manuales. Ninguna es código.

1. **Migración `0162`** (`welfare_reports_jurisdiction_unverified`). Sin ella
   **toda query de welfare da 500** y el circuito de denuncias entero se cae.
2. **Migraciones `0163` y `0164`** (las dos vulnerabilidades de RA-8), en ese
   orden, **migraciones primero y código inmediatamente después**: `0164` sin el
   código ciega a todo visor de evidencia; el código sin `0164` no rompe nada.
   Verificar antes que `SUPABASE_SERVICE_ROLE_KEY` esté en el runtime destino.
3. **`DEMO_PET_TOKEN` en Vercel + sembrar el flagship.** Hasta entonces la landing
   degrada a propósito: QR inerte, token enmascarado, sin link.
4. **El Gmail personal del PO viaja a Nominatim** en el `USER_AGENT` de cada
   geocodificación (`lib/infra/geocoding.ts:62`). Sin tocar a propósito: OSM exige
   un contacto **monitoreado**, así que moverlo a `hola@mimar.ar` solo es seguro
   si alguien lee esa casilla. `SECURITY.md:12` lleva la misma dirección.

---

## EN COLA AHORA (3 agentes)

| Unidad | Qué |
|---|---|
| **RA-9 barreras** | Las 7 de accesibilidad. BR-1 es el único `<dialog>` del repo sin `showModal()` — no-modal sobre un acto que quita custodia legal bajo Ley 14.346. BR-3 es una línea y hace que los 4 modales de esta ola por fin anuncien su consecuencia |
| **Fence que lea `.css`** | `app/globals.css` (4184 líneas) está fuera de todos los fences por diseño. Congelar la deuda como ratchet, **no** arreglar las 130 declaraciones |
| **RA-2 flujos rotos** | F6, F7, F8, F11, F13, F14 — los que rompen algo para un usuario hoy |

---

## 🔴 P1 — rompe algo para un usuario, sin cola

| # | Qué | Dónde |
|---|---|---|
| **RA-2 F4** | Firmar un chip distinto al canónico **deja el canónico intacto en silencio**: la espina guarda el chip B verificado, la ficha sigue mostrando el A, sin aviso | `microchip-use-case.ts:124`, `events-repository.ts:197` |
| **RA-2 F5** | `replaceMicrochipVetAction` sigue usando el `redirect()` dentro de la acción que el resto migró, con comentario explicando por qué | `microchip/reemplazar/action.ts:118` |
| **RA-2 F9** | Un `org.transfer.propose` concedido es **inerte**: la página chequea rol de membresía, nunca capacidades — y el mensaje "Solo roles admin o coordinator" es **falso** | `transferencias/nueva/page.tsx:52-53` |
| **RA-2 F10** | "Enviar documentación" apunta a una página sin nada que enviar; `done: input.isVerified` **nunca puede darse vuelta desde adentro de la org** | `org-setup-checklist.ts:120-127` |
| **RA-2 F12** | "Recargar lista" no recarga en la cola **destructiva**: cuentas revocadas siguen como activas con su botón vivo. Las dos colas no destructivas sí navegan | `BulkRevokeList.tsx:273-279` |
| **RA-7 F4** | Un cambio de nivel fallido **vacía el canvas, pone los contadores en cero y no marca `degraded`** → la pantalla dice "sin datos" donde su propio docblock **prohíbe** ese texto y exige "no pudimos calcular esta capa a tiempo" | `PanoramaConsole.tsx:1967-1978`, `:2013-2023` |

---

## 🟠 P2 — el gate miente

### Los fences más angostos que su propia doctrina
| # | Qué |
|---|---|
| **RA-8 estructural** | **10 archivos `"use server"` invisibles a los tres linters de authz** (el glob es plano). Incluye 8 acciones de escritura médica en atender y tres exports sin guard |
| **RA-8 estructural** | `check-authz-scoping` **se derrota con un comentario** — la palabra "jurisdiction" en cualquier parte del cuerpo cuenta como prueba. Baseline: 41 acciones tenant-guarded pero sin scopear |
| **RA-8 estructural** | `check-rls-coverage` solo verifica que **exista** una política, nunca su contenido, roles, cláusula `TO` ni GRANTs. Por eso R1 pasó limpio con tres políticas |
| **RA-8 estructural** | **8 políticas sin cláusula `TO`** → caen a `PUBLIC` (incluye anon). Hoy son seguras por accidente, vía predicados `auth.uid()`, no por diseño |
| **RA-8 estructural** | `middleware.ts` **no hace autorización**. Cada ruta se auto-gatea, sin red de seguridad |
| **RA-2 F16** | `lint:nav` prohíbe **solo `router.refresh(`** mientras su docblock nombra push/replace. **20 sitios vivos** |
| **RA-2 F15** | El fence N3 reporta **cero deuda falsamente** — 8 `redirect()` en módulos de caso de uso, fuera de sus dos globs |

### Tests que no guardan nada
| # | Qué |
|---|---|
| **P2.1** | **Los 4 rojos de `final-seams`** — el PO pidió investigarlos antes de decidir si jubilar la spec. **Sin hacer** |
| **RA-4 F8** | Un test de scope de gobierno que **nunca ejecutó una aserción** desde que se escribió: el primer test del archivo deja al usuario en un estado que hace fallar su `submit`, y el `if (!submit.ok) return` se traga todo |
| **RA-4 F9** | Un guard cross-org que **nunca llama a la acción que guarda** — la aserción de cierre es tautológica por construcción |
| **RA-4 F5-F7** | El `pet-carousel-dots` muerto, el chequeo de "cero disfrazado de supresión" que nunca inspecciona un numérico, y warn-and-skip en tests de constraint |
| **RA-9 EI-4/5/6** | Dos gates de axe que se auto-jubilan con `test.skip` sobre data vacía (uno es el "momento héroe", Ley 26.653) · `qa-panorama-a11y.ts` es un generador de reportes vendido como gate (no lo cita nadie) · dos aserciones de touch-target que matchean el documento entero |
| **RA-7 F8** | `cube-parity` es **vacuo justo donde importa**: a grano provincia compara literales contra literales; a grano nacional el loop de valores saltea toda celda suprimida |
| **P2.8** | `rls/matrix` tiene guards por celda que lanzan, pero el patrón hermano sigue vivo en **13 tests de aislamiento cross-tenant** |
| **P2.5** | `owner-ia-p6` 1/2/10 y `synthetic` (c)/(d) trabados en skeletons de Suspense pasado el presupuesto de 8s |

---

## 🟡 P3 — el panorama contándose distinto a sí mismo

| # | Qué |
|---|---|
| **RA-7 F5** | Dice **"se midieron 10 jurisdicciones"** cuando midió 24 — un tope de display reportado como conteo de medición |
| **RA-7 F6** | **Cuatro respuestas distintas** a "cuántas celdas están protegidas", todas pudiendo estar en pantalla a la vez (píldora, pie del PNG, caption de Registros, línea del ranking) |
| **RA-7 F7** | Un sello de cubo en **cualquier** capa se traga el aviso de tope de **todas** las otras |
| **RA-7 F9/F10** | Dos claves de leyenda más que describen estados que el frame puede no contener; y el estado "falta un eje" del bivariado se **pinta pero nunca se declara** |
| **RA-3 C8** | Diferenciación cruzada por **denominadores anidados** en datos abiertos: `perros_registrados` es subconjunto de `mascotas_activas`, la resta da las no-perro. Ambas celdas pasan su propio k-check; la regla conjunta compara **nombres** de columna |
| **C1 5ª instancia** | El resto de la tira de KPIs (`microchip`, `ppp`, `reunificacion`, el pie de `coverageDenominator`) publica sobre un alcance retenido. **No se ensanchó a propósito** — mordeduras/zoonosis/denuncias tienen otros denominadores y meterlos bajo un veredicto calculado sobre mascotas registradas sería la sobre-corrección de RA-1 |
| **RA-1 C3** | El triage de maltrato **perdió la edad** de una denuncia no vencida: `SlaBadge` solo la muestra en la rama vencida, así que una de hoy y una de hace 13 días se ven idénticas |

---

## ⚪ P4 — comentarios que mienten y deuda declarada

| # | Qué |
|---|---|
| **RA-5 #1** | **El sitio 14 de la familia de los 13**, y está en el **dispatcher**: `get-layer-features.ts:311-313` dice "Province level has no k-anon" mientras el archivo al que despacha dice lo contrario en su línea 54 |
| **RA-5 #3** | `repository-choropleth.ts:96-100` re-cita la premisa retirada — **violando una prohibición escrita textual** en un módulo hermano |
| **RA-5 #4-#9** | El header de `AppShell` describe una migración "Fase A" con tres chromes que **no existen** · el comentario del fence de los 703 sigue justificando un diferimiento ya ejecutado · `check-authz-scoping` tiene el conteo derivado (41/16, dice 49/21) · un constraint citando la migración equivocada · un test que promete paridad y **no compara nada** |
| **RA-1 C5 / RA-10 D4** | **21 pesos inertes**, no 6: Mono carga 400/600 y Serif 500/600, así que `font-bold` da 600 y `font-medium` da **400**. Incluye los tres primitivos del tier operador, con comentarios que dicen "9px bold" |
| **RA-10** | ~20 hallazgos de estética. Los que se ven: la **libreta de vacunas clipea a 390px** (sin `overflow-x-auto` en toda la cadena) · **"Luna · Hembra · PERDIDO"** en la home del dueño · la micro-tipografía de la credencial pública a **8px** · el botón "Crear cuenta" es un rectángulo de 8px a un click de píldoras · `CaseStatus.open` se dice de **cinco maneras** · **22 diccionarios de estado** hechos a mano · 5 radios de chip conviviendo |
| **P2.6** | El worker de Windows (`0xC0000409`). **No bloquea** — no reproduce en Linux |
| **P2.7** | El limpiador de huérfanos cubre 4 de ~20 prefijos. Propuesta escrita, **sin implementar a propósito**: cambia un script que BORRA |
| **P3.2** | `jurisdictionProvince` sin `z.enum` → error crudo de Postgres al usuario |
| **P3.3** | El aviso de capa desconocida enterrado en un dock colapsado. `PanoramaConsole.tsx` está en su fence |

---

## Decisiones del PO ya tomadas sobre esta cola
- **`/gob/perdidas`**: la supresión **queda**. Des-suprimir después es una línea; shipear el tier desnudo no es reversible.
- **Primer admin**: al backlog. No bloquea hasta provisionar un municipio real.
- **Deuda estética**: **el fence primero**, después el codemod.
- **Las 7 barreras de a11y**: todas ahora.

## Pendiente de decisión del PO
- **El walk-in de Atender usa conocer el token del QR como prueba de consentimiento.** Cualquier organización con `event.write` puede escribir eventos permanentes e irreversibles sobre **cualquier mascota del país** desde una foto de la chapita. Es diseño, no bug.
- **`/gob` dice "las métricas con meta están dentro de rango"** cuando no se midió nada.
- Ratificación acumulada: R1-R10, N1-N4, y las de esta corrida.
