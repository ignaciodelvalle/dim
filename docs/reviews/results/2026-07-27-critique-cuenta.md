# Crítica de diseño: Cuenta, transferencias y turnos (C6)

> **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4, ficha C6 · **Fecha**: 2026-07-27
> **Personas**: (a) dueña que le regala su mascota a un familiar — inicia una transferencia y espera; (b) dueño que no llega al turno — cancela.
> **Evidencia visual**: `docs/reviews/results/2026-07-27-critique-screenshots/cuenta/` — `desk-cuenta.png`, `desk-transferencias.png`, `desk-transferir-inicio.png`, `desk-FAIL-click.png`, `mob-cuenta.png`, `mob-transferencias.png`, `desk-index.json`.
> **Código**: `app/(app)/cuenta/`, `app/(app)/transferencias/`, `app/(app)/mis-turnos/`, `components/ui/VaulSheet.tsx`, `lib/ui/sheet-nav.ts`.
>
> **Declaraciones de evidencia**:
> - `[ENTORNO]` El seed no trae transferencias: el hub se capturó **vacío**. El estado vacío se critica como diseño (regla §2 del plan); las fases del handshake (pendiente emisor/receptor, aceptada, rechazada, expirada, cancelada) se evaluaron **desde código** y cada hallazgo así originado lo declara.
> - `[ENTORNO]` El bundle **no incluye capturas de /mis-turnos**: el flujo de cancelación de turno se evaluó íntegramente desde código (`MisTurnosSheetMounter.tsx`, `CancelButton.tsx`, `mis-turnos/[appointmentToken]/page.tsx`).
> - **Los tres PNG desktop de transferencias son el mismo archivo** (md5 `82080a85…` idéntico en `desk-transferencias.png`, `desk-transferir-inicio.png` y `desk-FAIL-click.png`): el click del harness a "Transferir" nunca encontró objetivo. No es falla del harness — es evidencia del hallazgo U1: en el hub **no existe** ningún elemento "Transferir" clickeable.
> - `desk-index.json` registra un error de consola en el run desktop: React #418 (hydration mismatch) — hallazgo U4.
> - Datos sintéticos (Noelí Assandri, `noeli@dim.test`) — no criticables.

---

## Impresión general

**/cuenta (2 segundos)**: página seria y ordenada. Título serif, tarjeta de identidad, verificaciones, cuatro grupos numerados 01–04 y una "Zona de riesgo" en rojo que se ve exactamente tan peligrosa como es (`desk-cuenta.png`, `mob-cuenta.png`). Un organismo público reconocible; nada grita, nada tiembla. La respuesta a "¿lo serio se ve serio?" acá es sí.

**/transferencias (2 segundos)**: la página más importante para la persona (a) es la más floja del scope. Dos listas vacías con una línea de texto cada una y **ninguna forma de hacer lo que el título promete** (`desk-transferencias.png`). La dueña que quiere regalarle la perra a su hermana entra a "Transferencias"… y no puede transferir. El propio harness lo demostró mecánicamente: buscó "Transferir" para clickear y capturó tres veces la misma pantalla (`desk-FAIL-click.png`). El camino real existe y es bueno — perfil de la mascota → sheet "Más" → "Transferir mascota" → formulario con copy excelente — pero nada en el hub, ni en /cuenta, ni en el dashboard lo señala.

**El handshake** (evaluado desde código): la gravedad está bien calibrada en el eje irreversibilidad — iniciar es liviano (botón azul, "vence en 7 días, podés cancelarla"), aceptar es pesado (ConfirmDialog tono warn, "no se puede deshacer"). Donde falla es en la **persistencia del estado**: "esperando al otro" es una página que solo ves si recordás la URL.

**Cancelar turno**: proporcionado en ubicación y color (botón outline discreto al pie del detalle), pero el sheet de confirmación pide prestada la frase más grave del sistema ("Esta acción no se puede deshacer") para la acción más liviana del scope — la escala de seriedad se achata justo donde la ficha preguntaba.

