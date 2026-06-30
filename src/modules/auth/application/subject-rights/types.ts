export type ExportSubjectDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export type EraseSubjectDataResult = { ok: true } | { ok: false; error: string };
