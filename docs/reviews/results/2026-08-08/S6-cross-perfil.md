# S6 · Cross-perfil — los mismos objetos vistos por cada rol (L1)
**Ventana:** 08/08/2026 14:06–15:35 ART · **Roles recorridos:** `govt-local@`, `govt@`, `owner@`, `graciela@`, `orgadmin@`, anónimo

---

## Matriz de acceso — 3 objetos × roles

Objetos: **`DEN-RCDE-GY9P`** (denuncia, En curso) · **`DIM-WR9N-Y7BN`** (CW-Tero, perdido, de `owner@`) · **`DIM-8PBD-KVAF`** (CW-Rescate-QA-0808b, del refugio → adoptada)

| Ruta | anónimo | `owner@` | `graciela@` | `orgadmin@` | `vet@` | `govt-local@` | `govt@` (CABA) | `admin@` |
|---|---|---|---|---|---|---|---|---|
| `/denuncias/codigo/DEN-…` | 200 ✅ | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `/gob/maltrato/{uuid}` | — | **→ `/acceso-denegado?portal=gob`** ✅ | — | — | — | 200 ✅ | 200 ✅ | 200 ✅ |
| `/p/DIM-WR9N-Y7BN` | 200 ✅ | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| `/mis-mascotas/DIM-WR9N-Y7BN` | → login | 200 ✅ dueño | 404-page | — | — | **→ `/gob`** ✅ | **→ `/gob`** ✅ | — |
| `/mis-mascotas/DIM-CYTK-5MTD` (CW-Luna, ya transferida) | → login | **404-page** ✅ | 200 ✅ nueva dueña | — | — | → `/gob` | → `/gob` | — |
| `/org/DIM-UATE-YXZK/mascotas/DIM-8PBD-KVAF` | → login | **404** ✅ | 404 | 200 ✅ | 404 | **404** ✅ | **404** ✅ | — |
| `/org/DIM-MMTC-M6J4/atender/DIM-WR9N-Y7BN` | → login | 404 | 404 | 404 | 200 ✅ | **404** ✅ | **404** ✅ | — |

**Veredicto: la autorización está bien puesta.** Tres patrones distintos y coherentes: **404** para rutas de una organización ajena, **redirección al portal propio** cuando un operador entra a una ruta de ciudadano, y una **pantalla dedicada `/acceso-denegado?portal=gob`** cuando un ciudadano entra a una ruta de gobierno. No encontré ni una fuga.

### Aislamiento por jurisdicción — tres alcances distintos, medidos

| Cuenta | Alcance declarado | Moderación | Triage | ¿Ve el servicio CW- (La Plata, PBA)? |
|---|---|---|---|---|
| `admin@` | Universal | **3** | **5078** | — |
| `govt-local@` | 2 localidades · 2 provincias (CABA + PBA) | **0** | **35** | **sí** ✅ |
| `govt@` | CABA | **2** | **169** | **no** ✅ |

No es un filtro cosmético: son tres colas distintas. Y el corte por cobertura funciona en los dos sentidos — `govt@` (CABA) **sí** ve la denuncia de Palermo y **no** ve el servicio de La Plata, que es exactamente lo correcto.

---

## Hallazgos

### S6-F01 (MEDIA) — "EN ADOPCIÓN" queda pegado en la credencial: **reproducido en una adopción de dos minutos**

Esto confirma y sube de categoría el S2-F04. Ya no es un registro viejo: **lo reproduje de punta a punta hoy.**

**OBSERVACIÓN** — secuencia completa con horas:

| Hora ART | Qué hice |
|---|---|
| 11:37 | `orgadmin@` publica `DIM-8PBD-KVAF` en `/adoptar` |
| 12:11 | `graciela@` se postula |
| 12:13 | `orgadmin@` aprueba la postulación |
| 12:15 | `orgadmin@` **finaliza la adopción** |
| 12:15:50 | Verifico: fuera de `/adoptar`, fuera de la custodia del refugio, fuera de postulaciones ✅ |
| 12:17 | `graciela@` entra a `/mis-mascotas/DIM-8PBD-KVAF` → **"EN ADOPCIÓN"** en el encabezado de la credencial |

Y el mismo defecto estaba en `CW-Refu-Manchas`, adoptada hace dos días. **Dos de dos.** El resto de las superficies está bien:

| Superficie | ¿Dice "EN ADOPCIÓN"? |
|---|---|
| `/mis-mascotas/DIM-8PBD-KVAF` (la adoptante) | ❌ **sí** |
| `/p/DIM-8PBD-KVAF` | no ✅ |
| `/adoptar` (listado) | no ✅ |
| `/org/…/mascotas` (custodia) | no ✅ |
| `/org/…/adopciones` | no ✅ |

La pantalla de finalizar prometía, textual: *"La mascota queda registrada en la cuenta de la persona que se postuló online. **La va a ver en Mis mascotas al instante**"*. Cumple — pero la ve etiquetada como si todavía estuviera buscando hogar.

