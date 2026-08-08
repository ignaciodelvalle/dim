# S8 · Documentos impresos y fechas ART (L10 · L12)
**Parte 1 — diurna:** 08/08/2026 16:21–17:45 ART
**Parte 2 — nocturna (21:00–00:00 ART):** ventana de divergencia ART/UTC · *pendiente al cierre de esta parte*

---

## Corrección a S1-F02 — el aviso de la Ley 14.346 **sí** se actualiza solo

Volví sobre el comprobante de `DEN-RCDE-GY9P` para ver si el aviso sobrevive a la impresión, y encontré algo que **corrige mi propio hallazgo**.

| Hora ART | Estado de la denuncia | Qué dice el comprobante |
|---|---|---|
| 10:31 | ABIERTA | *"Esta denuncia **aún no fue enviada a la herramienta gubernamental** — la integración con los canales oficiales de la Ley 14.346 está en desarrollo…"* |
| 12:26 | **EN CURSO** (tras el triage de gobierno) | *"**En revisión por la autoridad.**"* |

El aviso **no es un cartel fijo**: depende del estado y se corrige solo cuando la autoridad toma el caso. Eso es exactamente lo que debería hacer, y **es mérito del producto**.

**Qué queda en pie de S1-F02** (y por eso lo **bajo de ALTA a MEDIA**):

1. El ciudadano recorre **cinco pasos** sin que nada le anticipe que su reporte no sale por los canales oficiales todavía. El aviso aparece **después** de enviar.
2. Cuando aparece, está en el peor lugar de la página: **12 px**, ámbar `rgb(150, 96, 14)`, al **72 % de la altura** (`top: 1273 px` sobre 1771 px) — el texto más chico de la pantalla.
3. Sigue en pie la contradicción de rótulos sobre el mismo dato: el paso 3 exige *"el lugar **exacto**"* y advierte que *"la denuncia necesita un punto preciso **para llegar a la autoridad de esa zona**"*; el comprobante rotula ese punto **"Ubicación aproximada"**; y la pantalla del operador lo rotula **"UBICACIÓN EXACTA — USO OFICIAL (LEY 14.346)"**.

**Lo que retiro:** cualquier lectura de que el producto miente de forma sostenida sobre el destino de la denuncia. No lo hace: se corrige solo, y la denuncia llegó a la cola de gobierno en minutos.

---

## Hallazgos

### S8-F01 (MEDIA) — Seis formatos de fecha distintos conviviendo

**OBSERVACIÓN** — cada uno medido en su pantalla, sobre fechas reales de esta corrida:

| # | Formato | Ejemplo literal | Dónde |
|---|---|---|---|
| **A** | largo completo | `8 de agosto de 2026` | comprobante de denuncia · cola de gobierno · ficha de adopción · notificaciones · cola de ingresos |
| **B** | abreviado con "de" | `6 de ago de 2026` · `1 de ago de 2026` | tabla de reglas de agenda · listado de transferencias (bloque ENVIADAS) |
| **C** | abreviado sin "de" | `5 ago 2026` | detalle del servicio en el portal de la org ("Enviado el 5 ago 2026") |
| **D** | numérico con cero | `08/08/2026 11:21` | pantalla de aprobación de servicio en gobierno · sellos "Calculado al…" |
| **E** | numérico corto | `5/8/2026` · `15/8/2026` | notificaciones de mordedura ("del 5/8/2026… Cierre estimado: 15/8/2026") |
| **F** | día capitalizado | `Sábado, 8 De Agosto De 2026` | confirmación de reserva de turno · "Agenda de hoy" del vet |

Y en la **misma pantalla** de `/transferencias` conviven **A** (RECIBIDAS: *"Vence 15 de agosto de 2026"*) y **B** (ENVIADAS: *"1 de ago de 2026"*).

El formato **F** además tiene un defecto propio, ya reportado como S3-F05: es `text-transform: capitalize` sobre `"sábado, 8 de agosto de 2026"`, que en español pone en mayúscula las preposiciones.

**Lo que sí está bien y conviene no romper:** la **hora** es consistente en todo el producto — 24 h, sin `a. m.`/`p. m.`, verificado con regex estricta en los cuatro portales. La única excepción son los **segundos** en la tabla de reglas de agenda (`08:00:00 – 12:00:00`, S3-F06).

**SUGERENCIA** — una sola función de formato con dos variantes declaradas (larga para documentos y detalle, corta para tablas densas), y prohibir el resto.

---

### S8-F02 (BAJA) — `/perdidas` sólo muestra tiempo relativo, sin fecha en ninguna parte

**OBSERVACIÓN** — barrido de formatos sobre `/perdidas`: **cero** coincidencias de cualquier formato de fecha absoluta. Las 24 tarjetas muestran únicamente `HACE 59 MIN`, `HACE 6 H`, `HACE 8 DÍAS`, … `HACE 20 DÍAS`.

Para las primeras horas el relativo es lo correcto. Para "HACE 20 DÍAS" ya no: alguien que quiere cotejar con el día que vio al animal tiene que hacer la cuenta. Y no hay `title`/tooltip con la fecha exacta.

