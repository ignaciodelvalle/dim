"use client";

/**
 * LnWizardShell — generic multi-step wizard chrome (LN design system).
 *
 * Owns the top bar (back / step counter / optional cancel), the progress bar,
 * and the main content slot. Wizard state and step content are caller-supplied.
 */

export type LnWizardShellProps = {
  currentStep: number; // 1-indexed
  totalSteps: number;
  /** Optional per-step short label. When provided, the current step's label
   * is shown under the counter; the array length should be >= totalSteps. */
  stepLabels?: string[];
  onBack?: () => void;
  /** Optional cancel handler. When provided, a "Cancelar y volver" button is
   * rendered next to the back arrow (top right). */
  onCancel?: () => void;
  /**
   * B-8: Optional id for the <main> element so the skip-to-main link
   * ("#main-content") can land on the wizard's content area.
   * Pass id="main-content" on the first (and only active) shell instance.
   */
  mainId?: string;
  children: React.ReactNode;
};

export function LnWizardShell({
  currentStep,
  totalSteps,
  stepLabels,
  onBack,
  onCancel,
  mainId,
  children,
}: LnWizardShellProps) {
  // Progress percent — (currentStep - 1) / totalSteps so step 1 renders as 0%
  // and the final step renders as (n-1)/n until submission completes.
  const progressPct = Math.round(((currentStep - 1) / totalSteps) * 100);
  const stepLabel = stepLabels?.[currentStep - 1];

  return (
    <div className="bg-[var(--color-ln-card)] flex flex-col">
      <header className="flex items-center gap-3 px-4 pt-5 pb-3">
        {onBack && currentStep > 1 ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Paso anterior"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-ln-mute)] hover:bg-[var(--color-ln-stripe)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2"
          >
            ←
          </button>
        ) : (
          <div className="w-9 h-9 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--color-ln-mute)] tabular-nums">
            Paso {currentStep} de {totalSteps}
          </p>
          {stepLabel ? (
            <p className="text-sm font-medium text-[var(--color-ln-ink)] truncate">{stepLabel}</p>
          ) : null}
        </div>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex-shrink-0 text-xs text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink)] underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2 rounded px-1"
          >
            Cancelar y volver
          </button>
        ) : null}
      </header>

      <div
        className="h-0.5 bg-[var(--color-ln-stripe)] mx-4 rounded-full overflow-hidden"
        role="progressbar"
        tabIndex={-1}
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={`Paso ${currentStep} de ${totalSteps}`}
      >
        <div
          className="h-full bg-[var(--color-ln-azul)] rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <main id={mainId} className="flex-1 px-4 pt-8 pb-32 max-w-md mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
