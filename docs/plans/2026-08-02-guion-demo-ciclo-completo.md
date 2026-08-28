# Guion de demo — el ciclo completo: Admin → todos los roles → Admin

> Cinco vistas elegidas con criterio (incluye mortalidad y bivariado), un arco de
> detección → operativo → ciclo de roles → territorio, y cada beat en vivo con su
> plan B. Validado contra código y seeds el 2026-08-02 (dos exploraciones
> read-only). Duración estimada: 15-18 minutos.

## Reparto (todos con `Test1234!` — perfiles de navegador PRE-LOGUEADOS)

| Perfil | Cuenta | Rol en el guion |
|---|---|---|
| 1 | `admin@dim.test` | Detecta, contextualiza y cierra |
| 2 | `govt-local@dim.test` | Autoridad de CABA/Palermo — coordina |
| 3 | `orgadmin@dim.test` | Refugio Test (la org verificada) — publica el operativo |
| 4 | `owner@dim.test` | El vecino — reserva; y el dueño del beat 5b |
| 5 | `vet@dim.test` | Matriculado — atiende y firma |

**Regla dura**: NO loguearse en vivo. Hay rate limit de login por email y por IP
(`LOGIN_EMAIL_LIMIT` y `LOGIN_IP_LIMIT` en
`src/modules/auth/application/login-limits.ts` — los números no se copian acá;
esta línea decía "10/min por IP" hasta el 2026-08-27); una demo con retomas se
lo come. Cinco perfiles de navegador separados,
sesiones abiertas antes de empezar.

## Las 5 vistas

| # | Vista | Qué demuestra |
|---|---|---|
| V1 | `/admin/alertas` | Detección con triage vivo (abre y cierra el arco) |
| V2 | `/admin/panorama?preset=control-poblacional` | El problema en territorio (drill CABA, ranking) |
| V3 | `/gob/operativos?vista=campanas` | La única superficie 100% en vivo: el hueco antes, la campaña formándose después |
| V4 | `/admin/panorama?preset=brotes-activos&encoding=bivariate` | Bivariado (provincia) + timeline pre-cargado: el cluster de rabia de Salta, 6→18 jun |
| V5 | `/admin/panorama?preset=mortalidad` | Mortalidad como estado de situación + trazabilidad de disposición (SIN scrub: capa no temporal, a propósito) |

Las pantallas transaccionales (wizard, búsqueda, atención, credencial) son actos,
no vistas.

## Actos

### Acto 0 — Preparación (antes)
- [ ] Staging redeployado con la corrida vigente.
- [ ] 5 perfiles pre-logueados (ver reparto).
- [ ] Verificar EN VIVO contra staging: alerta de Palermo en estado `disparada`;
      al menos una mascota de `owner@` **en observación antirrábica** (para 5b) y
      una **sin esterilizar** (protagonista del ciclo; elenco `DIM-DEMO-0001..0010`).
- [ ] NO pre-crear la oferta de esterilización (se crea en vivo — ese es el beat).
- [ ] Celular a mano con cámara para el QR de Pampa (`DIM-PAMP-0001`).

### Acto 1 — Admin detecta (perfil 1)
1. **V1**: la alerta "Cobertura de esterilización — Palermo, CABA · observado 38 ·
   meta 70", vencida de SLA. → **Reconocer** (la fila cambia en vivo) →
   Registrar seguimiento.
2. **V2**: coroplético nacional de esterilización → drill CABA → el ranking
   muestra quién está atrás. Si la Ficha de origen llegó al deploy: click en el
   KPI → "¿de dónde sale este número?" (alcance, fórmula, período, enlace
   reproducible). → De vuelta en V1: **Contactar autoridad** — handoff a Gobierno.

### Acto 2 — Gobierno coordina (perfil 2)
3. **V3** primera pasada: Operativos/Campañas de su jurisdicción — **el hueco es
   visible**: no hay operativo de esterilización en Palermo. Mencionar
   `/gob/outreach` como mecanismo de convocatoria. Narración: "el municipio
   convoca al refugio".

### Acto 3 — La org publica (perfil 3)
4. `/org/…/servicios/nuevo`: wizard de 3 pasos — Esterilización, capacidad,
   elegibilidad, localidad Palermo → regla de agenda → **Materializar ahora** →
   turnos reservables al instante.

### Acto 4 — El vecino reserva (perfil 4)
5. `/turnos/buscar`: esterilización + CABA → la oferta recién creada → reservar →
   confirmación en `/mis-turnos`.

