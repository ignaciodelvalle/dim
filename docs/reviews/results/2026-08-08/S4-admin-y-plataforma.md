# S4 · Admin y plataforma
**Cuenta:** `admin@dim.test` (Administrador/a · Universal) · **Ventana:** 08/08/2026 12:42–13:10 ART

---

## Entidades creadas

| Tipo | Nombre | Estado |
|---|---|---|
| Suscripción de alerta | **CW-Alerta QA 08/08 (umbral inalcanzable a propósito)** | Denuncias de maltrato abiertas · **encima de 999999** · activa ("2 de 2") |

Umbral deliberadamente inalcanzable para no ensuciar la cola de alertas. Los disparos corren por cron diario — no espero firing inmediato, y no lo reporto como falla.
**No emití ningún lote de chapas.** El botón "Emitir y descargar CSV" genera una descarga y no descargo archivos sin confirmación; además ya tengo el lote CW- de la corrida anterior.
**No toqué la alerta sembrada** `DEMO-alert-sterilization-caba`.

---

## Cierra dos pendientes de S1

### `DEN-RCDE-GY9P` **sí llegó** a la herramienta de gobierno — y eso afila S1-F02

La encontré a las 12:58 ART. Detalle completo en `/gob/maltrato/374cc036-…`, con todo lo que cargué:

| Campo | Valor |
|---|---|
| Estado | ABIERTA · **CRÍTICA — PELIGRO INMEDIATO** |
| Creada | 8 de agosto de 2026 **a las 10:30** ✅ |
| Gravedad | Crítica — peligro inmediato |
| Lugar | Plaza Serrano, Palermo · Palermo, CABA |
| Coordenadas | −34.588755, −58.430167, bajo el rótulo **"UBICACIÓN EXACTA — USO OFICIAL (LEY 14.346)"** |
| Evidencia | `cw-evidencia-s1.jpg` con "Abrir →" ✅ |
| Reportante | "Denuncia anónima." ✅ |
| Acciones | Marcar revisada · Iniciar seguimiento · Cerrar con resolución · Sin sustento |

**Lo que esto le agrega a S1-F02.** El comprobante que ve el ciudadano dice, textual: *"Esta denuncia aún no fue enviada a la herramienta gubernamental — la integración con los canales oficiales de la **Ley 14.346** está en desarrollo."*
La pantalla del operador, sobre la misma denuncia, rotula el mapa: *"UBICACIÓN EXACTA — **USO OFICIAL (LEY 14.346)**"*.

Las dos frases pueden ser ciertas a la vez (una habla de canales externos, la otra de uso interno), pero **citan la misma ley con implicaciones opuestas**, y la que lee el ciudadano —"no fue enviada"— describe peor de lo que realmente pasó: su denuncia estuvo en una cola de gobierno, con foto y coordenadas exactas, minutos después de enviarla. La disculpa es peor que la verdad.

### La gravedad **sí** importa — S1-F12 confirmado

La cola de `/gob/denuncias` tiene un filtro **Severidad** con "Baja — preocupante, no urgente" / "Media — requiere intervención pronto" / "Alta — urgente", y mi elección de "Grave / urgente" llegó como **GRAVEDAD: Crítica — peligro inmediato**, renderizada como chip destacado.

El paso 2 del wizard le dice al ciudadano *"No importa cuál elijas — todas las denuncias son revisadas por el equipo."* Sí importa: define con qué prioridad la ve el operador, y es un eje de filtrado de una cola de **5078** denuncias. **Subo S1-F12 de BAJA a MEDIA.**

---

## Hallazgos

### S4-F01 (BAJA) — La cola de denuncias no tiene dónde pegar el código que se le dio al ciudadano

**OBSERVACIÓN** — `/gob/denuncias`, 12:56 ART. Los filtros de la cola son **Provincia · Localidad · Tipo · Severidad · Estado**. No hay campo de código. La cola de triage tiene **5078** denuncias.

El comprobante le dice al denunciante que el código `DEN-XXXX-XXXX` es *"tu única forma de seguimiento"*. Si esa persona llama y lo dicta, el operador no tiene dónde ponerlo dentro de la pantalla en la que está trabajando.

**Lo verifiqué antes de escribirlo, y por eso esto es BAJA y no ALTA:** el buscador global del topbar **sí** lo encuentra. Tipeando `DEN-RCDE-GY9P` devolvió *"DEN-RCDE-GY9P · Denuncia de bienestar · Abierto"* en ~3 s. O sea que el camino existe.

Lo que falla es la señalización: ese buscador mide **32 px**, vive en la barra superior lejos de la cola, y su placeholder dice *"Mascota, nombre, DNI o caso…"* — **no menciona denuncias ni códigos**. Un operador que mira los cinco filtros de la cola concluye razonablemente que no se puede buscar por código.

**SUGERENCIA** — agregar "denuncia" o "código" al placeholder, y/o un campo de código en la barra de filtros de la cola.

---

## Verificado y limpio

