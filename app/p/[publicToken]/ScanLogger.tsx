"use client";

// Fires the credential_scanned server action exactly once when the public
// credential page mounts. Renders nothing.

import { useEffect, useRef } from "react";
import { logScanAction } from "@/app/actions/scans";

export function ScanLogger({ publicToken }: { publicToken: string }) {
  const hasLogged = useRef(false);

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;
    void logScanAction(publicToken);
  }, [publicToken]);

  return null;
}
