# Cola pendiente — QA Parte B (2026-08-07/08)

> Lo que NO entró en la tanda del 08/08, con el motivo y el detalle suficiente
> para retomarlo sin volver a investigar. El informe original y su triage están
> en engram: `qa/2026-08-07-parte-b-pulido`, `qa/2026-08-07-parte-b-fixes`,
> `qa/2026-08-07-decisiones-po`.

---

## 1. Contrato de adopción — las dos mitades que faltan (N6)

**Decisión del PO (2026-08-08)**: imprimible antes Y reimprimible después.

**Lo que ya se hizo**: el copy del botón decía *"Imprimir contrato (borrador)"*
y *"borrador pendiente de revisión legal"* — wording anterior a que el PO
aprobara el modelo de 7 cláusulas como plantilla orientativa (2026-08-07). El
documento impreso ya banner-eaba la versión aprobada, así que el botón y la hoja
decían cosas distintas sobre el mismo papel. Corregido.

**Lo que falta, y por qué no se improvisa:**

`app/org/[orgToken]/mascotas/[publicToken]/adoption/contrato/route.ts` es
**POST-only por diseño**: el DNI del adoptante viaja en el body para que nunca
caiga en una URL, en el historial del navegador ni en logs de acceso. Y siempre
imprime un contrato **lleno**, resolviendo al adoptante con
`findAdopterAccountByDni`. De ahí salen los dos huecos:

| Hueco | Qué necesita |
|---|---|
| **(a) Modelo en blanco** | Hoy el botón sólo aparece cuando el DNI resuelve a una cuenta miMAR existente (`check.status === "found"`). Un refugio que finaliza para alguien SIN cuenta no tiene ningún modelo que imprimir. Necesita, o una rama del route que renderice el modelo con los campos del adoptante vacíos, o una ruta aparte de "modelo en blanco" sin datos personales. |
| **(b) Reimpresión desde el expediente** | Una vez finalizada la adopción no hay forma de reimprimir. Un link GET no puede llevar el DNI, pero **tampoco lo necesita**: con la adopción ya finalizada el adoptante se resuelve server-side desde el evento. Necesita una ruta nueva que tome el id del evento de adopción (un uuid, no PII) y resuelva el resto adentro. |

Las dos son ruta nueva + guard de capacidad + manejo de PII + test. No es un
cambio de copy y no debería hacerse a las 2am.

---

## 2. `font-mono` — considerar un fence (nuevo, no estaba en el informe)

En esta tanda se barrieron **83 ocurrencias en 56 archivos** de `font-mono`
pelado a `font-ln-mono`. El motivo: `--font-mono` no está definido en el
`@theme` de `globals.css`, así que la utilidad `font-mono` de Tailwind cae al
stack del sistema (`ui-monospace`, Consolas/SF Mono) en vez de IBM Plex Mono.
La proporción antes del barrido era **461 correctas contra 83 mal** — drift
clásico, no decisión.

**Pendiente**: un fence que impida que vuelva. Este repo ya tiene 45 y esta es
exactamente la clase de deriva que fencean. La opción barata es agregarlo como
regla nueva a `scripts/check-design-tokens.ts`, al lado de sus hermanas, en vez
de un script propio.

> Ojo con una trampa que ya mordió en esta tanda: **ese checker escanea el
> fuente crudo, comentarios incluidos.** Un comentario que explique por qué no
> se usa una clase prohibida NO puede nombrarla.

---

## 3. `N15` — no es un bug, es una regla sin documentar

*"Limpiar todo"* y *"Limpiar filtros"* conviven en la misma pantalla, y el
informe lo marcó como inconsistencia. **No lo es**: el código documenta que son
mecanismos distintos —
`app/gob/historial/page.tsx:356` (*"«Limpiar todo» now covers period+action+actor
in one click"*) y `components/ui/dashboard/CasoEstadoFilter.tsx:28`. Unificarlos
borraría una distinción deliberada.

**Pendiente**: escribirlo como regla en las convenciones de UI de `AGENTS.md`,
para que no vuelva a aparecer como hallazgo en cada revisión.

---

## 4. Verificación manual de 30 segundos — estados degradados en vivo

Sigue sin poder automatizarse: sostener un skeleton ≥20 s requiere una pestaña
**visible**, pero Next revela en menos de un segundo; y en pestaña de fondo
Chrome congela las animaciones CSS. Condiciones mutuamente excluyentes.

**Pendiente**: DevTools → Network → Slow 3G → recargar `/gob/programa` → mirar a
los 8 s y a los 20 s. La implementación ya está verificada en el DOM real
(elementos presentes, `degraded-reveal`, delays 8000/20000 ms, opacidad inicial
0); falta sólo verlo.

---

## 5. Checklist de setup de organización — bloqueado

En Refugio Test el checklist ya está 3/4 completo, así que no se puede ver el
orden inicial, y **no hay alta de organizaciones por UI**. Necesita una org
nueva creada por backoffice para poder revisarse.

---

## 6. Flake a vigilar

`components/panorama/PanoramaConsole.test.tsx` falló **una vez** bajo suite
completa (contención) y pasó **103/103 en aislamiento**, en un componente que
esta tanda no tocó. Mismo patrón que el flake ya documentado del boost de
`performed-by-search`. Si vuelve a fallar en una corrida limpia, es real.
