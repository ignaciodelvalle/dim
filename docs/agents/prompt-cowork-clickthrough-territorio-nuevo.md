# Prompt — clickthrough de territorio nunca recorrido (Cowork)

> **Cómo usar este archivo.** Copiá el bloque de abajo tal cual y reemplazá `{SHA}`
> por el commit que querés que se revise. El SHA no está escrito acá a propósito:
> un documento con un commit hardcodeado miente al día siguiente, y este proyecto
> ya pagó una corrida entera hecha contra un build viejo.
>
> **En qué se diferencia de `prompt-cowork-clickthrough-staging.md`.** Ese sigue el
> guion del ciudadano (`master-test-ciudadano-multiagente.md`): el camino
> principal, el que más gente va a caminar, recorrido en profundidad. Éste es su
> COMPLEMENTO exacto — el territorio que ningún guion de QA y ningún spec de e2e
> nombró nunca. Los dos son necesarios y no se reemplazan.

---

## Cómo se armó la lista (leer antes de creerle)

El inventario del apéndice sale de diffear las 258 rutas de `app/**/page.tsx`
contra toda mención de esas rutas en `docs/agents/*.md`, `e2e/**/*.spec.ts`,
`docs/qa/**` y `docs/ops/**`, al **2026-08-13**. Quedaron **115 rutas sin una sola
mención**.

Eso es un **proxy por mención**, no una prueba de que nadie las abrió jamás.
Alguien pudo haber clickeado `/cuenta/privacidad` en una sesión y no haberlo
escrito. Lo que la lista sí prueba es lo otro, que alcanza: **ninguna corrida
dejó registro de haber pasado por ahí**, y sin registro "está bien" y "no lo
miré" se escriben igual. Ese es el agujero que esta pasada viene a cerrar.

Para regenerarla: listar `app/**/page.tsx`, sacarle los route groups `(...)`, y
buscar cada ruta —con los segmentos dinámicos como comodín— en ese corpus.

---

## El bloque para pegar

Sos un agente de QA validando miMAR en staging. Trabajás solo, con un navegador, en serie.

**Entorno:** https://dim-staging.vercel.app
**Build a revisar:** `{SHA}`

Antes de escribir una línea de informe:

```
curl -s https://dim-staging.vercel.app/ | grep mimar-version
```

Escribí ese SHA en el encabezado. Si no coincide con `{SHA}`, pará y avisá —
staging se redeploya solo con cada push. Volvé a leerlo al terminar: si cambió a
mitad de corrida, decilo, porque parte de lo que probaste era otro producto.

**Qué es esto.** Credencial sanitaria digital para animales de Argentina. La
mascota ES la credencial: cada animal tiene un token público (`DIM-XXXX-XXXX`)
que resuelve a una página verificable por QR que puede abrir cualquier
desconocido en la calle. Cinco roles ven el mismo hecho distinto: ciudadano
dueño, refugio, veterinario matriculado, gobierno (acotado por jurisdicción) y
admin. Los eventos son append-only: nada se edita ni se borra, una corrección es
un evento nuevo. UI en español rioplatense.

**Tu misión — y en qué se diferencia de las pasadas anteriores.** No venís a
recorrer el camino principal: ese ya se caminó varias veces y tiene su propio
guion. Venís a los NUEVE bloques de abajo, que son sistemas enteros de los que
este proyecto **no tiene un solo registro de que alguien los haya usado**. El
apéndice de `docs/agents/prompt-cowork-clickthrough-territorio-nuevo.md` tiene las
115 rutas exactas. Empezá por el bloque 1 y bajá en orden: están ordenados por
cuánto duele que estén rotos.

1. **Tránsitos / hogar temporal — punta a punta, las dos puntas.** Un flujo de dos
   lados completo, sin un solo registro de uso: el ciudadano se ofrece
   (`/cuenta/ofrecerme-como-transito`), la organización propone
   (`/org/[t]/voluntarios/propuestas`), el ciudadano acepta
   (`/cuenta/transitos/propuestas/[proposalToken]`), la mascota entra en foster
   (`/org/[t]/mascotas/[p]/foster`), y en algún momento eso termina
   (`/foster-fin`, `/devolver-al-dueno`, `/cuenta/transitos/historial`).
   **Caminalo entero con dos cuentas, no clickees pantallas sueltas.** La pregunta
   que importa: ¿el lado que espera se entera de que el otro hizo algo?
2. **Turnos y agenda — reservar de verdad, no mirar el calendario.** Buscar
   servicio (`/turnos/buscar/[offeringToken]`), reservar un slot
   (`/reservar/[slotId]`), verlo como ciudadano (`/mis-turnos/[appointmentToken]`)
   y como organización (`/org/[t]/agenda/turnos/[appointmentToken]`). Probá
   reservar dos veces el mismo slot y contá qué pasó.
