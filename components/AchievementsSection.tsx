// Achievements + credentials chips for pet profile v2 (§4.9 B-4).
//
// Single horizontal scroll container:
//   [credentials leftmost] [earned achievements right]
//
// Each earned chip pulses (animate-pulse) when pulseUntil > now().
// Row is omitted entirely when both credentials and earned are empty —
// replaces the PP9 empty-state chip (design decision: empty = hidden).
//
// Credentials: PPP chip and/or service-dog chip injected by page.tsx based
// on pet flags so this component stays purely presentational.

import type { EarnedAchievement } from "@/lib/achievements/types";
import { formatDate } from "@/lib/format";
import {
  type CredentialChip,
  shouldPulse,
  shouldRenderSection,
} from "./AchievementsSection.helpers";

// Re-export CredentialChip so page.tsx can import from one place.
export type { CredentialChip };

interface Props {
  earned: EarnedAchievement[];
  credentials?: CredentialChip[];
}

export function AchievementsSection({ earned, credentials = [] }: Props) {
  if (!shouldRenderSection(credentials, earned.length)) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ln-mute">
        Logros y credenciales
      </h2>
      <ul className="flex flex-wrap gap-2">
        {/* Credentials leftmost */}
        {credentials.map((c) => (
          <li key={c.kind}>
            <CredentialBadge credential={c} />
          </li>
        ))}
        {/* Earned achievements */}
        {earned.map((a) => (
          <li key={a.id}>
            <AchievementChip achievement={a} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CredentialBadge({ credential }: { credential: CredentialChip }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ln-celeste bg-ln-celeste/10 px-3 py-1.5 text-sm font-medium text-ln-azul   ">
      <span aria-hidden>{credential.icon}</span>
      <span>{credential.label}</span>
    </span>
  );
}

function AchievementChip({ achievement }: { achievement: EarnedAchievement }) {
  const dateLabel = formatDate(achievement.earnedAt);
  const countSuffix =
    achievement.count && achievement.count > 1 ? ` · ${achievement.count} veces` : "";
  const tooltip = `${achievement.description}\nLogrado el ${dateLabel}${countSuffix}`;
  const pulse = shouldPulse(achievement.pulseUntil);

  return (
    <span
      title={tooltip}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-ln-warn bg-[var(--color-ln-warn-050)] px-3 py-1.5 text-sm font-medium text-ln-warn transition hover:bg-[var(--color-ln-warn-050)]    ",
        pulse ? "animate-pulse" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden>{achievement.icon}</span>
      <span>{achievement.label}</span>
      {achievement.count && achievement.count > 1 ? (
        <span className="ml-0.5 text-xs text-ln-warn ">×{achievement.count}</span>
      ) : null}
    </span>
  );
}
