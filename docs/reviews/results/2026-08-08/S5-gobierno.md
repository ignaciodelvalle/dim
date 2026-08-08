# S5 · Gobierno, las dos jurisdicciones
**Cuenta:** `govt-local@dim.test` (Gobierno · 2 localidades · 2 provincias — CABA + Buenos Aires)
**Ventana:** 08/08/2026 13:11–14:05 ART

---

## Trabajo hecho sobre datos propios

| Objeto | Acción | Resultado |
|---|---|---|
| `DEN-RCDE-GY9P` | Asignármela → Marcar revisada → Iniciar seguimiento | **Abierta → Revisada → En curso**, asignada a "Operador/a Gobierno (local)" |
| `OFR-4GVG-YSR3` (CW-Consulta general) | Aprobar → Confirmar | **APROBADO** 12:00 ART; el directorio pasó de "1 pendiente" a cero |

No toqué ninguna denuncia, caso ni servicio que no haya creado yo.

---

## Hallazgos

### S5-F01 (MEDIA) — La pantalla "Aprobaciones" dice que no hay nada pendiente mientras hay un servicio esperando aprobación

**OBSERVACIÓN — las dos superficies medidas en la misma llamada, 08/08/2026 11:58:50 ART**, misma sesión, misma jurisdicción:

| Pantalla | Qué dice |
|---|---|
| `/gob/cola` — titulada **"Aprobaciones"** | *"**No hay solicitudes pendientes** en tu jurisdicción. Cuando lleguen nuevas solicitudes las vas a ver acá."* |
| `/gob/directorio?registro=servicios` | *"**1 servicio pendiente** en tu cobertura."* + CW-Consulta general · **PENDIENTE DE REVISIÓN** |

La cola de "Aprobaciones" sólo contempla tres registros —Matrículas veterinarias, Verificación de organizaciones, Credenciales RUPGA— y las ofertas de servicio se aprueban en otro lado, dentro de Directorio.

**Por qué importa.** Cuando la organización manda el servicio, el producto le promete, textual: *"Una vez enviado, **la autoridad competente lo revisa y aprueba** antes de que puedas armar la agenda."* La autoridad, del otro lado, tiene una pantalla que se llama "Aprobaciones" y que le dice que no tiene nada que aprobar. El operador que confía en esa pantalla nunca aprueba el servicio, y el refugio se queda esperando sin saber por qué.

**El flujo en sí funciona:** entrando por Directorio → Servicios → Pendientes, la aprobación cierra bien (ver "Verificado y limpio"). El problema es que la pantalla que lleva el nombre del trabajo miente sobre si hay trabajo.

**SUGERENCIA** — sumar "Servicios" como cuarta pestaña de `/gob/cola`, o —mínimo— que el vacío diga "No hay solicitudes de matrícula, organización ni RUPGA pendientes" y enlace a los otros registros. Hoy el vacío es categórico y no lo es.

---

### S5-F02 (MEDIA) — La pantalla donde se aprueba un servicio muestra las especies en inglés: "dog, cat"

**OBSERVACIÓN** — `/gob/servicios/OFR-4GVG-YSR3`, 11:59 ART. Bloque DETALLES, medido nodo por nodo (sin `text-transform`, es el texto real):

```
<dt>Duracion</dt>   <dd>20 min</dd>
<dt>Capacidad</dt>  <dd>2 turnos por slot</dd>
<dt>Precio</dt>     <dd>Gratuito</dd>
<dt>Especies</dt>   <dd>dog, cat</dd>     ← 14 px, texto literal
```

Yo cargué ese servicio tildando "Perros" y "Gatos" en el formulario de la organización. Llegan a la pantalla de decisión del funcionario como **`dog, cat`**.

Es la misma fuga que S2-F03 (`"CW-Tero — dog"` en las notificaciones al ciudadano), ahora en el portal de gobierno y **en la pantalla donde se firma una aprobación**. Que el mismo valor crudo aparezca en dos portales distintos sugiere que falta el diccionario en más de un lugar.

---

### S5-F03 (BAJA) — Dos palabras sin tilde en el circuito de aprobación, una de ellas en el botón de confirmar

**OBSERVACIÓN** — texto literal, sin `text-transform`:

| Dónde | Texto | Debería |
|---|---|---|
| `<dt>` del bloque DETALLES, 12 px | **"Duracion"** | "Duración" |
| Botón de confirmación de la decisión | **"Confirmar aprobacion"** | "Confirmar aprobación" |