### Acto 5 — El vet atiende y firma (perfil 5)
6. Agenda de la org → el turno → formulario de esterilización → evento **firmado**
   (`authorVerified` — la diferencia entre firmado por matriculado y declarado por
   cualquiera es EL punto del sistema).
7. **La mascota refleja al instante** (proyección pura, sin cron): libreta del
   owner y credencial pública con la esterilización firmada.
8. **Beat del ciudadano anónimo**: escanear el QR de Pampa con el celular — sin
   login, la credencial pública en 15 segundos. "La mascota ES la credencial."

### Acto 5b — La muerte en observación (el beat de fiscalización)
9. Perfil 4, con la mascota EN OBSERVACIÓN: registrar fallecimiento → elegir
   **"Entierro en domicilio"** → el sistema advierte específicamente (aviso
   rabia-consciente, slice S1) → confirma igual — **a pesar del aviso**.
10. La cascada automática: observación "**Cerrada por fallecimiento**", caso de
    mordedura cerrado, **notificación URGENTE** a la autoridad de la jurisdicción
    — nombrando la disposición (S2).
11. Perfil 1/2: `/admin/observaciones` muestra la fila con el chip de disposición
    no recomendada (S3); `/gob/mortalidad` da el contexto de trazabilidad con el
    entierro domiciliario ahora separado del cementerio autorizado (S4).

    **Fallback si el slice no llegó al deploy**: mismo flujo en vivo, y la
    narración honesta — "el sistema registra, cierra y notifica urgente; lo que
    todavía no hace es decirle al Estado CÓMO se dispuso el cuerpo: ese gap lo
    estamos cerrando esta semana".

### Acto 6 — Admin cierra el ciclo (perfil 1)
12. **V3** segunda pasada (vía Portales): la campaña **existe** — inscripción,
    asistencia, impacto sanitario: 1 esterilización. Movimiento generado frente a
    la audiencia (superficie 100% en vivo, sin cubo).
13. **V4**: bivariado nacional (cobertura × zoonosis, grano provincia) → drill
    Salta → **timeline 6→18 de junio**: play — el cluster de rabia formándose día
    a día (6 mascotas, 2 muertas), con la base temporal declarada y el sello
    "Actualizando al…". Puente: "así se ve una crisis formándose; así se ve la
    respuesta del Estado".
14. **V5**: mortalidad como estado de situación — stock, disposición,
    trazabilidad. Narrar como foto actual; NO tocar el scrubber acá (la capa no
    es temporal y el vacío honesto del scrubber lo dice).
15. **V1**: **Resolver** la alerta con nota: "Operativo de esterilización en
    marcha en Palermo — Refugio Test". Círculo completo.

## Plan B por acto

| Beat en vivo | Fallback |
|---|---|
| Wizard de oferta (3) | La campaña de rabia sembrada (`DEMO-SVO-CABA-RABIES`) ya visible en V3 |
| Reserva (4) | Turnos ya confirmados de esa campaña (2 asistidos) |
| Firma del vet (5) | Libreta de Pampa: antirrábica ya firmada por matriculado |
| Muerte en observación (5b) | Caso sembrado (S5, si T7.5 se aplicó) o narración honesta |
| Scrub de Salta (13) | Capturas del dry-run |

## Reglas de honestidad del guion

- Solo superficies EN VIVO para los beats de movimiento: V1 (alert_firings), V3
  (appointments/service_offerings), credencial/libreta (proyección pura). El
  Panorama corre sobre cubo nocturno, pero **el scrub con asOf recomputa en vivo**
  — por eso V4 funciona siempre.
- Bivariado SOLO a grano provincia (a departamento, k<5 suprime casi todo — el
  refus honesto del producto lo diría en pantalla).
- `sintomas` (ventana 30d) no se usa: el cluster de Salta está a 43-57 días —
  V4 usa `brotes-activos` (90d).
- No prometer: ficha de origen/citas/marcas si el deploy no las tiene; ni scrub
  en mortalidad; ni "crear campaña" como botón (no existe — y la versión real es
  mejor historia).

## Post-demo

Dry-run obligatorio antes (browser, cronometrado, capturas de: alerta, aviso de
entierro ignorado, notificación urgente, campaña formándose, libreta firmada,
cluster de Salta). Lo que no funcione como está escrito acá, se corrige acá.
