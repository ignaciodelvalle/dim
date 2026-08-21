// `@dim/contract` — the framework-free DIM domain contract.
//
// Everything exported here must be installable by a React Native app: no
// `next`, no `react`, no `drizzle-orm`, no `@/*` app imports, and no runtime
// dependencies at all.
//
// Subpath entry points exist so a consumer that only needs the event
// vocabulary does not have to name the visualization module:
//   import { EVENT_TYPES } from "@dim/contract/events";
//   import { SCALE_BLUE_SEQ } from "@dim/contract/viz";
//   import { createIntakeInputSchema } from "@dim/contract/input";
//   import type { PublicCredentialV1 } from "@dim/contract/api";
//
// `input` is the one entry point with a runtime dependency (zod). A consumer
// that only reads the event vocabulary, the scales or the `/api/v1` wire
// shapes never loads it.
export * from "./api/index";
export * from "./events/index";
export * from "./input/index";
export * from "./viz/index";
