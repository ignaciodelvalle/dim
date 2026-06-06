// ENO catalog shim — re-exports from src/modules/surveillance/domain/eno-catalog.ts.
//
// WU-4: lib/eno-catalog.ts is now a thin re-export shim.
// The canonical implementation lives in the surveillance module domain.
//
// Importers (app/actions/outbreak-investigation.ts, old lib code, tests) continue
// working with no changes.

export type { EnoDisease } from "@/src/modules/surveillance/domain/eno-catalog";
export {
  ENO_DISEASES_AR,
  getEnoDisease,
  isEnoCode,
  diseaseCodeToEnoCode,
} from "@/src/modules/surveillance/domain/eno-catalog";
