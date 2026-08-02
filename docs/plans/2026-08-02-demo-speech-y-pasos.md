# Demo con funcionarios — speech + pasos (qué decir y qué tocar)

> Runbook hablado para la live demo. Cada acto trae **PASOS** (qué tocás) y **SPEECH**
> (qué decís, en voz alta). Apoyado en el guion técnico
> [`2026-08-02-guion-demo-ciclo-completo.md`](./2026-08-02-guion-demo-ciclo-completo.md)
> y **validado en vivo contra staging `ba87f22` el 2026-08-02** (clickthrough real,
> 5 perfiles). Las notas ⚠️ son lo que la validación destapó — leelas antes.
>
> Duración objetivo: 15-18 min. Arco: Admin detecta → todos los roles actúan → Admin cierra.

---

## Antes de empezar (Acto 0 — checklist de 5 minutos)

- [ ] **Pre-calentá el Panorama.** ⚠️ La PRIMera carga de cada vista de Panorama puede
      mostrar *"No pudimos cargar los indicadores"* (presupuesto de DB del free-tier de
      staging). En la recarga carga perfecto. **Abrí V2, V4 y V5 una vez cada una** un
      rato antes — quedan calientes y no fallan en vivo.
- [ ] **Reseteá la alerta de V1 a `disparada`.** ⚠️ Hoy figura en estado *"Reconocida"*
      y jurisdicción *"CABA"* (toda la ciudad). Si querés mostrar el beat en vivo de
      "Reconocer → la fila cambia", volvela a `disparada`. Si no, arrancás desde
      "Reconocida" y funciona igual (solo perdés esa micro-transición).
- [ ] **5 perfiles pre-logueados** en 5 pestañas/navegadores separados (NO loguearse en
      vivo — rate limit 5/min por email). Reparto abajo.
- [ ] **Beat 5b (muerte en observación):** ⚠️ hoy `owner@` **no tiene** ninguna mascota
      en observación antirrábica en staging. Sin el re-seed, este beat va por el
      **fallback de narración honesta** (ver Acto 5b). El aviso de entierro genérico SÍ
      funciona; el aviso rabia-específico necesita la mascota en observación.
- [ ] **Celular con cámara** a mano para el QR de Pampa (`DIM-PAMP-0001`).
- [ ] Validá la versión desplegada: en el HTML, `<meta name="mimar-version">` debe decir
      el commit vigente.

### Reparto (todos `Test1234!`)

| Perfil | Cuenta | Rol |
|---|---|---|
| 1 | `admin@dim.test` | Detecta y cierra |
| 2 | `govt-local@dim.test` | Autoridad CABA/Palermo — coordina |
| 3 | `orgadmin@dim.test` | Refugio Test — publica el operativo |
| 4 | `owner@dim.test` | El vecino / dueño |
| 5 | `vet@dim.test` | Matriculado — atiende y firma |

---

## Apertura (30 segundos, antes del Acto 1)

> **SPEECH:** "Lo que les voy a mostrar no es una maqueta. Es el sistema corriendo, con
> datos sintéticos pero con la lógica real. Van a ver un problema sanitario aparecer solo,
> al Estado coordinar una respuesta, a cada actor —municipio, refugio, veterinario,
> vecino— hacer su parte, y a esa acción volver al tablero. Un ciclo completo. Arranco y
> termino en el mismo lugar: la mesa del que decide."

---

## Acto 1 — El Estado detecta (perfil 1: admin)

### V1 · `/admin/alertas`
**PASOS:** entrás a `/admin/alertas` → señalás la fila *"Cobertura de esterilización ·
CABA · observado 38 · meta 70"*, con SLA vencido.

> **SPEECH:** "El sistema vigila umbrales solo. Esta alerta saltó sola: la cobertura de
> esterilización en la Ciudad está en 38, la meta es 70, y ya lleva días sin atenderse —
> el SLA en rojo no es decorativo, es grado sanitario. Nadie tuvo que ir a buscar el
> número: el número vino a buscar al funcionario."

**PASOS:** (si reseteaste a `disparada`) → **Reconocer** → la fila cambia de estado en
vivo → **Registrar seguimiento**.

> **SPEECH:** "Lo reconozco, queda registrado quién y cuándo. Ahora quiero entender el
> problema antes de mover a nadie."

### V2 · `/admin/panorama?preset=control-poblacional`
**PASOS:** entrás → coroplético nacional de esterilización → mirás el inset de CABA →
abrís la pestaña **Registros** para el ranking de quién está más atrás.

> **SPEECH:** "Este es el mapa de cobertura de esterilización de todo el país. La Ciudad
> aparece pintada según su valor real —36,4%— y acá abajo tengo el ranking: quién está
> peor, ordenado. Esto es lo que convierte un número en una decisión: no digo 'hay que
> esterilizar más', digo 'hay que esterilizar ACÁ'."

**PASOS:** volvés a V1 → **Contactar autoridad**.

> **SPEECH:** "Lo derivo a la autoridad de la jurisdicción. El municipio toma la posta."

---

