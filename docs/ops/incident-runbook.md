# Runbook de incidentes — operadores no técnicos

Versión: 1.0 · Fecha: 2026-06-26

Este runbook es para el operador de turno que NO es desarrollador.
Te dice qué mirar, qué significa lo que ves, y a quién escalar.
Las acciones que implican código o base de datos las hace el equipo técnico — vos no tenés que tocarlas.

---

## 1. ¿Cómo sé si algo está roto?

Síntomas que requieren atención:

| Lo que ves | Severidad |
|---|---|
| Un dashboard (ej. `/gob/...`, `/admin/...`) carga vacío o muestra error "Something went wrong" | Alta |
| Los números de un panel no cambian hace más de 24 h cuando deberían actualizarse | Media |
| Un usuario reporta que no puede iniciar sesión o queda en loop de login | Alta |
| La página de salud de crons (`/admin/programa` → sección Crons) muestra algún cron como **fallido** o **sin correr** | Alta |
| Los reportes de bienestar o adopciones no se procesan / las notificaciones no llegan | Media |

Si no estás seguro si algo es roto o esperado: **escalá primero, diagnosticá después.**

---

## 2. Incidentes más frecuentes y qué revisar

### 2.1 Cron atascado o sin correr

Los crons son tareas automáticas que el sistema corre a intervalos fijos (ej: actualizar estado de mascotas, cerrar observaciones de rabia, expirar propuestas de tránsito).

**Síntoma:** un panel muestra datos desactualizados, o el estado de una mascota no cambió cuando debería.

**Qué revisar:**

1. Entrá a `/admin/programa` y buscá la sección de salud de crons.
2. Fijate si algún cron aparece como "fallido", "sin correr" o con fecha de última ejecución muy antigua.
3. Si el cron de reconciliación de estado de mascotas (`reconcile-pet-status`) o el de expiración de propuestas de tránsito (`expire-foster-proposals`) llevan más de 2 horas sin correr → **escalar al equipo técnico**.

**Qué NO hacer:** no reiniciar servidores ni tocar la base de datos vos mismo.

**Escalá si:** cualquier cron no corrió en el tiempo esperado (ver tabla de referencia más abajo).

---

### 2.2 Outbox de notificaciones sin drenar

El outbox es la cola que procesa notificaciones de eventos (ej: nueva denuncia de bienestar, alerta de brote). Si no drena, los operadores de salud o tránsito no reciben avisos.

**Síntoma:** notificaciones que deberían llegar no aparecen; reportes de vigilancia sin procesar.

**Qué revisar:**

1. Esto requiere acceso a la base de datos. No podés verificarlo vos solo — escalá directamente al equipo técnico.
2. Describí exactamente: qué acción se tomó, a qué hora, y qué notificación se esperaba.

**Escalá si:** un operador reporta que no recibió un aviso crítico (brote epidemiológico, denuncia de maltrato con severidad alta).

---

### 2.3 Dashboard vacío o con error

**Síntoma:** `/gob/vigilancia`, `/gob/adopciones`, `/admin/programa` u otros paneles cargan en blanco o con mensaje de error.

**Qué revisar:**

1. Recargá la página (Ctrl+F5 / Cmd+Shift+R). Si el error persiste → escalar.
2. Probá en modo incógnito. Si funciona en incógnito pero no en tu sesión normal → el problema es de sesión (ver sección 2.4).
3. Si otros operadores también ven el error → es un problema del sistema, no de tu sesión.

**Escalá si:** el error persiste en más de un operador o en modo incógnito.

---

### 2.4 Problemas de inicio de sesión / sesión

**Síntoma:** loop de login, "sesión expirada" repetido, o no podés acceder con credenciales correctas.

**Qué revisar:**

1. Probá cerrar sesión completamente y volver a entrar.
2. Probá en modo incógnito o en otro navegador.
3. Si el problema es solo tu cuenta → puede ser una sesión corrupta. El equipo técnico puede limpiarla.
4. Si múltiples usuarios no pueden entrar → es un problema de autenticación global. Escalá con urgencia.

**Escalá si:** más de un usuario afectado, o el problema persiste después de 5 minutos con navegador nuevo.

---

### 2.5 Datos de producción incorrectos o desincronizados

**Síntoma:** el estado de una mascota dice "activa" pero debería ser "extraviada"; un censo no refleja cambios recientes.

**Qué revisar:**

1. Verificá si hubo una acción reciente (el estado puede tardar hasta 5 minutos en reflejarse tras un cron).
2. Si pasaron más de 30 minutos sin actualización → posible cron atascado (ver 2.1).

**Escalá si:** el dato incorrecto tiene consecuencias legales o sanitarias (ej: mascota en observación de rabia marcada como "sin riesgo").

---

## 3. Tabla de referencia de crons

| Nombre del cron | Frecuencia esperada | Qué hace |
|---|---|---|
| `reconcile-pet-status` | Cada 1–6 h | Actualiza estado de mascotas (extraviada, sin seguimiento, etc.) |
| `expire-foster-proposals` | Cada 1–2 h | Expira propuestas de tránsito sin respuesta |
| `close-rabies-observations` | 1 vez por día | Cierra observaciones de rabia de 10 días que vencieron |
| `materialize-slots` | 1 vez por día | Genera turnos disponibles para servicios veterinarios |
| `cron-data-lifecycle` | 1 vez por semana | Limpieza de datos expirados (retención PII) |
| ENO queue drain | Cada 15–30 min | Envía notificaciones de zoonosis a autoridades |

Si un cron no apareció en la tabla de salud en el tiempo esperado → **escalar**.

---

## 4. A quién y cómo escalar

### Urgente (respuesta en < 30 min)
- Autenticación rota para múltiples usuarios
- Dato incorrecto con consecuencia sanitaria o legal
- Cron de rabia o vigilancia epidemiológica fallido

**Canal:** mensaje directo al equipo técnico on-call + canal de incidentes del equipo.

### No urgente (respuesta en < 4 h)
- Dashboard vacío que no impacta flujos críticos
- Notificación no recibida (pero el dato está correcto)
- Cron atascado sin consecuencia inmediata

**Canal:** canal de soporte del equipo técnico.

---

## 5. Información que el equipo técnico va a pedir

Cuando escalás, incluí siempre:

1. **¿Qué ruta/página tiene el problema?** (ej: `/gob/vigilancia`, `/admin/programa`)
2. **¿Desde cuándo?** (hora aproximada en que empezó)
3. **¿Solo vos o también otros usuarios?**
4. **¿Qué acción hiciste justo antes del error?**
5. **Screenshot o copia del mensaje de error** si lo hay.
6. **¿El problema afecta datos sensibles?** (mascotas en observación de rabia, denuncias de maltrato, etc.)

Con esa información el equipo puede diagnosticar en minutos en vez de horas.

---

## 6. Qué NO hacer durante un incidente

- **No reinicies servidores** ni toques configuración de infraestructura.
- **No ejecutes consultas directas a la base de datos** aunque tengas acceso.
- **No comuniques externamente** el incidente hasta que el equipo técnico lo autorice.
- **No esperes más de 15 minutos** si el impacto es sobre datos sanitarios o legales — escalá rápido.

---

*Para runbooks técnicos (deploy, migraciones, bootstrap), ver `docs/ops/`.*