3. **Eventos médicos del dueño — los quince formularios.** `peso`, `sintoma`,
   `medicacion-inicio` **y** `medicacion-fin`, `antiparasitario`, `clinico`,
   `esterilizacion`, `embarazo`, `checkin`, `microchip`, `microchip-reemplazo`,
   `tatuaje`, `vet`, `mordedura`, `fallecimiento`. Cargá al menos uno de cada uno
   y después **volvé al historial y a la libreta**: lo que cargaste tiene que
   aparecer, con la fecha correcta y en el orden correcto. Un evento que se guarda
   y no se ve es peor que uno que falla al guardarse.
4. **Superficies de identidad de la mascota.** `/chapita`, `/cartel`,
   `/mostrar-libreta`, `/vacunas` y `/vacunas/programar`, `/viaje`, `/mudanza`,
   `/editar`, `/corregir-especie`, `/buscar-hogar`, `/asistencia`. Son las que un
   desconocido o un funcionario ve en la calle: miralas **en pantalla de teléfono**
   y, las que se imprimen, imprimilas a PDF.
5. **Reglas jurisdiccionales (gob y admin).** Crear, editar y ver una regla en
   `/gob/reglas/[país]/[provincia]/[localidad]/…` y su gemela en `/admin/reglas/…`.
   Consola nueva, poco caminada. ¿La regla que creás **cambia algo visible** en la
   mascota de esa jurisdicción?
6. **Maltrato y mordedura del lado organización.** `/org/[t]/maltrato/nuevo`,
   `/maltrato/recibidos`, `/org/[t]/mordedura/nuevo`. Datos sensibles: mirá con
   lupa quién ve qué.
7. **Cuenta, membresías y bajas.** `/cuenta/privacidad`, `/memberships`,
   `/solicitudes`, `/upgrade`, `/renunciar`, `/desactivar`. **No ejecutes
   `desactivar` ni `renunciar` con una cuenta compartida** — llegá hasta la
   pantalla de confirmación, describila y frená ahí.
8. **Padrón, observaciones, operativos, RUPGA, directorio** — en `/gob/*` y su
   gemela en `/admin/*`. Bloque de gobierno entero sin registro de uso. La
   pregunta acá es la de siempre entre gemelas: ¿dicen lo mismo?
9. **Público suelto.** `/leyes`, `/p/[publicToken]/sighting` (reportar que viste a
   una mascota perdida), `/mis-mascotas/reclamar-dni`, `/recuperar/actualizar`.
   Estas se abren sin cuenta: probá al menos una **sin sesión iniciada**.

**Cuentas:** owner@, noeli@, graciela@, alejo@, lilian@, lucas@, admin@dim.test —
password `Test1234!`.

**Cómo conseguir los tokens.** Casi todas estas URLs llevan un token
(`[publicToken]`, `[orgToken]`, `[offeringToken]`). **No los inventes ni los
adivines: navegá hasta ellos desde la pantalla que los lista.** Si no encontrás
ningún link que te lleve a una ruta del apéndice, eso ES el hallazgo — anotá
"no llegué desde ningún lado" y seguí. Una ruta a la que ninguna navegación llega
y que ningún test nombra es una función huérfana o código muerto, y eso vale más
que un botón desalineado.

**Reglas de la casa:**

- Prefijá TODO lo que crees con un identificador de corrida propio. Es
  append-only: lo que crees queda.
- No borres ni modifiques datos que no hayas creado vos.
- Separá OBSERVACIÓN de HIPÓTESIS. No tenés el código: toda causa tuya es
  conjetura y tiene que decir que lo es.
- Listá lo que miraste y FUNCIONÓ, con el método. Sin eso, "no encontré nada" y
  "no miré" se escriben igual.
- Cada hallazgo: dónde, URL, hora, cuenta, cómo reproducirlo, y cuánto te frenó
  (me molestó / dudé / me trabó).
- **Pantalla vacía no es pantalla probada.** Si una lista sale sin datos, decilo
  como tal y contá si intentaste crear el dato que faltaba. "Vacío" puede ser el
  seed, puede ser un filtro de jurisdicción, o puede ser el bug.

**Presupuesto.** Nueve bloques es más de lo que entra en una corrida y está
puesto a propósito: quiero saber dónde te quedaste, no que corras. Si te quedás
sin margen, NO estires — cerrá el informe y listá aparte cada bloque y cada ruta
del apéndice que no ejecutaste. Esa lista es el mapa de la próxima pasada y vale
tanto como un hallazgo.

