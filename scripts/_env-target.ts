/**
 * Resolución del entorno destino para los scripts que escriben datos.
 *
 * EL AGUJERO QUE ESTO TAPA
 * ------------------------
 * Cada seed traía su propio guard, y todos protegían de UNA sola cosa: apuntar a
 * un remoto sin `--allow-remote`. Ninguno protegía del caso inverso ni del peor
 * de los tres — el entorno PARTIDO.
 *
 * 2026-08-11: `.env.staging.local` tiene el DATABASE_URL de staging pero no las
 * variables de Supabase Auth. Al cargarlo, dotenv completó las que faltaban
 * desde `.env.local`, o sea locales. El seed entonces escribía con Drizzle en
 * STAGING mientras el SDK de Auth leía de la base LOCAL, y avisó exactamente al
 * revés: "seeding into a REMOTE project (http://127.0.0.1:54321)" — la palabra
 * REMOTO con una URL local. Murió con "Perfil no encontrado" recién en el paso
 * 3, después de haber intentado escrituras contra el entorno equivocado.
 *
 * `isLocal = local(SUPABASE_URL) && local(DATABASE_URL)` colapsa tres estados en
 * dos: con una sola URL remota ya se considera "remoto" y sigue. Acá los tres
 * estados son explícitos y el mixto NO se puede saltear — ni con --allow-remote,
 * porque no hay ninguna razón legítima para escribir la mitad de una operación
 * en cada base.
 */

export type EnvTarget = {
  /** Ambas URLs apuntan a la máquina local. */
  isLocal: boolean;
  /** Host de la base, sin credenciales — para imprimirlo sin filtrar secretos. */
  dbHost: string;
  /** Host del proyecto Supabase. */
  supabaseHost: string;
};

const isLocalUrl = (u: string) => u.includes("127.0.0.1") || u.includes("localhost");

/** Host de una URL de Postgres o HTTP, descartando usuario/contraseña. */
function hostOf(url: string): string {
  return url
    .replace(/^[a-z+]+:\/\//i, "")
    .replace(/.*@/, "")
    .replace(/[/?].*/, "");
}

/**
 * Aborta si Supabase Auth y la base apuntan a entornos DISTINTOS.
 *
 * Se exporta aparte porque la mayoría de los seeds ya traen su propio bloque de
 * aborto para el caso remoto, con mensajes que explican bien el riesgo de cada
 * uno. Lo único que a todos les faltaba era ESTE caso, así que agregan una línea
 * en vez de reescribir un aborto que ya estaba bien.
 *
 * No recibe `allowRemote` a propósito: no hay flag que habilite escribir la
 * mitad de una operación en cada base.
 */
export function assertNotSplitEnv(supabaseUrl: string, databaseUrl: string, label: string): void {
  // Una URL vacía no se puede clasificar, y no es este el lugar donde reportarlo:
  // cada script ya valida sus variables obligatorias con su propio mensaje. Sin
  // esta salida, "" se leería como REMOTO y el guard acusaría un entorno partido
  // donde lo que falta es una variable.
  if (!supabaseUrl || !databaseUrl) return;

  const supabaseLocal = isLocalUrl(supabaseUrl);
  const databaseLocal = isLocalUrl(databaseUrl);
  if (supabaseLocal === databaseLocal) return;

  console.error(
    [
      `\n[${label}] ENTORNO PARTIDO — me niego a escribir.`,
      "",
      `  Supabase Auth  → ${hostOf(supabaseUrl)}  (${supabaseLocal ? "LOCAL" : "REMOTO"})`,
      `  Base de datos  → ${hostOf(databaseUrl)}  (${databaseLocal ? "LOCAL" : "REMOTO"})`,
      "",
      "  Las dos tienen que apuntar al MISMO entorno. Escribir con una en cada",
      "  lado deja usuarios en una base y perfiles en la otra.",
      "",
      "  Causa habitual: cargaste .env.staging.local, que trae DATABASE_URL pero",
      "  no NEXT_PUBLIC_SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY — y dotenv",
      "  completó las que faltaban desde .env.local.",
      "",
      "  Usá scripts/use-staging.ps1 (o .sh), que cargan las tres y verifican antes.\n",
    ].join("\n"),
  );
  process.exit(2);
}

/**
 * Clasifica el destino y aborta el proceso si no es seguro escribir.
 *
 * @param supabaseUrl NEXT_PUBLIC_SUPABASE_URL — lo que usa el SDK de Auth.
 * @param databaseUrl DATABASE_URL — lo que usa Drizzle.
 * @param allowRemote El script recibió --allow-remote.
 * @param label Nombre del script, para los mensajes.
 */
export function resolveEnvTarget(
  supabaseUrl: string,
  databaseUrl: string,
  allowRemote: boolean,
  label: string,
): EnvTarget {
  const supabaseLocal = isLocalUrl(supabaseUrl);
  const databaseLocal = isLocalUrl(databaseUrl);
  const supabaseHost = hostOf(supabaseUrl);
  const dbHost = hostOf(databaseUrl);

  assertNotSplitEnv(supabaseUrl, databaseUrl, label);

  const isLocal = supabaseLocal && databaseLocal;

  if (!isLocal && !allowRemote) {
    console.error(
      `[${label}] Me niego: el destino es REMOTO (${supabaseHost} / ${dbHost}). Re-corré con --allow-remote si es a propósito.`,
    );
    process.exit(2);
  }
  if (!isLocal) {
    console.warn(
      `\n[${label}] ATENCIÓN: --allow-remote en efecto — escribiendo en un entorno REMOTO.\n  Supabase → ${supabaseHost}\n  Base     → ${dbHost}\n`,
    );
  } else {
    console.log(`[${label}] destino LOCAL → ${dbHost}`);
  }

  return { isLocal, dbHost, supabaseHost };
}