En la misma pantalla, "Capacidad", "Precio" y "Especies" están bien. Y el formulario de la organización que da de alta el servicio dice correctamente "Duración (minutos) *". O sea que la versión sin tilde es local a esta pantalla.

La segunda es la más incómoda: es el último texto que lee el funcionario antes de aprobar.

---

### S5-F04 (BAJA) — El punto medio separador se come el espacio, en tres componentes y tres portales

**OBSERVACIÓN** — instancias literales, cada una medida en su portal:

| Portal | Texto | Falta |
|---|---|---|
| Ciudadano — `/notificaciones` | `"ATENCIÓN ·ALERTA DE MASCOTA PERDIDA"` · `"LISTO ·ADOPCIÓN FINALIZADA"` | espacio **después** |
| Gobierno — línea de tiempo de la denuncia | `"8 de agosto de 2026 a las 11:54· Operador/a Gobierno (local)"` | espacio **antes** |
| Gobierno — chip de rol del topbar | `"Gobierno·2 localidades · 2 provincias"` | espacio a los **dos lados** (el segundo `·` sí está bien) |

En el resto del producto el separador es `" · "` con espacio de los dos lados — incluso en la misma página: dos líneas más arriba de la primera instancia se lee `"11 sin leer · 26 en total"`.

Es de una sola línea de fix por componente, pero se ve en las tres superficies principales.

---

## Verificado y limpio

- **El aislamiento por jurisdicción funciona, y se nota en los números.** Mismo momento, dos cuentas: `admin@` (universal) ve **Moderación 3 · Triage 5078**; `govt-local@` ve **Moderación 0 · Triage 35**. No es un filtro cosmético: la cola es otra.
- **La denuncia anónima llegó completa y bien ruteada.** `DEN-RCDE-GY9P` apareció **segunda** en la cola local, con `CRÍTICA — PELIGRO INMEDIATO · SLA 1 DÍA · EN PLAZO · INGRESADA HOY · Palermo, CABA · 8 de agosto de 2026`. El orden de la cola pone las críticas primero y dentro de ellas ordena por vencimiento de SLA.
- **El SLA se calcula por gravedad:** 1 día para crítica, 3 días para alta, 14 días para baja. Verificado en cuatro denuncias distintas de la cola.
- **Ciclo de triage completo, con vocabulario canónico.** Abierta → asignada → **Revisada** → **En curso**. Cero "Triagueada", cero "En seguimiento" como nombre de estado. Sin regresión.
- **Cada acción de triage abre un formulario con nota antes de confirmar** (no es un click suelto). *Y me hizo dudar:* mi primer intento de "Marcar revisada" no cambió el estado, porque el primer click abre el formulario y yo me fui antes de enviarlo. No es un botón muerto — es el patrón de dos tiempos que ya nos había hecho tropezar en la corrida anterior. Lo verifiqué antes de escribir nada.
- **La línea de tiempo registra todo, en ART y 24 h:** `10:30 Denuncia registrada` · `11:54 Denuncia revisada por la autoridad` · `11:54 Caso asignado a Operador/a Gobierno (local)` · `11:54 Seguimiento activo iniciado`.
- **Cero `a. m.`/`p. m.` en todo el portal**, verificado con regex estricta de hora (`\d{1,2}[:.]\d{2}\s*[ap]\.?\s?m\.?` → sin coincidencias). *La única "AM" que aparece está adentro de un código de denuncia: `DEN-266E-AAMH`.*
- **La denuncia trae la normativa aplicable a la vista:** *"Ley Nacional 14.346 (1954) — Malos tratos y actos de crueldad contra animales"* y *"MPF CABA — Unidad Fiscal de Maltrato Animal — Pipeline de denuncia formal (**referencia operativa, no marco legal**)"*. Esa aclaración entre paréntesis es exactamente la clase de precisión que evita que un funcionario cite algo que no corresponde.
- **La evidencia del ciudadano llegó entera:** `cw-evidencia-s1.jpg` con su "Abrir →", y el reportante figura como *"Denuncia anónima."*.
- **Aprobación del servicio: cierra completo.** Directorio → Servicios → Pendientes → detalle → Aprobar → "Confirmar aprobacion" → **APROBADO**, y el contador del directorio pasó a cero en el mismo minuto.
- **CW-Tero perdido aparece en `/gob/perdidas`** dentro de la cobertura. *(Lo di por ausente en una primera lectura y estaba en el HTML servido: me había quedado corto el recorte. Corregido antes de escribirlo.)*
- **Privacidad por alcance, explicada:** *"Vista nacional/multi-provincial: se ocultan los datos de contacto y ubicación exacta. Filtrá a tu jurisdicción operativa para ver el detalle de contacto."*
- **`/gob/mortalidad` separa "Cementerio autorizado" de "Entierro en domicilio"**, con la cita normativa en el encabezado (CABA: Ley 5470).
- **Etiquetas de prioridad con texto, no sólo color:** "PRIORIDAD ALTA" / "PRIORIDAD MEDIA" con su obligación normativa, meta, confianza y `n`. Y las tarjetas de severidad exponen la palabra al lector de pantalla (`"SLA ENO, Atención"`, `"Antirrábica vencida, Peligro"`) con el ícono en `aria-hidden`.
- **Números en formato argentino:** `18,8%` · `42,4%` · `n = 2.927` · `~1.101` · `50,0%` · `287,4 h`.
- **Sellos de frescura:** *"Calculado al 08/08/2026 12:02 · último evento 08/08/2026 11:11"*.