---

## Usabilidad

| # | Sev. | Hallazgo | Evidencia | Archivo |
|---|---|---|---|---|
| U1 | 🔴 | **La transferencia saliente es invisible en la IA.** (1) El hub "Transferencias" no tiene CTA para iniciar ni explica dónde se inicia — el vacío de "Enviadas" dice "No enviaste ninguna transferencia todavía." y ahí termina; (2) la única entrada de UI a `/transferencias` es la card del dashboard, que cuenta **solo recibidas** (`countPendingTransfers` filtra por receptor) y además tiene `hideWhenZero`; (3) el perfil de la mascota no muestra ningún indicador de transferencia pendiente (cero referencias a `petTransfers` bajo `[publicToken]/`), y el ítem "Transferir mascota" del MasSheet se ofrece virgen aunque ya haya una pendiente. Resultado: la emisora que inició ayer y quiere ver "¿aceptó mi hermana?" no tiene NINGÚN camino de vuelta salvo recordar la URL. Si vence a los 7 días, vence en silencio. | `desk-transferencias.png` ≡ `desk-FAIL-click.png` ≡ `desk-transferir-inicio.png` (md5 idéntico); `mob-transferencias.png` | `app/(app)/transferencias/page.tsx` (sin CTA); `app/(app)/mis-mascotas/page.tsx:371-379`; `lib/analytics/owner-dashboard.ts:2002`; `app/(app)/mis-mascotas/[publicToken]/_more/MasSheet.helpers.ts:62-64` |
| U2 | 🟡 | **El estado "esperando al otro" dice DE QUIÉN pero no da agencia.** [desde código] Para el emisor: "Esperando respuesta del receptor." nombra el rol (bien) pero no ofrece reenviar el aviso ni copiar el link de la propuesta, ni dice qué pasa al vencer — si el email se perdió, el flujo muere sin salida. En la lista "Enviadas" del hub la fila muestra `initiatedAt`, **no el vencimiento** (`expiresAt` solo aparece en las recibidas y en el detalle). | — | `app/(app)/transferencias/[transferToken]/AcceptTransferActions.tsx:156`; `app/(app)/transferencias/page.tsx:146-148` (recibidas con "Vence") vs `:244-246` (enviadas sin) |
| U3 | 🟡 | **Cancelar turno termina en punta muerta.** [desde código; sin captura] El sheet confirma en abstracto ("¿Seguro que querés cancelar **este** turno?") sin eco de fecha/prestador, y tras cancelar la página queda en chip "Cancelado por vos" sin "buscar otro turno" — la persona que "no llega" casi siempre quiere reprogramar, y `/turnos/buscar` existe pero no se ofrece. | — | `app/(app)/mis-turnos/[appointmentToken]/MisTurnosSheetMounter.tsx:98-115`; `app/(app)/mis-turnos/[appointmentToken]/page.tsx:179-186` |
| U4 | 🟡 | **Error de hidratación React #418 en el run desktop del bundle** (`Minified React error #418 … args[]=HTML`). En una superficie cuyo feature reciente es justamente estado de UI en la URL, un mismatch servidor/cliente merece triage antes de seguir construyendo sheets encima. | `desk-index.json` (consoleErrors) | superficie del run: `app/(app)/cuenta/` + `app/(app)/transferencias/` — origen a triangular |
| U5 | 🟢 | En /cuenta la misma fila con chevron "›" a veces abre un sheet en el lugar (4 filas `?sheet=`) y a veces navega a otra página (8 filas). Es deliberado y documentado (flujos complejos → página) y el back restaura bien en ambos casos, pero el usuario no puede predecir cuál va a pasar. | `desk-cuenta.png` | `app/(app)/cuenta/page.tsx:319-411`; `app/(app)/cuenta/CuentaSheetMounter.tsx:13-18` |
| U6 | 🟢 | El form de envío no protege contra un typo en el email del receptor (sin repetición ni verificación). Mitigado por el propio handshake: el destinatario equivocado tendría que aceptar, vence a los 7 días y es cancelable — pero un aviso "revisá el email" no sobraría. [desde código] | — | `app/(app)/mis-mascotas/[publicToken]/_transfer/TransferSenderForm.tsx:64-82` |
| U7 | 🟢 | Estados terminales de la transferencia (aceptada / rechazada / expirada / cancelada) muestran chip + detalle y nada más — sin "qué sigue" (p. ej. tras aceptar: "ya la ves en Mis mascotas"; tras expirar: "podés iniciar otra"). [desde código] | — | `app/(app)/transferencias/[transferToken]/page.tsx:111-119` |

