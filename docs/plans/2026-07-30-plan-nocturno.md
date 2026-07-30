# Plan de ejecución nocturno — 2026-07-30

> **Este archivo es el estado, no el contexto del agente.** Todo lo necesario
> para retomar en frío está acá. Cada unidad se cierra sola: tests dirigidos
> durante, gate completo por BATCH de 3-4 unidades, un commit por unidad.
> Una unidad que falla NO bloquea las siguientes.
>
> **CERO decisiones intermedias del PO.** Toda ambigüedad se resuelve así:
> (1) si hay decisión PO previa o precedente en el repo, se aplica; (2) si las
> opciones son equivalentes, el agente decide y DOCUMENTA; (3) si es visible
> de producto, se implementa la lectura recomendada, se deja evidencia
> (captura/diff), y va a la LISTA DE RATIFICACIÓN del final. Nunca se frena.

## Decisiones PO ya tomadas (no re-preguntar NADA de esto)

| Tema | Decisión |
|---|---|
| D.3 canon | Verbo del acto en el botón, NUNCA "Confirmar". Fricción por CONSECUENCIA: irreversible/peso legal → modal con consecuencia explicitada; reversible → inline con verbo |
| Pasada 703 | UNA pasada completa: codemod a utilidades nombradas + capturas antes/después POR superficie + suite. Un commit |
| D.8 slot 0 mascotas | Reetiquetar a "Cargar mascota" → `/mis-mascotas/nueva`; con ≥1 vuelve a "Asentar". Señal de conteo SIN query nueva por página |
| Copy credencial | "Inscripto/a" → "Registrado/a" (helpers sex-correct de `StatusFlag.tsx`) |
| D.4 anatomía | El agente elige POR MEDICIÓN (la dominante de las 5) y aplica. Ratificación al final |
| Cancelar-saliente | YA EXISTE (`AcceptTransferActions.tsx:156`). NO tocar. La decisión de "construirlo" fue anulada por premisa falsa |
| D7 cutover | TODO el backlog gatea. Al cerrar la tabla, PROPONER fecha |

## Entorno (verificado 2026-07-30 — no re-diagnosticar)

- **`:3000` está tomado por un zombi inmatable** (otro contexto de seguridad,
  `taskkill` → Access denied). TODO en `:3001`.
