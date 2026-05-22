// lib/form-classes.ts
//
// Shared Tailwind class strings for form fields. Use these in place of
// per-file constants so a design tweak only touches one file.
//
// Compose by concatenation when you need a variant
// (e.g. `className={`${inputClass} font-mono uppercase`}`).
// For intentionally-different design registers (amber public finder,
// admin-tier muted labels), keep local strings — see project review §4.1.

export const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 " +
  "bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 " +
  "focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";

export const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

export const filterSectionLabel =
  "text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500";
