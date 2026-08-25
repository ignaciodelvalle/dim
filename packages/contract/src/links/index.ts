// `@dim/contract/links` — where a logical destination lives.
//
// One table, consumed by the web app (QR payloads, share sheets, invitation
// e-mails, notification CTAs) and, from M2 on, by the native router. See
// deep-link-map.ts for what belongs in it and what deliberately does not.
export {
  APP_SCHEME,
  DEEP_LINK_MAP,
  type DeepLinkAccess,
  type DeepLinkDestination,
  type DeepLinkName,
  type DeepLinkParams,
  deepLinkAppUrl,
  deepLinkPath,
  deepLinkUrl,
  pathParamNames,
} from "./deep-link-map";
