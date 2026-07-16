"use client";

// NoticeToast — fires a one-shot sonner toast from a `?notice=` query param, set
// by a server-side presentation redirect (e.g. G1's out-of-scope jurisdiction
// bounce on /gob/panorama). Reusable via the message map below.
//
// After firing it strips `?notice=` from the URL with history.replaceState (NOT
// a Next navigation) so a refresh doesn't re-fire the toast and no RSC refetch is
// triggered.

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const NOTICE_MESSAGES: Record<string, { message: string; kind: "error" | "info" | "success" }> = {
  "jurisdiccion-fuera-de-alcance": {
    message: "No tenés acceso a esta jurisdicción",
    kind: "error",
  },
};

export function NoticeToast() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const entry = NOTICE_MESSAGES[notice];
    if (!entry) return;
    // Fire once per distinct notice value (guards React strict-mode double-invoke).
    if (firedRef.current === notice) return;
    firedRef.current = notice;

    if (entry.kind === "error") toast.error(entry.message);
    else if (entry.kind === "success") toast.success(entry.message);
    else toast(entry.message);

    // Strip ?notice= without a Next navigation so a refresh doesn't re-fire.
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [notice]);

  return null;
}
