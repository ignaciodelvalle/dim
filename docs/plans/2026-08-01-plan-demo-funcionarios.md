# Plan — staging listo para demo con funcionarios

> Escrito 2026-07-31 tras descubrir que **staging nunca tuvo este código**.
> Reemplaza el orden de `PENDIENTES.md`, que priorizaba por gravedad técnica.
> Acá el criterio es otro: **qué ve un funcionario y qué le hace perder la confianza.**

## El hallazgo que reordenó todo

`dim-staging.vercel.app` sirve el commit `aa668d54`, del **18 de julio** —
611 commits atrás. La rama de trabajo no es la rama de producción del proyecto,
así que cada push generó un *preview*; y cada "Redeploy" manual volvió a
desplegar ese mismo commit viejo. Los previews, además, **no tienen ninguna
variable de entorno** y devuelven 500 en el middleware.

Consecuencia: ni las dos vulnerabilidades cerradas hoy, ni las ocho barreras de
accesibilidad, ni los seis flujos rotos de RA-2 estuvieron nunca en la URL que
vería un funcionario.

**Y hay un desajuste activo**: staging corre código del 18 de julio contra un
esquema al que hoy se le aplicaron 8 migraciones. Nadie probó esa combinación.

## Decisiones del PO que gobiernan este plan

1. **Recorrido de la demo**: las cuatro superficies — consola `/gob`, recorrido
   del ciudadano, operador (refugio/veterinaria), y denuncia de maltrato punta a
   punta — **más panorama y todas las pantallas de admin y govt en detalle
   exhaustivo**. Son **95 rutas** entre `/gob` (51) y `/admin` (44).
2. **Honestidad sobre suavidad**: donde no se midió, la pantalla lo dice. Un
   verde automático que un funcionario destape se lleva puesta la confianza en
   todo el tablero, no solo en ese indicador.
3. **Tipografía**: se cargan los pesos que faltan. La credencial insignia se ve
   como fue diseñada; el costo en kB se mide y se reporta.
4. **Secuencia**: subir apenas esté lo crítico y seguir iterando contra un
   staging que funciona. No una sola subida al final.

---

## Fase 0 — Que staging sirva este código (BLOQUEA TODO)

Sin esto no se puede revisar ninguna pantalla: estaríamos auditando código de
hace dos semanas.

- **PO**: cambiar Production Branch a `integration/all-20260703` en Vercel.
- **Agente**: pushear para disparar el primer deploy de producción real.
- **Verificación, contra el entorno y no contra la salida del comando**:
  `/api/health` en 200 con `db.ok: true`; el commit servido == HEAD; y el
  **chequeo de chunks** — bajar `/`, extraer cada `/_next/static/chunks/*.js`,
  pedirlos todos. Un solo 400 invalida cualquier revisión posterior, porque un
  servidor sin hidratar imita perfectamente un defecto de producto.

**Riesgo declarado**: el salto son 611 commits de una vez. `pnpm verify` y la
suite completa están verdes (1106 archivos, 13.194 tests), pero ningún test
cubre "código de hoy contra los datos reales de staging". Por eso la Fase 1
empieza con un humo manual sobre las rutas críticas antes de tocar nada.

---

## Fase 1 — Lo que miente en pantalla

El riesgo más caro de esta demo no es que algo se rompa: es que algo **afirme
un número que no puede sostener** frente a gente que lee estadística en serio.

| Unidad | Qué |
|---|---|
| **A1** | `/gob` dice "las métricas con meta están dentro de rango" **cuando no se midió nada**. Pasa a decir la verdad. Decisión del PO tomada. |
| **A2** | El panorama se cuenta distinto a sí mismo: dice "se midieron 10 jurisdicciones" cuando midió 24 (RA-7 F5); da **cuatro respuestas distintas** a "cuántas celdas están protegidas", todas pudiendo estar en pantalla a la vez (F6); un sello de cubo en una capa se traga el aviso de tope de todas las otras (F7); dos claves de leyenda describen estados que el frame puede no contener y el estado "falta un eje" se pinta pero nunca se declara (F9/F10). |
| **A3** | `RA-7 F4`: un cambio de nivel fallido vacía el canvas, pone los contadores en cero y **no marca `degraded`** → la pantalla dice "sin datos" donde su propio docblock **prohíbe** ese texto. Un funcionario lee "no hay casos", no "no pudimos calcular". |
| **A4** | `RA-1 C3`: el triage de maltrato perdió la edad de una denuncia no vencida — una de hoy y una de hace 13 días se ven idénticas. En una cola que se prioriza por urgencia, eso es el producto fallando en su tarea. |

**Punto de subida 1** al cerrar A1-A4.

---

## Fase 2 — Lo que rompe o mete al usuario en un callejón

