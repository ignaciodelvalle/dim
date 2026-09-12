# 15 — Runbook de la demo en vivo

> Snapshot: `4459e670d` (`main`) · Verificado contra el código el **2026-09-11**.
> Status: draft — **tiene cuatro cosas sin confirmar, y están marcadas 🔴 abajo.
> Ninguna se puede resolver desde el repositorio: hay que abrir el sitio y probar.**
>
> Este archivo existe porque `00-guion.md` (nota de alcance, "Dos notas de alcance")
> manda mostrar la **Lámina 16 en vivo, inmediatamente después de la Lámina 5**, y
> no había ningún lugar que dijera cómo. Está escrito para leerse **parado, con
> gente mirando**. Cada bloque tiene su plan B.

---

## Regla de oro

**Nada se muestra en vivo si no lo abriste vos, en esa misma computadora, el mismo
día.** No hay ambiente de producción: hay uno solo y es el de ensayo
(`docs/presentation/2026-09-oficiales/11-despliegue-runtime.md`). Si algo no anda,
**no lo arregles en la sala**: pasá al plan B y seguí hablando. La lámina 11 y la 15
existen justamente para que un tropiezo no sea una mentira.

---

## 1. Antes de que empiece la reunión

Hacé esto **la noche anterior y otra vez 30 minutos antes**. Son diez minutos.

### 1.1 Abrí estas pestañas, en este orden

| # | Pestaña | Dirección |
|---|---------|-----------|
| 1 | Credencial pública de Pampa | `https://dim-staging.vercel.app/p/DIM-PAMP-0001` |
| 2 | Ingreso | `https://dim-staging.vercel.app/login` |
| 3 | Portal de la autoridad local | `https://dim-staging.vercel.app/gob` |
| 4 | Vigilancia epidemiológica | `https://dim-staging.vercel.app/gob/vigilancia` |
| 5 | Bandeja de salida, vista ENO | `https://dim-staging.vercel.app/gob/outbox?preset=eno` |

- La dirección estable es `https://dim-staging.vercel.app`. **Nunca** uses una
  dirección con un código raro en el medio (`dim-staging-a1b2c3-…`): esas cambian en
  cada publicación y se rompen solas.
- Iniciá sesión **una sola vez** en la pestaña 2 y después navegá; no cierres el
  navegador entre el ensayo y la reunión.
- Dejá también abierto este archivo en el teléfono. Los planes B están acá.

### 1.2 Las tres cosas que tenés que ver con tus ojos

1. **La credencial de Pampa carga y el QR se ve.** Escaneala con el teléfono: si
   la cámara no abre nada, el QR está roto (ver §4.1). Es el chequeo que ya está
   escrito en `docs/outreach/correo-funcionario.md`: *"Verificá que el QR y los datos
   estén vivos: abrí `https://dim-staging.vercel.app/p/DIM-PAMP-0001` (la mascota
   insignia, Pampa) antes de enviar."*
2. **Entrás con la cuenta de gobierno y ves un territorio con datos.** Si `/gob`
   aparece vacío, no es un error de la aplicación: es la jurisdicción asignada a esa
   cuenta (ver 🔴 A).
3. **`/gob/outbox?preset=eno` muestra al menos una fila.** Si está vacía no hay nada
   que mostrar en el bloque D y hay que ir al plan B.

### 1.3 Sacá capturas de pantalla de las cinco pestañas

**Esto no es opcional.** Es el plan B universal: si se cae internet o se cae el sitio,
mostrás las capturas y decís la verdad — *"esto es una captura, el ambiente de ensayo
no responde ahora"*. Es infinitamente mejor que una pantalla en blanco, y es
coherente con las dos láminas de honestidad.

---

## 2. Las cuentas

