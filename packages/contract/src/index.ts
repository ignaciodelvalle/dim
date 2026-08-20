// `@dim/contract` — the framework-free DIM domain contract.
//
// Everything exported here must be installable by a React Native app: no
// `next`, no `react`, no `drizzle-orm`, no `@/*` app imports, and no runtime
// dependencies at all.
//
// Subpath entry points exist so a consumer that only needs the event
// vocabulary does not have to name every other module:
//   import { EVENT_TYPES } from "@dim/contract/events";
export * from "./events/index";