- Bootstrap: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1 -Port 3001`
  — el guard ahora verifica servido==disco DESPUÉS de arrancar y falla con PID.
- **Orden sagrado**: matar servidor → `pnpm build` → `qa-up` → guard verde → recién ahí medir.
- Antes de CUALQUIER medición en navegador: chequear que el chunk `webpack-*`
  servido coincida con `.next/static/chunks/`. Si no coincide, NO medir.
- DB scripts: `node --conditions=react-server --import tsx scripts/<x>.ts`.
- cursor-agent: `C:\Users\ignac\AppData\Local\cursor-agent\cursor-agent.cmd -p --output-format text`,
  capturar salida completa (nunca `| tail`).

## Reglas de la corrida (todas ya pagadas con sangre)

1. `pnpm biome check --write` SIEMPRE antes de verify. Gate por batch de 3-4.
2. Fallo de e2e → **abrir la captura de Playwright ANTES de hipotetizar**.
3. Mutación para probar dientes → `grep`/Edit para VERIFICAR que aplicó, sobre
   el elemento correcto (no contar prosa/comentarios).
4. **Un grep que dice "no existe" sobre algo que una pantalla afirma → desconfiar
   del grep** (3 casos: case-insensitive, glob, `cancelPetTransferAction`).
5. Fence de tamaño de archivo → SIEMPRE partir, nunca re-baselinear.
6. Tailwind: `text-[var(--text-*)]` es un font-size MUERTO (compila a color).
   Utilidades nombradas siempre. La regla 9 lo cerca.
7. Código de privacidad a medias es peor que ninguno: si una unidad de
   privacidad no cierra entera (datos+render+leyenda+tests), se revierte y se
   documenta.
8. Cambios visuales: verificar en PÍXELES computados (el gate es ciego a CSS
   que no aplica).
9. Suite en background sin `| tail`; el exit code MIENTE (crash intermitente) —
   leer conteos. `cube-parity` nunca concurrente.
10. Hijos en background: pollear dentro del propio turno, siempre.
11. Actualizar la tabla de estado de ESTE archivo al cerrar cada unidad.

## BLOQUE A — sin servidor (barato, primero)

### A1. Exit-1 / CI rojo — TIMEBOX 60 min duro
Identidad conocida: `ReferenceError: window is not defined`, react-dom
scheduler (`performWorkUntilDeadline`, un Immediate) post-teardown de jsdom.
Local mata al worker; en CI sale como uncaught. Cazar el test que renderiza y
termina sin drenar: instrumentar `process.on('uncaughtException')` en setup con
dump del archivo actual, correr el proyecto db (donde crashea). Si a los 60 min
no está identificado: documentar lo descartado y SEGUIR. Es gate de cutover
pero no de esta noche.

### A2. #40 k-anon provincia — handover completo en el plan del 29 (§#40)
Mapa exacto ahí: 9 sitios, denominadores por loader, las 5 trampas. Resumen:
- Helper `provinceCell(code, label, value, denominator)` — denominador
  OBLIGATORIO en la firma; k=5 de `suppressSmallCells` (`lib/metrics/anonymity.ts`).
- `value: number | null` en cell y props; suprimida publica `value: null`.
- Tendencia (L886): hoy DESAPARECE la celda → pasa a suprimida-rayada.
- Índice territorial (L1099): SIN denominador real → se excluye con comentario
  que declara la brecha. NO adivinar.
- `lib/open-data/datasets.ts:354`: verificar su supresión propia y ALINEAR
  (misma k, mismo criterio de denominador). El dataset público no publica
  celdas suprimidas.
- Render: hachurado para provincia suprimida (precedente:
  `applyProvinceBivariateSuppression`, SituationalMap). **Excluir suprimidas
  del complemento del puntillado de D.5(b)** (`provinceNoDataFilter` debe
  tratar suppressed como "conocida"). Leyenda: `MapLegends` gana la fila
  k-anon en provincias (hoy la omite con comentario que dejará de ser cierto).
- `get-panorama-kpis.ts:628` null-guard. 21 errores de tipo esperados = la
  lista de sitios. Tests con mutación verificada.
- La verificación VISUAL del hachurado va al Bloque C (una sola reconstrucción).

### A3. D.3 — gramática de confirmación (canon decidido)
1. Inventariar: `ConfirmDialog` + botones inline "Confirmar" en gob/admin/org
   (las 6 gramáticas de la review + los 2 caminos sin confirmación).
2. Clasificar cada acto: irreversible/legal (cerrar denuncia 14.346, decomisos,
   custodia, reasignaciones) → modal con consecuencia; reversible → inline verbo.
3. Aplicar. La tabla acto→clase→gramática queda EN ESTE ARCHIVO como registro.
4. Tests existentes de esas pantallas + mutación en al menos 2.

### A4. Copy "Registrado/a" (chico)
`rg -n 'Inscripto'` — cambiar con los helpers sex-correct. Verificar contra
`situationLabelForSex`/`StatusFlag`. Tests que pinneen el literal: actualizar.

### A5. D.4 — anatomía de chips POR MEDICIÓN
Inventariar las 5 anatomías en las 6 colas (ubicación de conteo, formato de
fecha, tratamiento de estado, código). La dominante por frecuencia GANA.
Aplicar a las otras. Tabla de medición en este archivo. Ratificación al final.

## BLOQUE B — servidor UNA vez (reconstruir al entrar al bloque)

Secuencia de entrada: matar `:3001` → build → qa-up → guard verde.

### B1. Pasada de los 703 (decidida)
1. Codemod: `text-[var(--text-X)]` → utilidad nombrada `text-X`, consciente de
   que TODO token del theme genera utilidad (`text-title`, `text-md` incluidos).
2. Capturas ANTES/DESPUÉS por superficie: credencial pública, panorama, una
   cola gob, /cuenta, landing → `docs/reviews/results/2026-07-30-703-pass/`.
3. Regla 9 a baseline 0. Suite completo. UN commit.
4. Si alguna superficie queda visiblemente rota (jerarquía invertida, texto
   ilegible): arreglar el caso puntual con la utilidad correcta, NUNCA volver
   al patrón muerto. Documentar cada excepción.

### B2. D.8 completo
- **Slot**: señal `ownedPetsCount` vía `request-cache` (React cache() — se
  comparte con las páginas que ya cuentan; costo nuevo solo donde no se
  contaba: UN count indexado por request). Si existe algo ya consultado que
  sirva, usarlo; si no, este es el compromiso documentado. Con 0 →
  "Cargar mascota" → `/mis-mascotas/nueva`.
- **Vacío que vende la credencial**: el empty state de /mis-mascotas explica
  QUÉ ES la credencial (QR, verificable, viaja con la mascota) antes del CTA.
  Copy es-AR sobria; capturar para ratificación.
- **Éxito con QR**: la pantalla post-alta (`PetCreatedAha.tsx`) ofrece
  descargar/imprimir el QR. Reusar el generador de QR existente de la
  credencial. Capturar.

### B3. C.1 — libreta del dueño
Lectura recomendada (implementar, ratificar al final): las 3 rutas byte-idénticas
se DIFERENCIAN — `/libreta` = todo, `/vacunas` = pre-filtrada a vacunas,
`/historial` = eventos; los 2 tiles deshabilitados se habilitan como chips de
filtro reales. Si al abrir el código la intención original documentada
contradice esta lectura, seguir la intención documentada y anotarlo.

### B4. Verificación visual pendiente del Bloque A
- #40: hachurado de provincia suprimida + leyenda, en vivo (preset cumplimiento).
- D.3: al menos un modal nuevo y un inline nuevo, en vivo.

## STRETCH (solo si el reloj sobra — en este orden)
- SC-6 (cursor keyset por urgencia — rework contenido, sin decisión).
- #41 detalle de caso (SOLO si D.3 quedó verde y hay >2h de margen; si no,
  dejar el diseño de la gramática aplicada como handover).
- D.5(b) en CabaInset/MapChoropleth (calcar `no-data-overlay.ts`).
- Crisis-seams (b): reproducir Rocco@Recoleta A MANO primero (es producto).

## Protocolo de cierre (obligatorio, pase lo que pase)

1. Gate final del último batch + suite completo (leer CONTEOS, no exit code).
2. Review adversarial pre-push con cursor-agent sobre el rango completo.
   Fix bar: los CONFIRMED se arreglan como `fix(...)` citando la review.
3. Push SOLO si el PO lo autorizó para esta corrida (ver autorización abajo).
4. Actualizar este archivo: tabla de estado + LISTA DE RATIFICACIÓN.
5. `mem_session_summary` con el estado exacto para retomar en frío.

### Autorización de push para esta corrida
**CONCEDIDA (PO, 2026-07-30)**: al cierre, review adversarial de cursor sobre el
rango completo → fixes de los CONFIRMED como commits propios → push a
`origin/integration/all-20260703`. Si la review da DO NOT SHIP y el fix no es
claro: NO pushear, dejar el veredicto arriba de todo en este archivo. La
autorización es para ESTA corrida, no permanente.

## LISTA DE RATIFICACIÓN (se llena durante la noche, el PO la lee a la mañana)

| # | Qué | Evidencia | Riesgo si se revierte |
|---|---|---|---|
| (vacío al inicio) | | | |

## Estado (actualizar al cerrar cada unidad)

| Unidad | Estado | Commit |
|---|---|---|
| A1 exit-1 (timebox 60') | pendiente | |
| A2 #40 k-anon provincia | pendiente | |
| A3 D.3 gramática | pendiente | |
| A4 copy Registrado/a | pendiente | |
| A5 D.4 chips | pendiente | |
| B1 pasada 703 | pendiente | |
| B2 D.8 completo | pendiente | |
| B3 C.1 libreta | pendiente | |
| B4 verificación visual A | pendiente | |
| S1 SC-6 | stretch | |
| S2 #41 | stretch | |
| S3 D.5(b) inset | stretch | |
| S4 crisis-seams (b) | stretch | |

**Presupuesto honesto**: A2, A3 y B1 son las caras (1.5-3h c/u). Expectativa
realista: Bloque A entero + B1-B2; B3/B4 probables; stretch improbable. Mejor
9 unidades cerradas con evidencia que 13 a medias.
