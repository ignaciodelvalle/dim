// LostModeBanner — the prominent red strip at the very top of the pet
// profile when the pet's status is "lost".
//
// Sits ABOVE the normal hero. Holds the three pieces an owner needs in
// the first second on screen:
//   - that the pet is lost (heading)
//   - how long it's been (timestamp)
//   - one-tap "Marcar encontrada" to close
//
// The case ref (LOS-XXXX) links to /casos/{publicCode} for the full
// audit trail. The case opens automatically via the `lost_pet_episode`
// lifecycle when `status_changed → lost` is emitted by the existing
// `setPetLostAction` server action.

import Link from "next/link";

interface Props {
  petName: string;
  petPhotoUrl: string | null;
  /** When `status_changed → lost` was emitted. Drives the "hace N" caption. */
  lostSince: Date;
  /** Public code of the open lost_pet_episode case. */
  casePublicCode: string;
  /** Localidad/partido string, e.g. "La Plata". */
  jurisdictionLabel: string;
  /** Server-action button. Server side calls setPetFoundAction. */
  markFoundAction: () => Promise<void>;
}

export function LostModeBanner({
  petName,
  petPhotoUrl,
  lostSince,
  casePublicCode,
  jurisdictionLabel,
  markFoundAction,
}: Props) {
  return (
    <section
      role="alert"
      className="relative overflow-hidden rounded-2xl bg-red-700 p-4 text-white shadow-sm"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0 6px, transparent 6px 12px)",
        }}
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-red-800 ring-[3px] ring-white">
          {petPhotoUrl ? (
            <img src={petPhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold">{petName.charAt(0).toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            {petName} está {feminineEnding(petName, "perdida", "perdido")}
          </h2>
          <p className="mt-0.5 text-xs opacity-95">
            hace {relativeLostFor(lostSince)} ·{" "}
            <Link
              href={`/casos/${casePublicCode}`}
              className="underline-offset-2 hover:underline"
            >
              {casePublicCode}
            </Link>{" "}
            · {jurisdictionLabel}
          </p>
        </div>
        <form action={markFoundAction}>
          <button
            type="submit"
            className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-semibold text-red-800 transition-colors hover:bg-red-50"
          >
            Marcar {feminineEnding(petName, "encontrada", "encontrado")}
          </button>
        </form>
      </div>
    </section>
  );
}

// Best-effort gender hint from the name's final vowel. Spanish names ending
// in 'a' are most often female; otherwise default to masculine forms.
// The owner can override later via a pet.sex field — out of scope here.
function feminineEnding(name: string, femaleForm: string, maleForm: string): string {
  if (name.trim().toLowerCase().endsWith("a")) return femaleForm;
  return maleForm;
}

function relativeLostFor(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "un momento";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) {
    const remMin = min - hours * 60;
    if (remMin === 0) return `${hours} h`;
    return `${hours} h ${remMin} min`;
  }
  const days = Math.floor(hours / 24);
  return `${days} día${days === 1 ? "" : "s"}`;
}