*La credencial pública `/p` hace lo mismo* (`hace 1 h`), pero ahí es más defendible: es una pantalla de urgencia.

**SUGERENCIA** — relativo hasta 48 h y fecha absoluta después, o relativo con la fecha en el `title`.

---

### S8-F03 (BAJA) — El banner "Tu denuncia fue registrada" reaparece con sólo tener `?nueva=1` en la URL

**OBSERVACIÓN** — 12:26 ART, casi dos horas después de crearla y con la denuncia ya **EN CURSO**, abrir `/denuncias/codigo/DEN-RCDE-GY9P?nueva=1` vuelve a mostrar el cartel verde *"Tu denuncia fue registrada. Guardá el código de abajo."*

Sin el parámetro, el cartel no aparece (verificado en la misma llamada). O sea que el banner depende sólo del query param, no del estado ni del momento. Un link guardado en favoritos o compartido dice "recién registrada" para siempre.

---

## Verificado y limpio

- **El comprobante de denuncia tiene hoja de estilos de impresión propia y bien hecha.** Tres reglas dentro de `@media print`:

```css
body > :not(main):not(#comprobante-root) { display: none !important }
[data-print-hide]                        { display: none !important }
#comprobante-root, #comprobante-root *   { color: #000 !important; border-color: #ccc !important; … }
```

  Es decir: se imprime sólo el comprobante, se fuerza texto negro y bordes claros (nada de tinta de fondo), y hay un mecanismo explícito para excluir cromo. Los dos únicos elementos marcados `data-print-hide` son **"← BUSCAR OTRA DENUNCIA"** y **"© OpenStreetMap contributors"** — exactamente lo que no debería salir en papel.

- **El contenido imprimible es el correcto.** `#comprobante-root` (22 líneas) incluye el **código**, el **estado**, la **gravedad**, la **descripción completa**, el **sujeto**, el **lugar** y las **fechas**. No se pierde nada sustantivo.

- **Horas en 24 h en los cuatro portales**, sin `a. m.`/`p. m.`, verificado con `\d{1,2}[:.]\d{2}\s*[ap]\.?\s?m\.?` → sin coincidencias. *(La única "AM" que aparece está dentro del código `DEN-266E-AAMH`.)*

- **Aritmética de fechas correcta** en los tres casos que generé hoy:
  - Transferencia creada 08/08 11:08 → *"Vence 15 de agosto de 2026 a las 11:08"* (7 días exactos) ✅
  - Vacuna aplicada 08/08/2026 → *"Próxima 08/08/2027"* (12 meses) ✅
  - Denuncia crítica ingresada hoy → *"SLA 1 DÍA · EN PLAZO · INGRESADA HOY"* ✅

- **Fecha futura rechazada** en el registro de vacuna: *"La fecha no puede ser futura."*

- **Sellos de frescura con fecha y hora, en todas las pantallas de datos del portal de gobierno y admin:** *"Calculado al 08/08/2026 12:02 · último evento 08/08/2026 11:11"*.

- **Separación correcta de tipos de disposición** en `/gob/mortalidad`: "Cementerio autorizado" y "Entierro en domicilio" figuran como categorías distintas.

- **El selector nativo de archivos aparece en español** en las tres superficies donde lo encontré: `/gob/decomisos/nuevo` ("Elegir archivos"), finalizar adopción ("Elegir archivo · Ningún archivo elegido") y el adjunto de vacuna.

---

## No pude verificar

1. **Descargar comprobante** (`<button>`, genera el archivo en el cliente), **PDF MPF** de un caso de maltrato, **"Imprimir expediente"** y **export PNG del mapa** de Panorama. **No descargo archivos sin confirmación explícita del usuario**, y esta corrida es desatendida. Lo que sí pude hacer es leer la hoja de estilos de impresión, que es la que gobierna el resultado en papel del comprobante — y está bien.
2. **Vista previa de impresión real.** `window.print()` abre un diálogo modal del navegador que bloquea la sesión de automatización; no lo disparé a propósito.
3. **Impresión de más de una página sin recorte** (expediente largo). Sin print preview no es verificable.
4. **Ventana de divergencia ART/UTC (21:00–00:00).** Es la parte 2 de esta sesión; queda programada.

---

## Parte 2 — pendiente: ventana 21:00–00:00 ART

Entre las 21:00 y las 00:00 de Argentina, **UTC ya está en el día siguiente**. Es la única ventana donde se puede distinguir una fecha calculada en ART de una calculada en UTC. Plan:

1. Generar un evento fechado dentro de la ventana: **marcar a CW-Tero como encontrado** (cierra `CAS-A9F2-MV8R`) — un evento nuevo con timestamp propio.
2. Verificar que ese evento se muestre con la fecha **8 de agosto** (ART) y no 9 de agosto (UTC), en las cuatro superficies donde aparecerá: ficha del dueño, línea de tiempo, notificaciones y credencial pública.
3. Recorrer los sellos de frescura de gobierno y admin ("Calculado al…") dentro de la ventana.
4. Revisar el SLA de `DEN-RCDE-GY9P` ("SLA 1 DÍA · INGRESADA HOY"): a las 21:00+ debería seguir diciendo hoy y no haber saltado de día.