**HIPÓTESIS** — el chip del encabezado lee un flag de publicación que la finalización no limpia, mientras que los listados filtran por otra condición (custodia / disponibilidad). Conjetura.

---

### S6-F02 (MEDIA) — La notificación de "Transferencia aceptada" le ofrece al ex dueño un link a la mascota que ya no puede ver

**OBSERVACIÓN** — `owner@`, `/notificaciones`, 12:07 ART. La notificación *"Transferencia aceptada · LISTO ·TRANSFERENCIA DE MASCOTA ACEPTADA"* trae el botón **"Ver CW-Luna"**, apuntando a `/mis-mascotas/DIM-CYTK-5MTD`.

Esa ruta, para `owner@`, renderiza **"No encontramos esta página"** — correctamente, porque desde las 11:11 la mascota es de `graciela@`.

O sea que la notificación que le confirma a alguien que entregó su mascota le ofrece, como única acción, un link que lleva a un cartel de página inexistente. La app sabe que ya no tiene acceso (por eso muestra ese cartel) y sin embargo pinta el botón.

**SUGERENCIA** — en las notificaciones de transferencia salida, apuntar al detalle de la transferencia (`/transferencias/PTR-…`, que sí es accesible y cuenta la historia completa) en vez de a la ficha de la mascota.

---

### S6-F03 (BAJA) — Después de aprobar una postulación, la pantalla no nombra el paso siguiente

**OBSERVACIÓN** — 12:13 ART. Aprobada la postulación, su detalle queda en *"Esta postulación ya fue resuelta: aprobada."* y ofrece un solo camino hacia adelante: **"Ver ficha de CW-Rescate-QA-0808b"**.

El paso siguiente del flujo —finalizar la adopción— vive en `/org/{org}/mascotas/{token}/adoption`, que se alcanza desde esa ficha. O sea que el camino existe, pero se llama "ver ficha", no "finalizar adopción".

Un operador que acaba de aprobar y quiere cerrar el circuito tiene que adivinar que la acción está dentro de la mascota y no dentro de la postulación que estaba mirando.

**SUGERENCIA** — un botón "Finalizar adopción →" en el detalle de la postulación aprobada, apuntando a la misma ruta.

---

### S6-F04 (BAJA) — Dos redacciones distintas del mismo "No encontramos esta página"

**OBSERVACIÓN** — mismo `<h1>` en las dos, cuerpo distinto:

| Ruta | Cuerpo | Salidas |
|---|---|---|
| `/mis-mascotas/[token ajeno]` y `/mis-mascotas/[token inventado]` | "**La página** que buscás no existe o cambió de lugar. Revisá **la dirección** o volvé al inicio." | Volver al inicio · **Mis mascotas** |
| `/ruta-que-no-existe-qa` (404 global) | "**La dirección** que buscás no existe o cambió de lugar. Revisá **el enlace** o volvé al inicio." | Volver al inicio |

Los sustantivos están intercambiados entre las dos versiones. La de adentro de la app es mejor —ofrece "Mis mascotas" como salida contextual— así que la que conviene unificar es la global.

**Lo importante de esta prueba salió bien:** un token que existe pero es de otra persona y un token inventado devuelven **exactamente la misma pantalla**. No hay fuga de existencia.

---

### S6-F05 (BAJA) — El 404 global no tiene `<main>` y su "Ir al contenido principal" no lleva a ningún lado

**OBSERVACIÓN** — en `/ruta-que-no-existe-qa` y `/turnos`:

```
skip link            : <a href="#main-content">Ir al contenido principal</a>
document.querySelector('#main-content')  → null
document.querySelectorAll('main').length → 0
document.querySelectorAll('[role=main]').length → 0
```

En las páginas normales `main#main-content` existe y el salto funciona ✅ — verificado en `/mis-turnos`. El agujero es sólo la página de 404.

Quien navega con teclado, el primer Tab de la página lo pone sobre ese link; al activarlo no pasa nada.

---

## Verificado y limpio

- **Los dos "rojos" del e2e que el prompt marcó como posible territorio de producto cierran completos por UI.**
  - **Aceptar transferencia** (S2): propuesta 11:08 → aceptada 11:11 → CW-Luna en la cuenta de `graciela@` con la libreta intacta.
  - **Finalizar adopción** (esta sesión): publicar 11:37 → postular 12:11 → aprobar 12:13 → **finalizar 12:15** → la mascota sale de `/adoptar`, sale de la custodia del refugio, sale de postulaciones, y aparece en la cuenta de la adoptante. Ninguno de los dos se traba.
