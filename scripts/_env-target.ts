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

  // Entorno PARTIDO — nunca es intencional, así que no hay flag que lo habilite.
  if (supabaseLocal !== databaseLocal) {
    console.error(
      [
        `\n[${label}] ENTORNO PARTIDO — me niego a escribir.`,
        "",
        `  Supabase Auth  → ${supabaseHost}  (${supabaseLocal ? "LOCAL" : "REMOTO"})`,
        `  Base de datos  → ${dbHost}  (${databaseLocal ? "LOCAL" : "REMOTO"})`,
        "",
        "  Las dos tienen que apuntar al MISMO entorno. Escribir con una en cada",
        "  lado deja usuarios en una base y perfiles en la otra.",
        "",
        "  Causa habitual: cargaste .env.staging.local, que trae DATABASE_URL pero",
        "  no NEXT_PUBLIC_SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY — y dotenv",
        "  completó las que faltaban desde .env.local.",
        "",
        "  Usá scripts/use-staging.ps1, que carga las tres y verifica antes.\n",
      ].join("\n"),
    );
    process.exit(2);
  }

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
