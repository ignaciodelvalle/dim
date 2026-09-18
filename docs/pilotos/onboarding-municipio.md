# Onboarding de un municipio piloto — runbook de nuestro lado

> Ambiente vigente: `www.mimar.com.ar` (Vercel `dim-staging`, Supabase `DIM-staging`),
> el único ambiente del piloto por decisión del PO (D3,
> `docs/handoff/rumbo-al-piloto.md` §1). No hay proyecto de producción todavía —
> no hay nada que aprovisionar. Este documento cubre solamente lo que hacemos
> **nosotros** para subir a un municipio; nada de lo que sigue requiere SQL a
> mano.
>
> Antes de prometer nada de este flujo frente a un funcionario, leé
> `docs/presentation/2026-09-oficiales/limites-honestos.md`. La última sección
> de este documento resume lo que NO hay que prometer.

---

## 0. Qué necesitamos del municipio antes de arrancar

No hacemos nada de lo que sigue sin esto (fuente:
`docs/presentation/2026-09-oficiales/14-lo-que-necesitamos.md` §3):

- **El correo institucional** de cada persona que va a operar (no un correo
  personal — es la cuenta que va a decidir cola, denuncias y reglas).
- **Las localidades que cubre** cada persona: provincia + localidad, o "toda
  la provincia" si corresponde (ej. CABA completa).

Sin esto el sistema de asignaciones (`govt_assignments`) no tiene a quién
asignar, y una notificación interna "se genera correctamente y no la lee
nadie" — es el punto que el propio documento de pedidos al Estado marca como
el más barato de resolver y el que más rápido cambia algo.

### 0.1 Antes de dar de alta a nadie: las cuentas demo que se superponen