- **`/admin/cola` vacía, con salida:** *"No hay solicitudes pendientes en tu jurisdicción. Cuando lleguen nuevas solicitudes las vas a ver acá."* + "Ver historial de decisiones".
- **Briefing de admin coherente y honesto sobre el reparto de trabajo:** *"Estas colas se comparten con Gobierno, que las trabaja acotadas a su jurisdicción."* Contadores: Moderación 3 · Alertas abiertas 1 · Casos abiertos 579 · Observaciones en curso 14 · SLA vencidos 0.
- **Cero `a. m.`/`p. m.` y cero decimales con punto** en todo el portal admin. Los porcentajes van con coma: **50,0 %**, y las medianas también: **287,4 h**.
- **Sellos de frescura correctos y en ART:** *"Calculado al 08/08/2026 11:43 · último evento 08/08/2026 11:36"*.
- **Emisión de chapas: la advertencia está bien puesta y antes de actuar** — *"El CSV con los códigos de activación se genera una única vez: guardalo en el circuito del proveedor — el sistema no puede volver a mostrarlos."*
- **Observaciones antirrábicas con su base normativa a la vista:** *"Período de 10 días por Decreto 4669/1973 (PBA), Ord. CABA 41.831/1987"*, y explica qué muestra por defecto y por qué.
- **Alta de suscripción de alerta:** 6 métricas, dirección encima/debajo, umbral, provincia opcional, etiqueta. Creada al primer intento, pasó de "1 de 1" a "2 de 2". Todos los controles del formulario en **44 px**, uniformes.
- **`/admin/moderacion` redirige a `/gob/denuncias?etapa=moderacion`** y el admin ve el rail de Gobierno — el comportamiento que la precondición §10.0 pedía confirmar.
- **Vocabulario canónico de estados en la cola:** "Abierta / Revisada / En curso", y las acciones son "Marcar revisada / Iniciar seguimiento / Cerrar con resolución / Sin sustento". **Cero "Triagueada", cero "En seguimiento"** como nombre de estado. Sin regresión.

---

## Falsa alarma que verifiqué antes de escribirla

En `/admin/sistema` la tarjeta de SLA parecía tener un texto roto: un `<span>` con el contenido literal `", Atención"`, con coma al principio.

Lo medí: el span es de **1 × 1 px** (oculto visualmente) y el texto completo de su contenedor es **"SLA ENO, Atención"**. El ícono de alerta que está al lado tiene `aria-hidden="true"`. O sea: es el nombre accesible de la tarjeta, y un lector de pantalla lee *"SLA ENO, Atención"* — perfectamente natural. La captura ampliada confirma que en pantalla sólo se ve `⚠ SLA ENO ⓘ / 50,0% / Mediana 287,4 h`.

**No es un bug: es la severidad expuesta como texto y no sólo por color** — justamente lo que §10.0 bis dice que se arregló. El arreglo está bien hecho.

---

## No pude verificar

1. **Emisión de un lote de chapas y su CSV de un solo uso.** No descargo archivos sin confirmación explícita. Queda para S8 o para una corrida con permiso.
2. **Triage de la alerta sembrada** (`DEMO-alert-sterilization-caba`): sigue abierta y no sé si alguien la necesita para demo. Regla propia: si dudo, no la toco.
3. **Ficha de origen de un KPI** ("Ver origen": alcance/fórmula/frescura). No encontré el disparador en `/admin/sistema` con el barrido que hice; puede estar detrás del ícono ⓘ de cada tarjeta. **Anotado para S6.**
4. **Moderación de una denuncia flaggeada** (hay 3 en cola). Son denuncias que no cree yo; modero sólo lo propio. **Anotado para S5**, donde corresponde por jurisdicción.
5. **Disparo real de la alerta CW-** — el cron es diario, está documentado como comportamiento esperado.

---

## HANDOFF S4 → S5 (§10.2)

**Estado: PARCIAL.** Barrido de admin hecho, alerta CW- creada, y cerrados los dos pendientes que S1 había dejado abiertos (denuncia en la cola de gobierno + mapeo gravedad→prioridad). Quedan los 5 puntos de arriba.

**Sesión actual:** `admin@dim.test`. **Logins:** owner@ ×2, graciela@ ×1, orgadmin@ ×1, vet@ ×1, admin@ ×1.

**Ojo para S5:** `DEN-RCDE-GY9P` quedó **sin tocar** a propósito (ABIERTA, sin asignar) para que la triage la haga `govt-local@` desde su jurisdicción, que es lo que corresponde probar.

| Para | Qué verificar |
|---|---|
| **S5** (`govt-local@`) | Triage completo de `DEN-RCDE-GY9P` desde CABA/Palermo; aprobar el servicio **CW-Consulta general**; moderación de las 3 flaggeadas; ¿CW-Tero perdido aparece en vistas de gobierno? |
| **S6** | Ficha de origen de KPI (ícono ⓘ); ¿`govt-local@` ve las mismas 5078 denuncias que el admin universal, o sólo su jurisdicción? |
| **S8** | Emisión de lote de chapas + CSV, si se autoriza la descarga |