---

## Jerarquía visual

| # | Sev. | Hallazgo |
|---|---|---|
| J1 | 🟡 | **La numeración del hub salta 01 → 03.** "01 Pendientes" y "03 Mis transferencias enviadas" conviven en pantalla porque "02 Historial" solo se renderiza con datos y los números están hardcodeados (`transferencias/page.tsx:171` condicional, `:220` fijo). El sistema de secciones numeradas — el rasgo identitario del layout Libreta Nacional — queda expuesto como decoración. Agrava: `/cuenta` SÍ renumera condicionalmente (`num={isPersonal ? "03" : "02"}`, `cuenta/page.tsx:403`), o sea que el patrón correcto ya existe en el proyecto. Evidencia: `desk-transferencias.png`, `mob-transferencias.png`. |
| J2 | 🟡 | **El estado — la información más importante del hub — es el texto más chico de la página.** Chips "PENDIENTE" a 9px y fechas a 10.5px (`transferencias/page.tsx:151,146`; 9.5px en el detalle, `[transferToken]/page.tsx:89`), contra un H1 de 30px. Para la emisora, "¿en qué estado está?" se responde en letra de nota al pie. Cruza con A2. |
| J3 | 🟢 | Doble sistema de encabezados para una página de dos listas: "RECIBIDAS" (H2 mono 11px) + "01 Pendientes" (LnSectionHead) apilados dicen casi lo mismo dos veces; en `desk-transferencias.png` el ojo procesa cuatro niveles para dos listas vacías. |

**Lo que la jerarquía hace bien**: la Zona de riesgo de /cuenta (04, encabezado y borde en `--color-ln-err`, fila con fondo rojo suave — `cuenta/page.tsx:423-442`) separa lo irreversible del resto con un contraste que ninguna otra sección compite; y en el detalle del turno el QR de check-in y el token en mono grande (`select-all`) dominan exactamente cuando el turno está vigente.

---

## Consistencia (entre sheets, la pregunta de la ficha)