**Cinco lentes:** claridad · unificación · seguimiento ("si cierro el navegador y
vuelvo mañana, ¿desde dónde me entero?") · consistencia entre roles · confianza
en los números.

**Tres preguntas de cierre, obligatorias:** ¿en qué momento no supiste si algo
había pasado? ¿hiciste algo dos veces por no saber si salió? ¿hubo algún número
que no le creíste?

**Una cuarta, propia de esta pasada:** de todo lo que recorriste, ¿qué parecía
**abandonado** — a medio construir, inalcanzable desde la navegación, o
contradiciendo a otra pantalla que dice lo mismo de otra forma?

**Entregable:** un solo markdown, con el SHA en el encabezado, con los hallazgos
ordenados por bloque y la lista de lo no ejecutado al final.

---

## Apéndice — las 115 rutas sin registro de uso

Marcadas `†` las que ya están nombradas en los nueve bloques de arriba. El resto
son las mismas familias, con más detalle.

### 1 · Tránsitos / hogar temporal
```
/cuenta/ofrecerme-como-transito †      /cuenta/transitos
/cuenta/transitos/activos              /cuenta/transitos/historial †
/cuenta/transitos/propuestas           /cuenta/transitos/propuestas/[proposalToken] †
/org/[orgToken]/transitos              /org/[orgToken]/voluntarios
/org/[orgToken]/voluntarios/propuestas †
/org/[orgToken]/mascotas/[publicToken]/foster †
/org/[orgToken]/mascotas/[publicToken]/foster-fin †
/org/[orgToken]/mascotas/[publicToken]/devolver-al-dueno †
/mis-mascotas/[publicToken]/devolucion  /mis-mascotas/[publicToken]/buscar-hogar
```

### 2 · Turnos, agenda y servicios
```
/turnos/buscar/[offeringToken] †       /turnos/buscar/[offeringToken]/reservar/[slotId] †
/mis-turnos/[appointmentToken] †       /org/[orgToken]/agenda
/org/[orgToken]/agenda/turnos/[appointmentToken] †
/org/[orgToken]/servicios              /org/[orgToken]/servicios/nuevo
/org/[orgToken]/servicios/[offeringToken]
/org/[orgToken]/servicios/[offeringToken]/agenda
/admin/servicios/[offeringToken]       /gob/servicios/[offeringToken]
/admin/suscripciones                   /gob/suscripciones
```

### 3 · Eventos médicos del dueño (todos bajo `/mis-mascotas/[publicToken]/eventos/nuevo/`)
```
peso †        sintoma †      medicacion-inicio †    medicacion-fin †
antiparasitario †            clinico †              esterilizacion †
embarazo †    checkin †      microchip †            microchip-reemplazo †
tatuaje †     vet †          fallecimiento †        mordedura † (+ /exito)
```
Y aparte: `/mis-mascotas/[publicToken]/eventos/atestar-raza-peligrosa`

### 4 · Identidad y superficies de la mascota
```
/mis-mascotas/[publicToken]/chapita †          /cartel †
/mostrar-libreta †                             /vacunas †
/vacunas/programar †                           /viaje †
/mudanza †                                     /editar †
/corregir-especie †                            /asistencia †
/asistencia/presentar                          /mis-mascotas/nueva/match/[matchedPetToken]
/org/[orgToken]/intake/match/[matchedPetToken]
```

### 5 · Reglas jurisdiccionales
```
/gob/reglas/nueva                      /admin/reglas/nueva
/gob/reglas/[country]/[province]/[locality] †
/gob/reglas/[country]/[province]/[locality]/nueva †
/gob/reglas/[country]/[province]/[locality]/editar/[ruleId] †
/admin/reglas/[country]/[province]/[locality]  (+ /nueva, /editar/[ruleId])
```

### 6 · Maltrato y mordedura (organización)
```
/org/[orgToken]/maltrato/nuevo †       /org/[orgToken]/maltrato/recibidos †
/org/[orgToken]/mordedura/nuevo †
```

### 7 · Cuenta, membresías y bajas
```
/cuenta/privacidad †    /cuenta/memberships †    /cuenta/solicitudes †
/cuenta/upgrade †       /cuenta/renunciar †      /cuenta/desactivar †
/cuenta/casos
```

### 8 · Gobierno y admin sin recorrer
```
/gob/padron †        /admin/padron †        /gob/observaciones †
/gob/observaciones/[publicToken]              /admin/observaciones/[publicToken]
/admin/observaciones/[publicToken]/microchip/reemplazar
/gob/operativos †    /gob/rupga †           /gob/directorio †
/admin/directorio    /gob/analitica         /gob/disputas/[disputeToken]
/gob/mascotas/[token]                       /admin/mascotas/[token]
/admin/cola/[publicToken]                   /admin/cuentas
/admin/inteligencia  /admin/outbox/[id]
/admin/admins/new    /admin/admins/[userId]
/admin/govts/new     /admin/govts/[userId]
```

### 9 · Público y otras
```
/leyes †                        /p/[publicToken]/sighting †
/mis-mascotas/reclamar-dni †    /recuperar/actualizar †
/org/[orgToken]/casos           /org/[orgToken]/censo
/org/[orgToken]/checkins        /org/[orgToken]/cobertura
/org/[orgToken]/configuracion   /org/[orgToken]/mensajes
/org/[orgToken]/miembros        /org/[orgToken]/miembros/invitar
/org/[orgToken]/pets/no-aptas   /org/[orgToken]/transferencias/nueva
/org/[orgToken]/mascotas/[publicToken]/transfer
/org/[orgToken]/mascotas/[publicToken]/microchip/reemplazar
/design/dashboards   (interna de diseño — mirala último, o no la mires)
```
