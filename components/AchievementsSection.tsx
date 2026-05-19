// Achievements chips for pet profile v2.
//
// Renders earned achievements as horizontal scrollable chips with a
// tooltip on hover/focus. When the catalog has zero earned items, a
// warm empty state surfaces a single "tu mascota recién empieza"
// placeholder. Not-yet-computable achievements (litter, globetrotter)
// are NOT shown in v1 — they'd weigh the empty state down (PP9).

import type { EarnedAchievement } from "@/lib/achievements/types";
import { formatDate } from "@/lib/format";

interface Props {
  earned: EarnedAchievement[];
}

export function AchievementsSection({ earned }: Props) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Logros · 🏆
      </h2>
      {earned.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {earned.map((a) => (
            <li key={a.id}>
              <AchievementChip achievement={a} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
      <span aria-hidden>🌱</span>
      <span>Tu mascota recién empieza su historia en MiMAR</span>
    </div>
  );
}

function AchievementChip({ achievement }: { achievement: EarnedAchievement }) {
  const dateLabel = formatDate(achievement.earnedAt);
  const tooltip =
    `${achievement.description}\nLogrado el ${dateLabel}` +
    (achievement.count && achievement.count > 1 ? ` · ${achievement.count} veces` : "");
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
    >
      <span aria-hidden>{achievement.icon}</span>
      <span>{achievement.label}</span>
      {achievement.count && achievement.count > 1 ? (
        <span className="ml-0.5 text-xs text-amber-700 dark:text-amber-300">
          ×{achievement.count}
        </span>
      ) : null}
    </span>
  );
}