| Unidad | Qué |
|---|---|
| **B1** | `RA-2 F9`: una capacidad `org.transfer.propose` concedida es **inerte** — la página chequea rol de membresía, nunca capacidades, y el mensaje "Solo roles admin o coordinator" es **falso**. Si en la demo alguien pregunta "¿y si le doy este permiso?", la respuesta actual es que no pasa nada. |
| **B2** | `RA-2 F10`: "Enviar documentación" apunta a una página sin nada que enviar, y el ítem **nunca puede completarse desde adentro de la organización**. Un checklist de onboarding con un paso imposible. |
| **B3** | `RA-2 F4`: firmar un chip distinto al canónico deja el canónico intacto **en silencio**. La espina guarda uno, la ficha muestra otro. |
| **B4** | Dos 500 crudos: `?chip=a&chip=b` revienta en `.trim()`, y `jurisdictionProvince` sin `z.enum` larga un error de Postgres a la cara del usuario. |
| **B5** | `RA-2 F5`: el `redirect()` adentro de la acción que el resto ya migró. |

**Punto de subida 2** al cerrar B1-B5.

---

## Fase 3 — El barrido exhaustivo: 95 pantallas

Lo que el PO pidió textualmente. No es "mirar que carguen": es un contrato por
pantalla, y se paraleliza por grupo de rutas.

**Qué se verifica en cada una:**

1. **Renderiza** sin 500 y sin caer al error boundary.
2. **No afirma nada falso** — ningún conteo, veredicto ni etiqueta que el dato
   no sostenga. Especial atención a verdes automáticos y a totales.
3. **El estado vacío es honesto**: distingue "no hay nada" de "no pudimos
   calcular" de "hay pero está suprimido por k-anonimato". Los tres se ven igual
   hoy en varias pantallas y significan cosas distintas.
4. **No hay callejones**: cada CTA lleva a algo que existe y que el rol actual
   puede efectivamente hacer.
5. **Sirve a 390px** — los funcionarios van a abrir esto en el teléfono.
6. **El rol correcto ve lo correcto**: un operador de Ushuaia no ve datos de
   CABA; un `govt` no ve controles que solo un `admin` puede ejecutar.

**Cómo se ejecuta**: agentes en paralelo, ~12 rutas cada uno, cada uno con
navegador contra staging ya verificado. **Antes de creerle a cualquier hallazgo
de navegador, el chequeo de chunks** — dos specs independientes fallando igual
ya nos hizo casi reportar dos defectos graves que no existían.

Cada hallazgo entra clasificado: **rompe la demo** / **la debilita** / **anotar**.

**Punto de subida 3** al cerrar los "rompe la demo" del barrido.

---

## Fase 4 — Estética

| Unidad | Qué |
|---|---|
| **C1** | Cargar los pesos tipográficos faltantes (decisión del PO). **21 declaraciones inertes** en JSX y **4 en CSS**: se pide `font-bold` y el navegador rinde 600; se pide `font-medium` y rinde **400**. Medir y reportar el costo en kB. |
| **C2** | La **libreta de vacunas clipea a 390px** — falta `overflow-x-auto` en toda la cadena. Es la pantalla que más se va a mirar en un teléfono. |
| **C3** | Lo visible de RA-10: "Luna · Hembra · **PERDIDO**" en la home del dueño; la micro-tipografía de la credencial pública a 8px; el botón "Crear cuenta" como rectángulo de 8px a un click de píldoras. |
| **C4** | `CaseStatus.open` se dice de **cinco maneras** distintas y hay **22 diccionarios de estado** hechos a mano. Unificar donde se ve en el recorrido. |

---

## Fase 5 — Deuda interna (NO bloquea la demo)

No se ve en pantalla, pero es lo que evita que la próxima ola vuelva a
descubrir lo mismo.

- **El chequeo que compare el ledger de migraciones contra la base.** El ledger
  decía 156 aplicadas y salud perfecta con 27 tablas sin RLS. Es el mismo patrón
  del día entero: un registro que dice "hecho" no es evidencia de que esté hecho.
- **El fence de autorización probado contra el bug real**: marcar toda acción
  cuyo cuerpo mezcle un guard que ata recurso con uno solo de identidad. Da 3
  candidatos hoy y **dispara sobre el código pre-arreglo del oráculo**.
- Las 18 lecturas de `petIdentifications.code` sin auditar.
- Los cinco puntos ciegos estructurales de RA-8.
- E2E: 33 ubicaciones rojas, 30 anteriores a esta ola. **Mientras siga así, "CI
  verde" significa "CI menos e2e"** y hay que decirlo en voz alta.
- Los tests que no guardan nada (RA-4 F5-F9, RA-9 EI-4/5/6, RA-7 F8, P2.8).

---

## Reglas de ejecución

- **Verificar contra el entorno, no contra la salida del comando.** Hoy el
  ledger de migraciones, un job de CI terminando a los 19:59 de 20, y un fence
  contando comentarios dijeron todos que estaba todo bien.
- **Después de cualquier build, los servidores de QA quedan muertos** aunque
  respondan 200. Reiniciar es obligatorio.
- **Un mutante que sobrevive es información**, no una falla del proceso. Dos
  veces hoy destapó algo real. Y confirmar con `rg` que la mutación **aterrizó**
  antes de anotar un sobreviviente — tres mutaciones mías no aterrizaron y casi
  acuso a un fence que funcionaba.
- **Buscar tests que afirmen el defecto.** Cada arreglo de hoy puso rojo algo
  que pasaba; en un caso eran cuatro.
- Pathspec explícito en `git add` y `git commit`. Nunca `git checkout --` para
  revertir; `cp` para backup.