## Acto 2 — El municipio coordina (perfil 2: govt-local)

### V3 · `/gob/operativos?vista=campanas`  →  pestaña **Alcance comunitario**
**PASOS:** entrás → primero mostrás que en Campañas **no hay** un operativo de
esterilización en Palermo (el hueco) → mencionás `/gob/outreach` como el mecanismo de
convocatoria.

> **SPEECH:** "Soy el municipio. Miro mis operativos y confirmo lo que el tablero ya me
> gritaba: no tengo NINGUNA campaña de esterilización activa en Palermo. Ese es el hueco.
> Desde acá convoco a las organizaciones de mi jurisdicción para que lo cubran. Llamo al
> refugio."

---

## Acto 3 — El refugio publica el operativo (perfil 3: orgadmin)

### `/org/{token}/servicios/nuevo`
**PASOS:** entrás al wizard → **Paso 1** Tipo: Esterilización + nombre → **Paso 2**
capacidad/elegibilidad + localidad Palermo → **Paso 3** regla de agenda → materializás
los turnos.

> **SPEECH:** "Soy el refugio, verificado por el Estado. En tres pasos armo el servicio:
> qué es, para quién, dónde —Palermo—, y con qué agenda. Le doy 'materializar' y los
> turnos existen. No mandé un mail ni llené un Excel: publiqué oferta real, reservable."

> ⚠️ **NOTA (validado):** el wizard avisa *"la autoridad competente lo revisa y aprueba
> antes de que puedas armar la agenda"*. Hay un **gate de aprobación** entre crear y
> reservar. Para el vivo: o el perfil admin/govt aprueba la oferta en el acto, o usás el
> **fallback** (la campaña ya sembrada `DEMO-SVO-CABA-RABIES`, visible y aprobada). Si vas
> por el vivo, tené el perfil 1 listo para aprobar.

---

## Acto 4 — El vecino reserva (perfil 4: owner)

### `/turnos/buscar`
**PASOS:** entrás → elegís **Castración perro macho** → localidad **Palermo, CABA** →
Buscar → aparece la oferta recién publicada → reservás → confirmación.

> **SPEECH:** "Ahora soy el vecino. Busco un turno de castración cerca. Elijo el servicio,
> pongo Palermo… y ahí está: la oferta que el refugio publicó hace un minuto, con turnos
> libres. Reservo. Del problema en el tablero al turno en mi teléfono, sin que nadie
> levantara un teléfono."

> ⚠️ **NOTA (validado):** la búsqueda funciona y el estado vacío es honesto —*"Sin
> servicios disponibles en {localidad}. Probá otra localidad."*. Si la oferta del Acto 3
> no quedó aprobada, buscá la localidad de la campaña sembrada.

---

## Acto 5 — El veterinario atiende y firma (perfil 5: vet)

### Agenda de la org → el turno → formulario de esterilización
**PASOS:** entrás a la agenda → abrís el turno reservado → completás el formulario →
**firmás** el evento.

> **SPEECH:** "Soy el veterinario matriculado. Atiendo, y cuando registro la
> esterilización, la FIRMO con mi matrícula. Y acá está el corazón del sistema: no es lo
> mismo un hecho declarado por cualquiera que uno firmado por un profesional. El sistema
> distingue las dos cosas, siempre. La confianza no se asume: se acredita."

### La mascota refleja al instante
**PASOS:** abrís la libreta del dueño y la credencial pública `/p/{token}`.

> **SPEECH:** "Y miren: sin recargar nada, sin proceso nocturno, la libreta de la mascota
> y su credencial pública ya muestran la esterilización firmada. La proyección es
> instantánea porque el hecho ES el dato."

### Beat del ciudadano anónimo — QR de Pampa
**PASOS:** escaneás el QR de `DIM-PAMP-0001` con el celular, SIN login.

> **SPEECH:** "Y esto lo puede hacer cualquiera, sin cuenta, en la calle: escaneo el QR de
> la chapita y en 15 segundos veo la credencial pública. Porque la mascota ES la
> credencial."

---

## Acto 5b — La muerte en observación (el beat de fiscalización)

> ⚠️ **Estado validado:** el formulario de fallecimiento y el **aviso de entierro
> funcionan**. Al elegir "Sepultura por el propietario" aparece la recomendación sanitaria
> (profundidad, zoonosis, acuíferos, zona remota). PERO el aviso RABIA-específico y la
> cascada (cerrar observación + notificar autoridad) necesitan una mascota **en
> observación antirrábica**, y hoy `owner@` no tiene ninguna en staging. **Elegí una vía:**

**Vía A — con re-seed (ideal):** perfil 4, mascota en observación → registrar fallecimiento
→ **"Sepultura por el propietario"** → salta el aviso rabia-consciente → confirmás **a
pesar del aviso** → se dispara la cascada.

> **SPEECH (vía A):** "El dueño reporta que la mascota murió, y que la enterró en el
> fondo. El sistema le avisó, específicamente, que un animal en observación por rabia no
> se entierra así —y lo hizo igual. Miren lo que pasa: la observación se cierra como
> 'fallecimiento', el caso de mordedura se cierra, y sale una notificación URGENTE a la
> autoridad. El Estado se entera en el acto, no en tres semanas."

