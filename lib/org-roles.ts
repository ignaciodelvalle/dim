// Re-export shim. Pure helpers now live in the organizations domain layer.
// This file is kept so existing importers (app/actions/org-coverage.ts, __tests__/)
// continue to work unchanged until they are repointed in a later PR.
// Do NOT delete until all importers are repointed and parity tests pass.

export { isManagerRole } from "@/src/modules/organizations/domain/role-rules";
