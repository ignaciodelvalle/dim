"use client";

import { useActionState } from "react";

import { LnField, LnInput } from "@/components/ui/Field";

// The action receives the full input including petPublicToken; callers
// bind (or wrap) it so the component only supplies expiresInDays + label.
type CreateShareInput = {
  petPublicToken: string;
  expiresInDays: number | null;
  label: string | null;
};
type CreateShareResult = { error: string } | { shareToken: string };

type Props = {
  petPublicToken: string;
  petName: string;
  /** Pre-bound action — petPublicToken is already captured by the caller. */
  createShareAction: (
    input: Pick<CreateShareInput, "expiresInDays" | "label">,
  ) => Promise<CreateShareResult>;
};

type FormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; shareToken: string };

const DURATION_OPTIONS: Array<{ value: string; label: string; days: number | null }> = [
  { value: "7", label: "7 días", days: 7 },
  { value: "30", label: "30 días", days: 30 },
  { value: "never", label: "Sin vencimiento", days: null },
];

async function submitShare(
  createAction: Props["createShareAction"],
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const label = (formData.get("label") as string | null) || null;
  const durationValue = formData.get("duration") as string;
  const option = DURATION_OPTIONS.find((o) => o.value === durationValue);
  const expiresInDays = option ? option.days : 7;

  const result = await createAction({ expiresInDays, label: label?.trim() || null });

  if ("error" in result) return { status: "error", message: result.error };
  return { status: "success", shareToken: result.shareToken };
}

export function ShareLibretaSheet({ petPublicToken, petName, createShareAction }: Props) {
  const boundSubmit = submitShare.bind(null, createShareAction);
  const [state, formAction, isPending] = useActionState<FormState, FormData>(boundSubmit, {
    status: "idle",
  });

  if (state.status === "success") {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/libreta/compartir/${state.shareToken}`;
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--color-ln-ink-2)]">El link está listo para compartir.</p>

        <div className="rounded-[4px] border border-[var(--color-ln-ok)] bg-[var(--color-ln-ok-050)] p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ln-ok)]">
            Link generado
          </p>
          <p className="text-sm font-mono break-all text-[var(--color-ln-ink)]">{shareUrl}</p>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="w-full px-4 py-2 rounded-[3px] bg-[var(--color-ln-ok)] hover:opacity-90 text-white text-sm font-medium"
          >
            Copiar link
          </button>
        </div>

        <p className="text-xs text-[var(--color-ln-mute)] text-center">
          Podés ver y revocar todos tus links compartidos desde la libreta de {petName}.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <p className="text-sm text-[var(--color-ln-ink-2)]">
        Generá un link privado para que otra persona vea la libreta sanitaria de {petName}. Podés
        revocarlo en cualquier momento.
      </p>

      {/* Label field */}
      <LnField label="Para qué es este link">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="label"
            type="text"
            placeholder="Ej: Vet de cabecera, Guardería, Viaje"
            maxLength={80}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {/* Duration radio */}
      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ln-mute)] mb-1.5">
          Vencimiento
        </legend>
        {DURATION_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-3 rounded-[4px] border border-[var(--color-ln-line-strong)] px-4 py-3 cursor-pointer has-[:checked]:border-[var(--color-ln-ok)] has-[:checked]:bg-[var(--color-ln-ok-050)]"
          >
            <input
              type="radio"
              name="duration"
              value={opt.value}
              defaultChecked={opt.value === "7"}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-[var(--color-ln-ink)]">{opt.label}</span>
          </label>
        ))}
      </fieldset>

      {state.status === "error" && (
        <p className="text-sm text-[var(--color-ln-err)]">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-ok)] hover:opacity-90 disabled:opacity-60 text-white font-medium"
      >
        {isPending ? "Generando…" : "Generar link"}
      </button>
    </form>
  );
}