**Vía B — narración honesta (sin re-seed):** mostrás el formulario y el aviso genérico de
entierro en una mascota común, y contás el resto.

> **SPEECH (vía B):** "Cuando el dueño elige enterrarlo, el sistema le da la
> recomendación sanitaria —esto ya funciona, lo están viendo. Y cuando la mascota está en
> observación por rabia, ese aviso se vuelve específico y, al confirmar, dispara el cierre
> de la observación y una notificación urgente a la autoridad. Lo que todavía no hace es
> decirle al Estado CÓMO se dispuso el cuerpo con un endpoint automático: ese último tramo
> lo estamos cerrando —va a ser una API con el sistema de vigilancia, no un PDF."

### Verificación (perfil 1/2)
**PASOS:** `/admin/observaciones` → la fila con el chip de disposición no recomendada ·
`/gob/mortalidad` → el entierro domiciliario separado del cementerio autorizado.

> **SPEECH:** "Y desde la mesa del funcionario, esto queda trazado: la observación cerrada
> por fallecimiento, y en el mapa de mortalidad, el entierro domiciliario contado aparte
> del cementerio autorizado. Trazabilidad de disposición, no un número suelto."

---

## Acto 6 — El Estado cierra el ciclo (perfil 1: admin)

### V3 segunda pasada · `/gob/operativos?vista=campanas`
**PASOS:** volvés a Campañas → ahora la campaña **existe**, con inscripción, asistencia e
impacto: 1 esterilización.

> **SPEECH:** "Vuelvo al tablero de operativos. El hueco de hace diez minutos ahora es una
> campaña con movimiento real: una inscripción, una esterilización hecha. La acción que
> disparamos volvió al tablero, medida."

### V4 · `/admin/panorama?preset=brotes-activos&encoding=bivariate`
**PASOS:** bivariado nacional (cobertura × zoonosis, grano provincia) → drill Salta →
pestaña **Línea de tiempo** → **play** del 6 al 18 de junio.

> **SPEECH:** "Y este es el poder analítico. Cruzo cobertura antirrábica con señales de
> zoonosis. Fíjense que el sistema es honesto: donde el cruce identificaría poca gente, no
> lo muestra —protege la privacidad, lo dice en pantalla. Ahora Salta, y le doy play al
> tiempo: así se forma un cluster de rabia, día a día, del 6 al 18 de junio. Seis
> animales, dos muertos. Así se ve una crisis armándose; y hoy les mostré cómo se ve la
> respuesta del Estado."

### V5 · `/admin/panorama?preset=mortalidad`
**PASOS:** mortalidad como foto actual → **NO** toques el scrubber (la capa no es
temporal, y el vacío honesto lo dice).

> **SPEECH:** "Mortalidad como estado de situación: cuántos, y cómo se dispusieron los
> cuerpos. Es la foto de hoy, no una película —y el sistema lo aclara en vez de inventar
> una línea de tiempo que no tiene."

### V1 · cierre · `/admin/alertas`
**PASOS:** volvés a la alerta → **Resolver** con nota: *"Operativo de esterilización en
marcha en Palermo — Refugio Test."*

> **SPEECH:** "Y cierro donde empecé. Resuelvo la alerta con la nota de lo que hicimos.
> El círculo está completo: el sistema detectó, coordinó una respuesta entre cuatro
> actores distintos, y registró el resultado. Eso es un Estado que ve, decide y actúa —con
> la misma herramienta."

---

## Reglas de honestidad (para responder sin quedar mal)

- **Solo son "en vivo" de verdad:** V1 (alertas), V3 (campañas/turnos), y la
  credencial/libreta (proyección pura). El Panorama corre sobre un cubo nocturno, **pero
  el scrub con fecha recomputa en vivo** — por eso V4 siempre funciona.
- **El bivariado, a grano provincia.** A departamento, la privacidad (k<5) suprime casi
  todo, y el mapa lo dice.
- **Donde no se midió, la pantalla lo dice.** Un verde inventado que un funcionario
  destape se lleva puesta la confianza en TODO el tablero. Preferimos el hueco honesto.
- **Si preguntan por la notificación a la autoridad:** hoy queda como registro durable de
  transmisión pendiente; el envío automático va a ser una API con el sistema de
  vigilancia, no un PDF. Es una decisión, no una carencia.

## Plan B por acto (resumen)

| Beat | Fallback |
|---|---|
| Crear oferta (Act 3) | Campaña sembrada `DEMO-SVO-CABA-RABIES`, ya aprobada y visible |
| Reserva (Act 4) | Turnos ya confirmados de esa campaña |
| Firma del vet (Act 5) | Libreta de Pampa: antirrábica ya firmada por matriculado |
| Muerte en observación (5b) | Narración honesta (vía B arriba) |
| Scrub de Salta (V4) | Capturas del dry-run |
| KPIs de Panorama no cargan | Recargar la vista (free-tier: la 2ª carga anda) |