El ambiente del piloto es el mismo donde viven las cuentas sembradas para las
demos, y su contraseña está en el repositorio público — no es secreta
(`docs/ops/cutover-debts.md`, ítem "Demo accounts must not exist in a real
environment"). Una cuenta demo con alcance sobre la jurisdicción del piloto ve
—y en algunos casos decide— sobre datos reales de vecinos del municipio.

Antes de crear la primera cuenta del municipio, **desactivá o cambiale la
contraseña** a cada cuenta sembrada cuyo alcance se superpone con la
jurisdicción del piloto:

- **Las de gobierno** (`govt`): `govt@dim.test` (Ushuaia, El Calafate),
  `govt-local@dim.test` (La Plata, CABA/Palermo), `lucas@dim.test` (CABA) y
  cualquier otra cuenta `govt` sembrada — revisá la lista en `/admin/govts`,
  no te quedes con esta. Desactivar desde `/admin/govts/[userId]` (§3) revoca
  además sus localidades.
- **`nacional@dim.test`** (`national`): lee todo el país, así que se
  superpone con **cualquier** piloto.
- **`admin@dim.test`**: superadmin, alcance total. No se desactiva (es la
  cuenta con la que se opera), pero su contraseña tiene que dejar de ser la
  publicada — cambiala desde el panel de Supabase.
- **`orgadmin@dim.test`** y **`owner@dim.test`**: si la organización o las
  mascotas sembradas caen dentro de la jurisdicción del piloto (la semilla usa
  La Plata y CABA/Palermo), cambiales la contraseña o desactivalas.

Nunca anotes la contraseña nueva en un documento del repo, ni en este ni en
otro: va al gestor de contraseñas. Dejá constancia en `cutover-debts.md` de
qué cuentas se cerraron y cuándo, sin contraseñas.

---

## 1. Crear las cuentas — `/admin/govts/new`

Solo un **admin** llega a esta pantalla
(`app/admin/govts/new/page.tsx` — `requireAdminOrRedirect`).

El formulario (`app/admin/govts/new/CreateGovtForm.tsx`) crea dos tipos de
cuenta:

| Tipo | Para quién | Localidades | Qué puede hacer |
|---|---|---|---|
| **Funcionario municipal** (`govt`) | La persona que opera el municipio | Se cargan en el alta (opcional, se pueden sumar después desde la página del operador) | Cola de aprobaciones, denuncias, decomisos, reglas de su jurisdicción — solo dentro de las localidades asignadas |
| **Observador nacional** (`national`, solo lectura) | Un rol de alcance país, sin escritura | Ninguna — no lleva localidades, lee todo el país por rol | Nada de lo anterior: no aprueba, no denuncia, no decomisa, no cambia reglas |

El email se pide **dos veces** (verificación de tipeo, revisión de
seguridad T1-P3) porque el link de acceso se manda a esa dirección
exactamente como se escribió.

Al crear la cuenta:

1. Se genera el usuario en Supabase Auth **sin contraseña**, marcado
   "primer acceso pendiente"
   (`src/modules/organizations/application/admin-institutional/create-institutional-account.ts`).
2. Se le manda un mail con un link de acceso de un solo uso.
3. La pantalla muestra el mismo link detrás de un botón "Revelar" — es el
   respaldo si el mail no llega (ver §2).

## 2. Cómo llega el acceso — primer login y contraseña

La persona recibe el mail, entra por el link, y cae en `/primer-acceso`
(`app/(auth)/primer-acceso`) donde elige su contraseña. No existe una
contraseña previa que nosotros conozcamos ni que haya que comunicar por
teléfono.

**Si el mail no llega** (bandeja de spam, filtro institucional, dirección
mal tipeada — pasa): la pantalla de creación de cuenta (o de reseteo, ver
más abajo) deja el mismo link disponible con un botón "Revelar" y "Copiar"
(`app/admin/_components/MagicLinkResultPanel.tsx`). Lo copiás y se lo
mandás vos por el canal que tengas con esa persona — WhatsApp, un mail
personal, lo que sea. El link es de un solo uso y expira (el panel muestra
el tiempo restante).

La pantalla te dice explícitamente cuál de los dos caminos pasó: "Le
enviamos un mail…" o "No pudimos enviar el mail… compartile el link de
abajo a mano" (`inviteMailNotice` en el mismo archivo).

## 3. Si algo sale mal — reset y desactivación

Desde `/admin/govts/[userId]` (la página de detalle del operador):

- **Resetear credenciales** (`ResetCredentialsButton`,
  `src/modules/organizations/application/admin-institutional/reset-institutional-credentials.ts`):
  invalida el link anterior, cierra TODAS las sesiones abiertas de esa
  cuenta y genera un link nuevo. Si por algún motivo no se pueden cerrar las
  sesiones abiertas, el sistema **desactiva la cuenta en vez de dejarla con
  sesiones vivas y sin link nuevo** — nunca deja un estado ambiguo.
- **Desactivar** (`DeactivateGovtForm`,
  `deactivate-govt.ts`): revoca las localidades asignadas, marca la cuenta
  inactiva y deja auditoría. Pide un motivo y, si corresponde, adjuntos.

Ambas acciones son admin-only.

### 3.1 Verificación en dos pasos (TOTP) — obligatoria para cuentas institucionales

Toda cuenta institucional (`govt`, `national`, `admin`) pide, además de la
contraseña, un código de 6 números de una app de autenticación (Google
Authenticator, Microsoft Authenticator, 1Password…). Lo exige el servidor en
cada portal y en cada acción (`requireLiveUser`, `src/modules/auth/domain/mfa-policy.ts`),
leyendo el nivel de la sesión del token que GoTrue firmó — no algo que diga el
navegador.

- **Primer ingreso.** Después de elegir la contraseña en `/primer-acceso`, la
  persona cae en `/mfa/configurar`: escanea el QR (o carga la clave a mano),
  escribe el primer código y entra. Avisale antes de la reunión que va a
  necesitar el teléfono con una de esas apps instalada. Queda en el audit log
  como `mfa_factor_enrolled`.
- **Cada ingreso siguiente.** Contraseña y después `/mfa` con el código de la
  app. Sin el código no llega a ninguna pantalla de `/gob` ni `/admin`.
- **Perdió el teléfono o borró la app — no hay códigos de recuperación.**
  Supabase no los ofrece y no los construimos. La salida es asistida: otra
  persona admin, desde `/admin/govts/[userId]` (o `/admin/admins/[userId]`),
  usa **Restablecer segundo factor** (`ResetMfaButton`,
  `reset-mfa-factors.ts`). Pide motivo, borra todos los factores de la cuenta
  y queda en el audit log como `mfa_factors_reset_by_admin` con los ids
  borrados. En su próximo ingreso, con su contraseña, la persona configura una
  app nueva. **Antes de apretar el botón, confirmá la identidad por otro
  canal** (llamada al teléfono institucional, no un mail): es exactamente cómo
  se desarma el control para una cuenta. Un admin no puede restablecer su
  propio factor; si el único admin pierde el teléfono, hace falta otra cuenta
  admin — tené siempre dos.
- **La app móvil no sirve para cuentas institucionales.** Las rutas `/api/v1`
  aplican la misma regla y la app no tiene el paso del código, así que una
  cuenta institucional queda afuera con "sesión expirada". Es a propósito: los
  portales de operador son web.

Qué tiene que tener encendido el proyecto de Supabase (lo toca el PO, ver
`docs/handoff/rumbo-al-piloto.md` §7): **Authentication → Multi-Factor →
TOTP** habilitado para enrolar y verificar (viene encendido por defecto en
proyectos hospedados; confirmalo), y **Secure password change** encendido.

## 4. Aprobar veterinarios y organizaciones — `/gob/cola`

Una vez que la persona entró, puede operar la cola de aprobaciones de su
jurisdicción desde `/gob/cola`.

El alcance de qué ve y qué puede decidir está en
`lib/infra/approval-scope.ts`:

- `admin` ve y decide **todo**, sin restricción de alcance (es el
  fallback universal — nada queda huérfano si una localidad todavía no
  tiene funcionario cargado).
- `govt` ve y decide solo `role_upgrade_vet` (habilitación de veterinario)
  y `organization_verification` (habilitación de organización), y solo
  dentro de las localidades que tiene asignadas. Una asignación de
  provincia completa (ej. CABA entera) cubre automáticamente cada barrio
  de esa provincia.
- `national` **lee** la cola completa del país (alcance geográfico
  universal por rol) pero **no puede decidir nada** — `canDecideRequest`
  lo rechaza por rol, no porque le falten asignaciones.

Si un municipio todavía no tiene funcionario cargado, sus solicitudes caen
igual en la cola de `admin` — no se pierden, las vemos nosotros hasta que
haya alguien asignado.

## 5. Cargar las reglas de la jurisdicción — `/gob/reglas`

**Las reglas las carga admin, no el gobierno.** `/gob/reglas` es de solo
lectura para un `govt`; los tres escritores (crear, actualizar, borrar
regla) exigen `requireAdminOrRedirect`
(`app/actions/business-rules.ts:106,147,182`). Si el municipio pide un
cambio de regla, lo hacemos nosotros desde el mismo panel — no hay
autoservicio de este lado todavía.

**Caveat de la cadencia antirrábica.** Cuando una dosis de vacuna
antirrábica no trae una fecha de vencimiento propia, el sistema la calcula
a partir de la cadencia (`frequency_months`) que la jurisdicción configuró
en su regla. Esa fecha es una **estimación administrativa, no un
vencimiento legal**: el propio código lo marca así —
`lib/projections/pet-compliance.ts` documenta que, por ejemplo, la cadencia
de 12 meses configurada para CABA no está anclada a ninguna norma citable,
sino que la ordenanza deja la cadencia a una determinación administrativa
periódica. Por eso una tarjeta calculada así nunca dice "Vencida", nunca
cuenta como "al día" y no lleva cita legal: dice **"Refuerzo sugerido"**.
No le prometas al funcionario que esa fecha es una obligación legal exacta
— es una sugerencia derivada de la cadencia que la propia jurisdicción
cargó.

## 6. Qué ve el municipio el día 1

- **Los datos sintéticos de la demo nacional no se le muestran.** El
  ambiente de ensayo también aloja el set sintético con el que hacemos
  demos (~41 mil mascotas marcadas `pets.seed_tag`, más los reportes de
  bienestar marcados `welfare_reports.seed_tag`). Todo lector de `/gob`
  (colas, KPIs, panorama, exportaciones, la bandeja de salida ENO) excluye
  esas filas cuando quien mira es `govt` o `national`
  (`lib/metrics/scope.ts`, comentario "PO D3, 2026-09-18 — pilot item
  T1-P1"). Solo `admin` sigue viendo los datos sintéticos, así las demos
  internas siguen funcionando.
- **La mascota insignia de la demo (Pampa, `DIM-PAMP-0001`) sí sigue
  visible para `admin`** — es la que usamos para mostrar el producto en
  vivo, no forma parte de lo que el municipio ve en su propio panel.
- Si una celda del panorama queda por debajo del umbral de anonimato
  después de sacar lo sintético, puede aparecer suprimida — es esperable,
  no un error.

## 7. Dónde piden ayuda

Todo panel operativo (`/gob`, `/org`, `/admin`) tiene un enlace
"¿Necesitás ayuda?" que apunta al mismo buzón operativo
(`OPERATOR_HELP_EMAIL` en `lib/ui/contact.ts`, hoy `hola@mimar.com.ar`
— el dominio real que el proyecto controla y recibe correo, verificado con
MX apuntando a Resend). Es el mismo canal que usan el banner de "crons
caídos" y `/sugerencias`.

Para pedidos de derechos Ley 25.326 (acceso, rectificación, supresión) el
canal es `privacidad@mimar.com.ar` (`CONTACT_EMAILS.privacy`, mismo
archivo).

## 8. Exportación SENASA

`/gob/senasa/export` ya tiene entrada de interfaz —
`app/gob/analytics/export/SenasaExportLink.tsx` llama a la ruta
(`app/gob/senasa/export/route.ts`). El formato hoy es un CSV propio
(**no** el formato de homologación real de SENASA, que todavía no
tenemos — ver `docs/presentation/2026-09-oficiales/14-lo-que-necesitamos.md`
§4): sirve para que el funcionario deje de re-tipear cada dosis a mano en
el formulario heredado, pero no reemplaza la integración homologada.
Cuando llegue la especificación real, el formateador se agrega al registro
y esta ruta no cambia.

---

## Checklist del día 1

- [ ] Correos institucionales y localidades recibidos del municipio (§0)
- [ ] Cuentas demo que se superponen con la jurisdicción desactivadas o con
      contraseña cambiada (§0.1), sin escribir ninguna contraseña en docs
- [ ] Cuenta(s) `govt` creada(s) desde `/admin/govts/new`, con sus
      localidades iniciales
- [ ] Si corresponde, la cuenta `national` de observador creada
- [ ] Confirmado que el mail de acceso salió, o el link copiado y enviado
      a mano
- [ ] La persona entró, fijó su contraseña en `/primer-acceso` y configuró
      la verificación en dos pasos en `/mfa/configurar` (§3.1)
- [ ] Reglas de la jurisdicción cargadas por nosotros en `/gob/reglas`
- [ ] Verificado en vivo: la cola (`/gob/cola`) muestra únicamente lo de
      su jurisdicción, sin filas sintéticas
- [ ] El funcionario sabe dónde pedir ayuda (§7) y qué canal usar para
      derechos de privacidad

## Qué NO prometer

Ver `docs/presentation/2026-09-oficiales/limites-honestos.md` completo
antes de cualquier reunión. Los puntos que más pegan en un onboarding:

- **No decir "integrado con Mi Argentina" ni "identidad verificada".** El
  DNI es autodeclarado; no hay verificación contra RENAPER (A.2, A.3 de
  `limites-honestos.md`).
- **No decir "notifica a SENASA/SNVS/zoonosis automáticamente".** La
  bandeja de salida existe y mide el plazo legal; el envío automático al
  organismo no está construido (A.4). El export de §8 de este documento es
  un CSV propio, no el formato homologado.
- **No decir que la cadencia de refuerzo antirrábico es un vencimiento
  legal** cuando viene de `dueSource: "rule"` — es una sugerencia
  administrativa (§5 de este documento).
- **No decir "todos los controles automáticos están en verde"** sin
  aclarar que la suite de navegador (Playwright) es una compuerta separada
  de `pnpm verify` y corre aparte (D.5 de `limites-honestos.md`).
- **No prometer moderación de denuncias del lado del municipio** más allá
  de lo que `/gob/cola` ya cubre (aprobación de vet y de organización).
