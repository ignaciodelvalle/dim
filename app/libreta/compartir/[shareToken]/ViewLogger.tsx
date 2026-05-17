"use client";

import { useEffect } from "react";

import { logLibretaShareViewAction } from "@/app/actions/libreta-share";

export function ViewLogger({ shareToken }: { shareToken: string }) {
  useEffect(() => {
    // Fire once on mount. Does not block render. Errors swallowed —
    // this is best-effort telemetry.
    logLibretaShareViewAction({
      shareToken,
      userAgent: navigator.userAgent ?? null,
    }).catch(() => {});
  }, [shareToken]);

  return null;
}