Todas comparten la contraseña **`Test1234!`**, escrita como constante
`SHARED_PASSWORD` en `scripts/seed-test-users.ts:161`, y el script la vuelve a
imponer en cada corrida (`setPassword`, línea 715: *"Always re-assert the shared
password so seed re-runs leave a known login"*). Es una contraseña de datos
sintéticos; no hay nada real detrás.

| Cuenta | Rol | Para qué la usás en la demo | Fuente |
|---|---|---|---|
| `govt@dim.test` | autoridad local | Bloques C y D — `/gob` | `scripts/seed-test-users.ts:22` |
| `owner@dim.test` | titular | Bloque B — la mascota desde el lado del dueño | `scripts/seed-test-users.ts:19` |
| `admin@dim.test` | administración nacional | Solo si te preguntan por el carril nacional | `scripts/seed-test-users.ts:18` |
| `govt-local@dim.test` | autoridad local (La Plata + CABA/Palermo) | **Reemplazo de `govt@dim.test`** si esa está vacía | `scripts/seed-test-users.ts:23` |
| `nacional@dim.test` | nacional, solo lectura | Si preguntan "¿y Nación qué ve?" | `scripts/seed-test-users.ts:24` |

> 🔴 **A — SIN CONFIRMAR, y es lo primero que tenés que probar.** Hay dos fuentes que
> dicen **cosas distintas** sobre qué territorio ve `govt@dim.test`:
> - `scripts/seed-test-users.ts:22` dice **Ushuaia + El Calafate** (y lo marca como
>   "remote", es decir el ambiente de ensayo).
> - `docs/outreach/correo-funcionario.md` y `docs/demo/README.md:44` dicen **CABA**.
>
> No se puede decidir desde el repositorio cuál corrió último contra ensayo.
> **Entrá el lunes y fijate cuál es.** Si ves Ushuaia y querías CABA, usá
> `govt-local@dim.test`, que tiene **La Plata + CABA/Palermo**
> (`scripts/seed-test-users.ts:207, 218`). Es la misma demo con otro mapa.

---

## 3. El recorrido, bloque por bloque

Cada bloque: qué abrís, qué decís, y qué hacés si no anda.

---

### Bloque A — La credencial pública, escaneada

**Pestaña 1.** `https://dim-staging.vercel.app/p/DIM-PAMP-0001`

1. Mostrá la pantalla de Pampa (caniche blanca, barrio Belgrano, antirrábica firmada
   por veterinario matriculado).
2. **Sacá el teléfono y escaneá el QR de la pantalla delante de ellos.** Ese es el
   momento de la demo. Se abre la misma página en el teléfono, **sin iniciar sesión,
   sin instalar nada**.
3. La frase: *"esto es lo que ve un vecino que encuentra al animal en la calle. No
   ve al dueño: ve lo que necesita para devolverlo."*

**Si no anda:**
- **El QR no escanea** → es la falla conocida de `NEXT_PUBLIC_SITE_URL` (§4.1). **No
  intentes arreglarla.** Abrí la dirección a mano en el teléfono y decí *"hoy lo abro
  escribiendo la dirección"*. La demo sigue entera.
- **La página no carga** → **no tenés un segundo animal de repuesto que se pueda
  nombrar de memoria.** Pampa es la única mascota insignia con un código fijo; los
  demás animales sembrados reciben un código **generado al azar** en cada
  reconstrucción, así que ningún literal los nombra (`e2e/owner-ia-p6.spec.ts:403-405`:
  *"bootstrap generates it randomly, so no literal can name it"*). Plan B: capturas
  (§1.3).

---

### Bloque B — La ficha de cumplimiento, desde el teléfono

> 🔴 **B — SIN CONFIRMAR.** La aplicación de celular es **Android en prueba interna
> con un grupo de testers** (`00-guion.md`, nota de alcance del preámbulo, confirmada
> por el PO). La pantalla existe —`apps/mobile/src/credential/CredentialScreen.tsx`—
> pero **desde el repositorio no se puede saber si está instalada y con sesión activa
> en tu teléfono el martes**, y la versión publicada anterior **no puede iniciar
> sesión** porque se compiló sin sus variables (`docs/agents/open-work.md`, citado en
> `11-despliegue-runtime.md`). **Abrí la app el lunes, iniciá sesión con
> `owner@dim.test` y dejala abierta.** Si no arranca, no la muestres.

**Si la app anda:** abrí la credencial de Pampa en la app y mostrá dos cosas que la
web no muestra igual de bien:
- una sección que el servidor no pudo leer dice **"No disponible"**, no aparece vacía;
- **sin señal** se ve la última copia buena **con su antigüedad y diciendo que es una
  copia** (`CredentialScreen.tsx:1-23`). Poné el teléfono en modo avión y mostralo:
  es el argumento más fuerte de la demo ante un funcionario de campo.

**Plan B (bueno, no una excusa):** entrá por la web con `owner@dim.test` y mostrá la
misma mascota desde el lado del titular. Decí la verdad: *"la app de celular está en
prueba interna; esto es la misma información desde el navegador"*. La Lámina 15 ya
dice exactamente eso, así que no te contradice.

---

### Bloque C — `/gob`, acotado a una sola jurisdicción

**Pestañas 2 → 3.** Ingresá con `govt@dim.test` / `Test1234!` y andá a `/gob`.

1. Mostrá el panel. **El mensaje es el recorte, no el gráfico:** este funcionario ve
   su territorio y nada más.
2. Pasá a `/gob/panorama` — el mapa de cobertura de su jurisdicción.
3. Si preguntan "¿y quién ve todo el país?", ahí entra `nacional@dim.test`: rol
   nacional, **solo lectura** (`scripts/seed-test-users.ts:24`). No inventes más.

**Si no anda:**
- **`/gob` carga pero está vacío** → es la jurisdicción de la cuenta, no una falla.
  Cerrá sesión y entrá con `govt-local@dim.test` (La Plata + CABA/Palermo). Ese es el
  plan B de este bloque y es un cambio de cuenta, nada más.
- **El ingreso rebota o te devuelve al inicio** → la cuenta puede estar desactivada
  (§4.2). No se arregla desde el navegador. Pasá a capturas.
- **Panorama tarda muchísimo** → hay una patología conocida de más de 180 segundos
  cuando falta una variable de base de datos analítica en el despliegue
  (`docs/ops/2026-07-16-overnight-run-staging-handoff.md`, punto 2). **No esperes en
  vivo.** Mostrá la captura y seguí.

---

### Bloque D — La bandeja de salida ENO

**Pestañas 4 → 5.**

1. `https://dim-staging.vercel.app/gob/vigilancia` — el panel de vigilancia.
2. `https://dim-staging.vercel.app/gob/outbox?preset=eno` — la vista de cola ENO. El
   título cambia a **"Cola ENO — avisos legales pendientes"**
   (`app/gob/outbox/page.tsx:174`); es una pregunta distinta, no un filtro más.
3. **La frase honesta, y es la mejor parte:** el plazo legal por enfermedad, la
   jurisdicción del hecho y la ventana de observación **están en el código, no en un
   PDF** (`00-guion.md`, Lámina 16). Y la pantalla **avisa sola** que la notificación
   obligatoria a SNVS/SENASA/zoonosis **no sale automáticamente**
   (`app/gob/vigilancia/investigaciones/page.tsx:102-104`). **Leelo en voz alta desde
   la pantalla.** Que el propio sistema declare lo que no hace vale más que cualquier
   lámina.

**Si no anda:**
- **La bandeja aparece vacía** → no hay caso sembrado para mostrar. Plan B: quedate en
  `/gob/vigilancia` y explicá el ciclo con la Lámina 16 en el mazo. No inventes una
  fila.
- **`/gob/outbox` da error** → capturas, y la Lámina 16 del mazo cubre el contenido.

---

## 4. Qué hacer cuando algo se rompe

Solo están las fallas que **existen documentadas en este repositorio**. Cada una con
su arreglo de una línea. **Ninguna de estas se arregla en la sala** — son para la
noche anterior.

### 4.1 El QR no escanea

- **Qué pasa:** `NEXT_PUBLIC_SITE_URL` llega **vacío** al despliegue. Una variable
  vacía no es lo mismo que una sin definir: no rompe el arranque, y el QR termina
  codificando una dirección **relativa que ninguna cámara puede resolver**
  (`docs/ops/env-handling.md:163-167`).
- **Arreglo:** revisar esa variable en el proyecto **`dim-staging`** del proveedor
  (`vercel env ls`) y volver a publicar
  (`docs/ops/2026-07-16-overnight-run-staging-handoff.md`, punto 2).
- **En la sala:** escribí la dirección a mano en el teléfono. Nadie se da cuenta.

### 4.2 No podés entrar con `admin@dim.test` (o los permisos hacen cosas raras)

- **Qué pasa:** `__tests__/admin-institutional.test.ts` tiene un ayudante,
  `isolateActiveAdmins` (línea 860), que para probar el invariante del "último
  administrador" **desactiva a TODOS los administradores institucionales activos**
  salvo los que la prueba quiere conservar — y la cuenta sembrada `admin@dim.test` cae
  ahí adentro. La restauración vive en un bloque `finally` (por ejemplo, líneas
  838-840). **Un proceso que alguien mata no ejecuta su `finally`**: la cuenta queda
  desactivada en la base local, que sobrevive a la corrida. Después se ve como una
  política de seguridad rota —fallan los controles **positivos** de las pruebas de
  seguridad fila por fila, mientras los negativos pasan— y no es eso.
  **Ojo con confundirse:** las cuentas `*@dim-test.local` (con guion) son descartables
  de cada prueba y **se supone** que queden desactivadas. Solo importan las
  `*@dim.test`.
- **Diagnóstico (una consulta):**
  ```
  docker exec supabase_db_DIM psql -U postgres -d postgres -c \
    "select u.email, p.deactivated_at from auth.users u
     join public.profiles p on p.id=u.id where p.deactivated_at is not null;"
  ```
- **Arreglo (una línea, y NO un re-sembrado):**
  ```
  docker exec supabase_db_DIM psql -U postgres -d postgres -c \
    "update public.profiles p set deactivated_at = null from auth.users u
     where u.id = p.id and u.email = 'admin@dim.test';"
  ```
- **Alcance:** esto es de la base **local**. Si la demo va por `dim-staging`, no te
  toca — pero si el lunes armás el respaldo local (§5), sí.

### 4.3 La aplicación local sirve una versión vieja

- **Qué pasa:** una compilación que corre mientras el servidor está levantado deja al
  servidor sirviendo trozos que ya no existen. Se ve como una página rota sin ningún
  error claro.
- **Arreglo:** `pwsh scripts/qa-up.ps1` lo detecta y lo cura solo. El script compara
  la compilación del disco con la que el servidor está sirviendo y **reinicia el
  servidor** si no coinciden (`scripts/qa-up.ps1:49-74`). No alcanza con ver que el
  puerto 3000 responde: *"un servidor viejo devuelve 200 igual"* (línea 86).

### 4.4 La base local no levanta (todo da "conexión rechazada")

- **Qué pasa:** Windows tiene puertos excluidos y los contenedores figuran "sanos"
  igual. Parece que se rompió todo y no se rompió nada.
- **Arreglo:** revisar las exclusiones (`netsh int ipv4 show excludedportrange
  protocol=tcp`) y reiniciar el servicio de red de Windows con permisos de
  administrador. Es la falla registrada como *WinNAT excluded ports*.

### 4.5 La base local está vacía después de un `reset`

- **Qué pasa:** `pnpm db:reset` **vacía** la base y no reconstruye nada.
- **Arreglo:** `pnpm db:bootstrap`, y después los sembrados en orden: `pnpm
  seed:panorama` → `pnpm seed:test` → `pnpm seed:demo:scenario` → `pnpm demo:verify`
  (`docs/demo/README.md:11-35`). **`seed:panorama` va antes que los de demo.**

### 4.6 El ambiente de ensayo entero no responde

- No hay ambiente de respaldo: **hay uno solo**
  (`11-despliegue-runtime.md`, "No decir que hay ambiente de producción").
- **Plan B:** capturas (§1.3). **Plan C:** la demo local (§5), si tenés la notebook.

---

## 5. El respaldo local (solo si tenés la notebook y una hora libre el lunes)

Está escrito completo en `docs/demo/README.md` y es **local e idempotente** (los
sembrados se niegan a correr contra una base remota). Resumen:

```bash
supabase start                 # o: pnpm db:bootstrap
pnpm seed:panorama             # el universo nacional
pnpm seed:test                 # crea admin@dim.test y las demás
pnpm seed:demo:scenario        # el escenario focal
pnpm demo:verify               # imprime OK/FALTA por invariante; sale 0 si está listo
pwsh scripts/qa-up.ps1         # levanta el servidor en :3000 y prueba las rutas
```

`demo:verify` es el portón: **código 0 = listo, 1 = falta algo**
(`docs/demo/README.md:34-35`). `qa-up.ps1` además avisa si faltan cuentas sembradas y
te dice cuál correr (`scripts/qa-up.ps1:208`).

**Ojo:** la demo local corre en `http://localhost:3000`. Si la proyectás, la barra de
direcciones dice "localhost" y un funcionario atento lo va a leer. Decilo antes de que
lo pregunte: *"esto es mi máquina, no el servidor"*.

---

## 6. Lo que este runbook NO pudo confirmar

Se dice acá y no en una nota al pie, porque **adivinar en un runbook es peor que
admitir**.

| # | Sin confirmar | Cómo lo confirmás |
|---|---|---|
| 🔴 A | **Qué jurisdicción ve `govt@dim.test` hoy en ensayo.** El código dice Ushuaia + El Calafate; dos documentos dicen CABA. | Entrá a `/gob` con esa cuenta el lunes. Si no es la que querés, usá `govt-local@dim.test`. |
| 🔴 B | **Si la app de celular abre y tiene sesión en tu teléfono.** La pantalla existe; el estado del teléfono no se lee desde el repositorio, y una versión anterior publicada no podía iniciar sesión. | Abrila el lunes con `owner@dim.test`. Si no arranca, Bloque B va por la web. |
| 🔴 C | **Si `/gob/outbox?preset=eno` tiene alguna fila en ensayo.** No hay ningún sembrado que garantice un caso ENO vivo en la base remota. | Abrila el lunes. Si está vacía, el Bloque D se cuenta con la lámina. |
| 🔴 D | **Si la contraseña `Test1234!` sigue vigente en ensayo.** Es una constante del script de sembrado (`scripts/seed-test-users.ts:161`) y el script la vuelve a imponer en cada corrida, pero **nadie puede afirmar desde el repositorio cuándo corrió por última vez contra la base remota**. | Iniciá sesión el lunes. Si falla, hay que volver a correr el sembrado contra ensayo, y eso es trabajo de Ignacio, no de un agente. |

Hay además una cosa que **sí** se sabe y conviene tener en la cabeza: el trabajo
nocturno de pruebas de navegador está en rojo, y la causa medida es que **el refugio
sembrado se quedó sin ninguna custodia viva** (`.github/workflows/e2e-nightly.yml`,
commit `7bffa0453`). No afecta la demo — ninguno de los cuatro bloques pasa por el
refugio — pero si alguien pregunta por los controles automáticos, esa es la respuesta
verdadera, y está en la Lámina 13 y en `limites-honestos.md` §D.5.