- **La notificación del walk-in al dueño llega, y con el copy correcto.** `owner@` tiene: *"Consultorio Dr. Juan Veterinario registró vacuna administrada con fecha 8 de agosto de 2026. **Si no reconocés esta atención, abrí el registro para revisarlo o corregirlo.**"* Este era el punto marcado ALTA-si-falla de la mitigación PO 04/08: **no falla**, y además invita a disputar.
- **El avistaje anónimo sigue visible** en las notificaciones de `owner@` una hora después, con el contacto del finder.
- **La postulación de adopción declara por adelantado qué se comparte.** Antes del primer campo: *"**LO QUE VERÁ EL REFUGIO DE VOS** · Graciela Saavedra · graciela@dim.test · +54 9 11 5555-2003"*. Es la mejor disclosure de consentimiento que vi en todo el producto.
- **Finalizar adopción también declara su consecuencia antes:** *"Esta acción cierra la custodia del refugio y, si hay un tránsito activo, también lo cierra. Queda registrado como **evento inmutable** en la historia de CW-Rescate-QA-0808b."*
- **Confirmación en dos tiempos** en las tres acciones irreversibles que toqué (aprobar postulación, finalizar adopción, marcar revisada). Ninguna se dispara con un click distraído.
- **El selector de archivo vuelve a estar en español** en la pantalla de finalizar adopción: "Elegir archivo · Ningún archivo elegido" — la precondición §10.0 #2 se sostiene en otra superficie.
- **La postulación exige un mínimo de contenido** (30 caracteres) y lo cuenta en vivo: "148 / 30 caracteres mínimo".

---

## Dos falsas alarmas más, verificadas antes de escribirlas

1. **"El botón Enviar postulación no hace nada."** Igual que con el intake de S3: el botón del paso 5 está dentro de un contenedor `inert` + `aria-hidden="true"` y fuera del viewport (`y = 1147 px`). Ningún usuario real lo alcanza; lo alcancé yo con eventos sintéticos. Recorriendo los 5 pasos con "Continuar →", la postulación se envió a la primera. **Es mi instrumentación, no el producto.** Ya van tres wizards con esta misma protección bien puesta.
2. **"Aprobar postulación no responde."** Es el patrón de dos tiempos: el primer click revela el par [Aprobar postulación] [Cancelar]. Mi selector descartaba el segundo botón por tener el mismo texto que el primero. Es exactamente el error que hubo que retractar en la corrida anterior; esta vez lo agarré antes de escribirlo.

---

## No pude verificar

1. **Contrato de adopción imprimible.** La pantalla de finalizar sólo ofrece **subir** un contrato ya firmado ("CONTRATO FIRMADO (PDF O IMAGEN), opcional"). No hay link para descargar o imprimir un modelo. Coincide con lo que ya había reportado la corrida anterior (N6); no lo cuento como hallazgo nuevo, pero **sigue abierto**.
2. **Meses de seguimiento post-adopción** (default 6, genera recordatorios de check-in). Lo dejé vacío; no verifiqué que los recordatorios se creen.
3. **`vet@` y `orgadmin@` sobre la denuncia.** No los probé contra `/gob/maltrato/{uuid}`: me faltó incluirlos en la corrida de la matriz y no volví atrás. Por simetría con `owner@` deberían caer en `/acceso-denegado`, pero **no lo medí**.
4. **La notificación de adopción a `graciela@`** ("recibe una notificación", dice el copy). Entré directo a la ficha de la mascota y no revisé su bandeja.

---

## HANDOFF S6 → S7 (§10.2)

**Estado: PARCIAL.** Matriz de acceso completa para 3 objetos y 7 roles, jurisdicciones verificadas en tres alcances, y los dos flujos "rojos" cerrados de punta a punta. Faltan los 4 puntos de arriba.

**Sesión actual:** `graciela@dim.test`.
**Logins acumulados:** owner@ ×3, graciela@ ×3, orgadmin@ ×2, vet@ ×1, admin@ ×1, govt-local@ ×1, govt@ ×1.

**Estado de los objetos al cerrar S6:**

| Objeto | Estado |
|---|---|
| `DEN-RCDE-GY9P` | En curso · asignada a Gobierno (local) |
| `CW-Tero` `DIM-WR9N-Y7BN` | **Perdido** · de `owner@` · antirrábica ahora **VERIFICADA** por vet |
| `CW-Rescate-QA-0808b` `DIM-8PBD-KVAF` | **Adoptada por `graciela@`** · adopción finalizada 12:15 |
| `CW-Luna` `DIM-CYTK-5MTD` | De `graciela@` desde 11:11 |
| `OFR-4GVG-YSR3` | Aprobado |

| Para | Qué verificar |
|---|---|
| **S7** | Foco visible y orden de tabulación en las tarjetas-radio del wizard de denuncia y en la cola de gobierno; contraste de los chips de 10 px y los `<dt>` de 12 px; zoom 200 % |
| **S8** | Catálogo de fechas; marcar a CW-Tero como encontrado y cerrar `CAS-A9F2-MV8R`; documentos impresos |