---

## No pude verificar

1. **Reportar mordedura → iniciar observación antirrábica.** No llegué. Es de las áreas sin spec e2e detrás, así que es la que más valor tendría. **Prioridad para una próxima corrida.**
2. **PDF MPF de un caso de maltrato** y **"Imprimir expediente"** — generan descarga/impresión. No descargo sin confirmación. **S8.**
3. **Export PNG del mapa encuadrado** en Panorama — misma razón. **S8.**
4. **Armar un operativo** desde `/gob/operativos` ("Armar operativo →" en La Plata 312 y Palermo 188). Preferí no crear un operativo real sobre datos de seed que no son míos.
5. **Moderación de las 3 denuncias flaggeadas** — no las creé yo; regla propia de no tocar datos ajenos.
6. **Vacío con acción en las colas de gobierno.** Probé `/gob/perdidas?provincia=CABA&especie=other` y **el filtro por URL no se aplicó** (siguió mostrando 5 resultados y el cartel de "Vista nacional/multi-provincial"). Es consistente con S3-F07: en estas pantallas los parámetros de URL no son fiables. Habría que probarlo tocando los filtros en pantalla; no llegué.
7. **`govt@`** (la segunda jurisdicción). Sólo recorrí `govt-local@`. **Queda pendiente y es el hueco más grande de esta sesión** — la comparación entre las dos jurisdicciones era medio objetivo de S5.

---

## HANDOFF S5 → S6 (§10.2)

**Estado: PARCIAL.** Triage completo, aprobación de servicio y barrido del portal hechos. Falta `govt@` y las cuatro superficies de documento/impresión.

**Sesión actual:** `govt-local@dim.test`. **Logins:** owner@ ×2, graciela@ ×1, orgadmin@ ×1, vet@ ×1, admin@ ×1, govt-local@ ×1.

**Estado de mis objetos al cerrar:**

| Objeto | Estado |
|---|---|
| `DEN-RCDE-GY9P` | **En curso**, asignada a Gobierno (local) |
| `OFR-4GVG-YSR3` | **APROBADO** — ya se le puede armar agenda |
| `OFR-Z72K-C3WG` | Aprobado, con 2 reglas y turnos hasta el 31/8 |
| `CW-Tero` / `DIM-WR9N-Y7BN` | **Perdido**, visible en `/perdidas` y en `/gob/perdidas` |
| `DIM-8PBD-KVAF` | En custodia de Refugio Test, **publicada en `/adoptar`** |
| `CW-Luna` / `DIM-CYTK-5MTD` | De `graciela@` desde las 11:11 |

| Para | Qué verificar |
|---|---|
| **S6** | Los 3 objetos × roles: `DEN-RCDE-GY9P`, `DIM-WR9N-Y7BN`, `DIM-8PBD-KVAF`. Incluye `govt@` como uno de los roles, y así cubro el hueco de S5 |
| **S6** | `owner@` sin acceso a CW-Luna · notificación del walk-in a `owner@` · postulación de adopción a `DIM-8PBD-KVAF` |
| **S7** | Chips de 10 px y `<dt>` de 12 px: contraste; foco visible en las tarjetas de denuncia |
| **S8** | Ya van **siete** formatos de fecha: `15 de agosto de 2026` · `1 de ago de 2026` · `5 ago 2026` · `6 de ago de 2026` · `Sábado, 8 De Agosto De 2026` · `08/08/2026 11:21` · `8 de agosto de 2026 a las 11:54` |
