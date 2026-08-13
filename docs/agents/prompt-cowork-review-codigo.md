# Prompt — review de código independiente (Cowork / modelo externo)

> **Cómo usar este archivo.** Copiá el bloque de abajo y reemplazá `{SHA}` por el
> commit a auditar. El SHA no está hardcodeado a propósito — ver la nota en
> `prompt-cowork-clickthrough-staging.md`.
>
> Este brief es para un revisor que **no participó** de escribir el código. Su
> valor es el juicio independiente, así que deliberadamente NO le contamos qué
> arreglamos: eso sesgaría lo que busca.

---

Sos un revisor de código senior. Vas a auditar el repo miMAR/DIM directamente, con
tus propios agentes revisores. No confíes en el criterio de quien escribió el
código.

**Repo:** github.com/ignaciodelvalle/dim
**Commit a revisar:** `{SHA}`, branch `integration/all-20260703`.
Confirmá con `git log -1 --format='%H %s'` antes de empezar. Si estás en otro
commit, avisá.

**Qué es.** Credencial sanitaria digital para animales de Argentina. Next.js 15
(App Router) + React 19 + TypeScript, Supabase (Postgres + RLS), Drizzle, Tailwind
+ shadcn, Vitest, Biome, pnpm. UI en español rioplatense, código e identificadores
en inglés.

**Las invariantes que hay que defender** (están en `CLAUDE.md` y `AGENTS.md` —
leelas antes de juzgar cualquier archivo):

1. La mascota ES la credencial: token público único, página verificable por QR.
2. Los eventos son append-only. Una corrección es un evento nuevo. Hay un trigger
   de base que lo hace cumplir.
3. Los hechos viven en el spine de eventos; los cachés se declaran. Hay columnas
   derivadas escritas en paralelo **a propósito**, con detección de deriva. Un
   caché nunca manda sobre el spine.
4. Sin DNI en texto plano: sólo HMAC + últimos 4.
5. La federación con Mi Argentina es la premisa — ninguna decisión puede dañar ese
   camino.

**Dónde mirar, por orden de daño posible:**

- **Autorización y RLS**: `src/modules/*/infrastructure`, políticas de Supabase,
  `lib/infra/auth-guards.ts`. El fence de jurisdicción para gobierno es crítico.
- **Escrituras al spine**: `src/modules/*/application/*`. ¿Alguna escribe un hecho
  que después contradice a un caché? ¿Alguna atribuye autoría que no corresponde?
- **Proyecciones y métricas**: `lib/metrics`, `lib/analytics`. Cada número debería
  poder decir qué cuenta y en qué ventana. Buscá indicadores que midan poblaciones
  distintas con nombres parecidos — es un defecto distinto, y más barato, que un
  error de cálculo.
- **Privacidad**: cualquier ruta pública (`app/(public)/**`) y cualquier campo PII.
- **Los fences**: `scripts/check-*.ts` son guardas del proyecto. Si alguna se puede
  evadir, decilo.

**Cómo hacerlo.** Lanzá tus propios agentes, uno por dimensión — no uno solo
leyendo todo. Sugerencia: seguridad/authz · integridad del spine · corrección de
proyecciones · privacidad · calidad de los tests. Y uno adversarial que trate de
**refutar** los hallazgos de los otros antes de que lleguen al informe: un hallazgo
plausible pero falso cuesta más que uno que no encontraste.

**Sobre los tests, atención especial.** Este repo tuvo al menos tres casos de
tests que pasaban en verde SOBRE el bug que debían atrapar. Cuando evalúes un
test, no preguntes si pasa — preguntá **qué tendría que romperse para que falle**,
y si esa es realmente la condición que importa.

Sumale una segunda pregunta que apareció midiendo de verdad: **¿qué fixture
haría invisible este bug?** Un test de un barrido con UNA sola organización no
puede ver un error de agrupado por organización, por más que assertee mucho. Si
el fixture no tiene dos de la cosa que el código agrupa, el test no cubre el
agrupado.

---

### Cuatro reglas que salieron de las dos pasadas anteriores

Estas no son consejos: son fallas concretas que ya ocurrieron, incluida una de
la revisión escrita para no cometerla.

**1. El barrido de clase es obligatorio, no una opción.** La 1a pasada encontró
tres de cinco buckets de storage con la misma policy permisiva porque razonó
hacia afuera desde un archivo. La 2a fue escrita para corregir eso — y encontró
su hallazgo #2 (INSERT anónimo en `welfare_reports`) leyendo el ledger de
riesgos aceptados, otra vez sin enumerar la clase. Salió bien de casualidad: el
barrido posterior mostró un solo hermano y era inofensivo.

REGLA: cuando un hallazgo pertenece a una clase enumerable —policies, buckets,
columnas caché, barridos, rutas públicas, funciones SECURITY DEFINER— el informe
tiene que incluir la enumeración COMPLETA de la clase, aunque el hallazgo haya
aparecido por otro camino. Y la enumeración va en el informe, no en tu cabeza:
es lo que permite auditar tu cobertura en vez de confiar en ella.

**2. Verificá la magnitud antes de proponer la causa.** Un crash de worker se
atribuyó a un N+1 en un barrido sin medir la población: eran 45 filas en el
test. El dato que importaba —32.428 filas en la tabla real— estaba a una query
de distancia. Una historia que explica la evidencia no es evidencia. Si tu
hallazgo depende de un volumen, medí el volumen.

**3. Tu arreglo propuesto también tiene una premisa. Verificala.** La 2a pasada
propuso borrar una policy diciendo "la app inserta por Drizzle". Era cierto —
pero si hubiera sido falso, el fix rompía las denuncias anónimas en producción.
Decí qué verificaste y qué asumiste, con la diferencia explícita.

**4. Lo que enumeraste desde SQL versionado no es el estado de la base.** El
Paso 1 de la 2a pasada concluyó "sin superficie SSRF: pg_net, http, dblink y
pgjwt están ausentes (verificado)". `pg_net` ESTÁ instalado — lo pone la
plataforma Supabase, no nuestras migraciones, así que un barrido del SQL del
repo no puede verlo. El informe ya lo había anticipado en su sección de
limitaciones, y la limitación mordió justo ahí.

REGLA: si una conclusión de seguridad depende de que algo NO exista, decí contra
qué lo verificaste. "No está en las migraciones" y "no está en la base" son
afirmaciones distintas, y sólo una de las dos cierra el argumento.

**Formato:** por hallazgo, archivo y línea, qué invariante viola, cómo se
manifiesta para un usuario real, y qué tan seguro estás. Ordená por daño, no por
cantidad. Listá explícitamente qué miraste y está bien. Un solo markdown, con el
SHA en el encabezado.