| # | Sev. | Hallazgo |
|---|---|---|
| C1 | 🟡 | **Tres gramáticas de confirmación en el mismo territorio, con el orden de botones invertido entre ellas.** (a) Aceptar transferencia → ConfirmDialog modal (`AcceptTransferActions.tsx:133-143`); (b) rechazar y cancelar transferencia → caja de expansión inline (`:63-111`, `:157-193`); (c) cancelar turno → un sheet entero como confirmación (`MisTurnosSheetMounter.tsx:50-60`). Dentro de (b): rechazar pone [Atrás | Confirmar rechazo] (escape izquierda) y cancelar pone [Confirmar cancelación | Atrás] (destructivo izquierda); el sheet de turno pone [Sí, cancelar | Volver] (destructivo izquierda). El escape se llama "Atrás" en transferencias y "Volver" en turnos. Y los primitivos: turnos usa `LnButton variant="seal"/"ghost"`; transferencias usa `<button>` crudos con clases a mano. Cuatro decisiones — patrón, orden, label, primitivo — resueltas distinto en pantallas hermanas. |
| C2 | 🟡 | **Dos mecanismos de apertura de sheet conviven, y /cuenta usa el que el propio proyecto documentó como defectuoso.** El módulo `lib/ui/sheet-nav.ts` existe porque el router soft-nav "silently drops" en producción (engram #621: "the router must never sit on their hot path"); el perfil de mascota abre con `SheetTriggerLink`→`pushSheetUrl` y turnos con `pushSheetUrl` (`CancelButton.tsx:17-20`) — pero TODAS las aperturas de /cuenta son `<Link href="?sheet=…">` de router: las ActionRow (`cuenta/page.tsx:322-341,390`) y "Declarar ahora" (`:254-259`). Mismo patrón visual, dos rutas de código, una con defecto conocido. |

**Lo consistente que sí está**: los dos detalles (transferencia y turno) comparten anatomía exacta — back-link mono uppercase, H1 serif + chip de estado a la derecha, `LnCard` "Detalle de…", `DetailRow` dt/dd idéntico (`[transferToken]/page.tsx:128-137` ≙ `mis-turnos/[appointmentToken]/page.tsx:200-209`). El cierre de sheets es un solo camino (`closeSheetNav`) en los tres mounters. Y los estados vacíos de ambos hubs hablan igual ("No tenés… / No enviaste… / No hay turnos reservados.") — la voz es una.

---

## Accesibilidad

| # | Sev. | Hallazgo |
|---|---|---|
| A1 | 🟡 | **El foco no vuelve al disparador al cerrar los sheets de C6.** `VaulSheet` soporta `triggerRef` con retorno de foco (B-9, `VaulSheet.tsx:67-72`) pero ni `CuentaSheetMounter` ni `MisTurnosSheetMounter` lo pasan: quien navega con teclado cierra "Editar mi información" o "Cancelar turno" y el foco cae al body, a re-tabular la página entera. (Contraste: `AcceptTransferActions.tsx:37,142` SÍ lo hace con su ConfirmDialog.) |
| A2 | 🟡 | Texto de estado a 9–9.5px uppercase (chips) y metadatos a 10.5px — por debajo de cualquier mínimo cómodo para información portadora de significado, y en mobile es el mismo tamaño físico en una pantalla al sol (`mob-transferencias.png`; cruza con J2). |
| A3 | 🟡 | **El handle de arrastre mobile promete un gesto que la configuración contradice.** `Drawer.Root` fija `direction="right"` incondicional (`VaulSheet.tsx:81`) mientras el CSS presenta bottom-sheet en mobile con handle horizontal arriba (`:108-109`) — la affordance dice "deslizá hacia abajo", el gesto configurado en Vaul es lateral. El comentario del código ("On mobile Vaul defaults to bottom") describe un default que el prop pisa. Verificar en dispositivo; si el swipe-down no cierra, el handle es un botón pintado. |

**Base sólida**: `Drawer.Title` + `Drawer.Description` sr-only cableados a Radix, botón "Cerrar" con aria-label y target 44×44 (`VaulSheet.tsx:118-126`), `role="alert"` en los errores de acción (`AcceptTransferActions.tsx:59`, `MisTurnosSheetMounter.tsx:103`), `pb-safe` para el home indicator, secciones del hub con `aria-labelledby`, y `VerificationBadge` con aria-label textual (no solo color) en /cuenta.

---

## Lo que funciona bien

1. **El patrón sheet con URL state se comporta como el usuario espera — en todos los casos.** Abrir pushea historia; el "×", el overlay y el botón back del navegador deshacen exactamente el mismo paso (`closeSheetNav` → `history.back()` si se abrió por push); un `?sheet=` llegado por deep-link cierra con `replaceState` sin expulsarte de la página; y las mutaciones que tocan SSR cierran con recarga completa documentada (`lib/ui/sheet-nav.ts:44-75`, `closeSheetNavWithFullReload`). Es el patrón mejor razonado del scope.
2. **El gradiente de gravedad del handshake es correcto.** Iniciar = liviano y honesto: botón azul "Enviar propuesta", "La propuesta vence en 7 días. Mientras esté pendiente podés cancelarla." y la frase que explica el producto entero — "la libreta sanitaria viaja con la mascota" (`TransferSenderForm.tsx:59-62,116-118`). Aceptar = pesado: ConfirmDialog tono warn, "Esta acción no se puede deshacer" (`AcceptTransferActions.tsx:133-143`, fix del audit 2026-07-19 que corrigió el peso accept/reject). Lo serio se ve serio donde el código lo muestra.
3. **Los estados del turno responden "de quién" con nombre y apellido**: "Cancelado por vos" ≠ "Cancelado por el prestador", y el fallback "Estado desconocido" nunca cae en verde (`mis-turnos/[appointmentToken]/page.tsx:213-264`, state-honesty audit). Modelo a copiar en el resto del sistema.
4. **La Zona de riesgo de /cuenta** hace visible la irreversibilidad sin melodrama: sección roja separada, copy "acción irreversible desde este panel", ConfirmDialog con motivo obligatorio (`desk-cuenta.png`; `cuenta/page.tsx:417-442`).
5. **"Sí, cancelar" / "Volver"** en el sheet de turno esquiva la trampa clásica cancelar-la-cancelación (`MisTurnosSheetMounter.tsx:108-113`).
6. **/cuenta degrada con honestidad**: timeout de 8s → card de error con "Reintentar" en vez de skeleton eterno (`cuenta/page.tsx:49-149`).

---

## 3 Prioridades

1. **🔴 Coser la transferencia saliente a la IA (U1 + U2).** (a) CTA en el hub: "Iniciar una transferencia" — si el flujo debe nacer en la mascota, que el botón lleve al selector o al menos lo diga ("se inicia desde la ficha de tu mascota → Más → Transferir"); (b) que el dashboard cuente también salientes pendientes (nueva `countPendingOutgoingTransfers` junto a `countPendingTransfers` en `lib/analytics/owner-dashboard.ts:2002`) y la card pierda `hideWhenZero` cuando haya salientes, con copy propio "Esperando a {nombre/email} · vence {fecha}" (`app/(app)/mis-mascotas/page.tsx:371-379`); (c) indicador "Transferencia pendiente" en el perfil de la mascota y en el ítem del MasSheet, que hoy reofrece el form virgen (`app/(app)/mis-mascotas/[publicToken]/_more/MasSheet.helpers.ts:62-64`); (d) mostrar `expiresAt` en las filas de Enviadas (`app/(app)/transferencias/page.tsx:244-246`).
2. **🟡 Una sola gramática de confirmación y apertura (C1 + C2).** Regla única: irreversible → ConfirmDialog; liviano → confirmación inline/sheet. Orden fijo [escape a la izquierda | acción a la derecha], label de escape único ("Volver"), primitivos `LnButton` en `app/(app)/transferencias/[transferToken]/AcceptTransferActions.tsx` (hoy botones crudos, con orden invertido entre sus propios bloques :79-110 vs :162-192). Y las aperturas de /cuenta migran de `<Link href="?sheet=…">` a `SheetTriggerLink` (`app/(app)/cuenta/page.tsx:254-259, 322-341, 390` — mismo fix que ya protege al perfil de mascota).
3. **🟡 Recalibrar la escala de gravedad y el esqueleto numerado (U3 + J1 + J2).** Cancelar turno deja de usar la frase de máxima seriedad: "El turno se libera para otra persona. Podés reservar otro cuando quieras." + eco del turno ("{servicio}, {fecha} {hora}") + link "Buscar otro turno" en el estado cancelado (`app/(app)/mis-turnos/[appointmentToken]/MisTurnosSheetMounter.tsx:100`, `page.tsx:179-186`). El hub renumera condicionalmente como ya hace `/cuenta` (`app/(app)/transferencias/page.tsx:171,220`, patrón en `cuenta/page.tsx:403`) y los chips de estado suben a ≥11px (`page.tsx:151,252`).

---

**Conteo**: 🔴 1 · 🟡 9 · 🟢 4 — 14 hallazgos (7 usabilidad, 3 jerarquía, 2 consistencia, 3 a11y; J2≡A2 contado una vez).
