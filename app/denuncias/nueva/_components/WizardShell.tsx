"use client";

// WizardShell — layout wrapper for the 5-step denuncia wizard.
// Renders the step indicator, back button, and a sticky bottom CTA slot.
// The step labels intentionally use short-form copy that fits on mobile.

const STEP_LABELS = ["Qué pasó", "Gravedad", "Dónde", "Quién", "Cerrar"];

type WizardShellProps = {
  currentStep: number; // 1-indexed
  totalSteps: number;
  onBack?: () => void;
  children: React.ReactNode;
};

export function WizardShell({ currentStep, totalSteps, onBack, children }: WizardShellProps) {
  const progressPct = Math.round(((currentStep - 1) / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col">
      {/* Top bar: back + step counter */}
      <header className="flex items-center gap-3 px-4 pt-5 pb-3">
        {onBack && currentStep > 1 ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Paso anterior"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            ←
          </button>
        ) : (
          <div className="w-9 h-9 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-neutral-500 dark:text-neutral-500 tabular-nums">
            Paso {currentStep} de {totalSteps}
          </p>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
            {STEP_LABELS[currentStep - 1] ?? ""}
          </p>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-0.5 bg-neutral-100 dark:bg-neutral-800 mx-4 rounded-full overflow-hidden">
        <div
          className="h-full bg-neutral-900 dark:bg-neutral-50 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
          role="progressbar"
          tabIndex={-1}
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso: paso ${progressPct} de 100`}
        />
      </div>

      {/* Step content */}
      <main className="flex-1 px-4 pt-8 pb-32 max-w-md mx-auto w-full">{children}</main>
    </div>
  );
}
