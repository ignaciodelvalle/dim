// Pure helpers for the Vaul-based Sheet component — extracted for unit testing.

export type SheetSize = "sm" | "md" | "lg";

/**
 * Extracts the active sheet id from a URLSearchParams-like object,
 * or returns null if no `sheet` param is present.
 */
export function getSheetIdFromSearchParams(
  searchParams: URLSearchParams | Record<string, string>,
): string | null {
  const raw =
    searchParams instanceof URLSearchParams
      ? searchParams.get("sheet")
      : (searchParams.sheet ?? null);
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Returns a URL string with `?sheet=<sheetId>` set, preserving all other params.
 */
export function buildSheetUrl(
  pathname: string,
  currentSearchParams: URLSearchParams | Record<string, string>,
  sheetId: string,
): string {
  const params =
    currentSearchParams instanceof URLSearchParams
      ? new URLSearchParams(currentSearchParams.toString())
      : new URLSearchParams(currentSearchParams);
  params.set("sheet", sheetId);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Returns a URL string with the `sheet` param removed, preserving all other params.
 */
export function buildCloseSheetUrl(
  pathname: string,
  currentSearchParams: URLSearchParams | Record<string, string>,
): string {
  const params =
    currentSearchParams instanceof URLSearchParams
      ? new URLSearchParams(currentSearchParams.toString())
      : new URLSearchParams(currentSearchParams);
  params.delete("sheet");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Returns a Tailwind width class for the right-drawer based on the given size.
 */
export function getDrawerWidth(size: SheetSize): string {
  switch (size) {
    case "sm":
      return "md:w-[320px]";
    case "md":
      return "md:w-[480px]";
    case "lg":
      return "md:w-[640px]";
  }
}
