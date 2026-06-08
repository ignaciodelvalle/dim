"use client";

import type { ReactNode } from "react";

/**
 * Libreta Nacional Sheet frame.
 *
 * Replaces the poncho Vaul-based Sheet for owner event forms.
 * Rendered as a full-page surface (not a modal) — it occupies the
 * scrollable content area of the shell, not a portal overlay.
 *
 * Layout layers (per handoff §8–11):
 *   LnSheetWrap       — paper bg with dotted backdrop; centers the card
 *   LnSheet           — white card; 3px category top-border; shadow
 *   LnSheetHeader     — route chip + icon box + serif title + subtitle + close
 *   LnSheetBody       — scrollable content area
 *   LnSheetFooter     — sticky stripe footer: Cancelar + primary CTA
 *
 * Category color → tone prop:
 *   "azul"    #0e5a99  (default — general events)
 *   "verde"   #2e7d4f  (vacuna)
 *   "violeta" #6b4ea8  (medicación)
 *   "seal"    #a23a2c  (perdida)
 *   "warn"    #b0771a  (cautionary)
 *
 * Usage:
 *   <LnSheetPage
 *     tone="verde"
 *     icon="💉"
 *     title="Registrar vacuna"
 *     subtitle="Libreta sanitaria"
 *     routeChip="?asiento=vacuna"
 *     onClose={() => router.back()}
 *   >
 *     <form ...>...</form>
 *   </LnSheetPage>
 *
 * Accessibility:
 *  - header contains role="heading" aria-level="1" for the title
 *  - close button has aria-label="Cerrar"
 *  - footer's cancel button triggers onClose
 *
 * All styles use ln-* tokens. Safe in components/ui/ (exempt from lint:tokens guard).
 */

// ---------- Tone styles --------------------------------------------------

export type LnSheetTone = "azul" | "verde" | "violeta" | "seal" | "warn";

const toneTopBorder: Record<LnSheetTone, string> = {
  azul: "border-t-[var(--color-ln-azul)]",
  verde: "border-t-[var(--color-ln-ok)]",
  violeta: "border-t-[#6b4ea8]",
  seal: "border-t-[var(--color-ln-seal)]",
  warn: "border-t-[var(--color-ln-warn)]",
};

const toneIconBg: Record<LnSheetTone, string> = {
  azul: "bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)] border-[var(--color-ln-celeste-100)]",
  verde: "bg-[#eef6f0] text-[var(--color-ln-ok)] border-[#c8e2d2]",
  violeta: "bg-[#f0ecf8] text-[#6b4ea8] border-[#ddd2f0]",
  seal: "bg-[#fbe9e6] text-[var(--color-ln-seal)] border-[#f1c6bf]",
  warn: "bg-[#fdf2e0] text-[var(--color-ln-warn)] border-[#f0dcb4]",
};

const toneCtaClass: Record<LnSheetTone, string> = {
  azul: "bg-[var(--color-ln-azul)] border-[var(--color-ln-azul)] hover:bg-[var(--color-ln-azul-700)] hover:border-[var(--color-ln-azul-700)]",
  verde: "bg-[var(--color-ln-ok)] border-[var(--color-ln-ok)] hover:opacity-90",
  violeta: "bg-[#6b4ea8] border-[#6b4ea8] hover:opacity-90",
  seal: "bg-[var(--color-ln-seal)] border-[var(--color-ln-seal)] hover:opacity-90",
  warn: "bg-[var(--color-ln-warn)] border-[var(--color-ln-warn)] hover:opacity-90",
};

// ---------- LnSheetPage (full page composition) --------------------------

export type LnSheetPageProps = {
  tone?: LnSheetTone;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  routeChip?: string;
  onClose?: () => void;
  /** CTA label in footer (defaults to "Guardar") */
  ctaLabel?: string;
  /** Form id — footer submit button targets this form by id */
  formId?: string;
  /** Whether the form is currently submitting */
  isPending?: boolean;
  wide?: boolean;
  children: ReactNode;
};

export function LnSheetPage({
  tone = "azul",
  icon,
  title,
  subtitle,
  routeChip,
  onClose,
  ctaLabel = "Guardar",
  formId,
  isPending = false,
  wide = false,
  children,
}: LnSheetPageProps) {
  return (
    <LnSheetWrap>
      {routeChip && <LnSheetRouteChip>{routeChip}</LnSheetRouteChip>}
      <LnSheetCard wide={wide}>
        <LnSheetHeader tone={tone} icon={icon} title={title} subtitle={subtitle} onClose={onClose} />
        <LnSheetBody>{children}</LnSheetBody>
        <LnSheetFooter
          tone={tone}
          ctaLabel={ctaLabel}
          formId={formId}
          isPending={isPending}
          onCancel={onClose}
        />
      </LnSheetCard>
    </LnSheetWrap>
  );
}

// ---------- LnSheetWrap --------------------------------------------------

export function LnSheetWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        "relative flex min-h-screen w-full items-start justify-center overflow-auto",
        "bg-[radial-gradient(circle_at_12px_12px,var(--color-ln-line)_1.2px,transparent_1.2px)_0_0_/_22px_22px,var(--color-ln-paper)]",
        "px-[24px] py-[28px]",
        "font-[var(--font-ln-sans)] text-[var(--color-ln-ink)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

// ---------- LnSheetCard --------------------------------------------------

export function LnSheetCard({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "flex flex-col overflow-hidden rounded-[5px]",
        "border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)]",
        "shadow-[0_18px_50px_rgba(20,40,60,.14)]",
        "w-full",
        wide ? "max-w-[620px]" : "max-w-[560px]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

// ---------- LnSheetRouteChip ---------------------------------------------

export function LnSheetRouteChip({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-[18px] top-[12px] rounded-full border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[10px] py-[3px] font-[var(--font-ln-mono)] text-[10px] tracking-[.08em] text-[var(--color-ln-faint)]">
      {children}
    </div>
  );
}

// ---------- LnSheetHeader ------------------------------------------------

export type LnSheetHeaderProps = {
  tone?: LnSheetTone;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  onClose?: () => void;
};

export function LnSheetHeader({
  tone = "azul",
  icon,
  title,
  subtitle,
  onClose,
}: LnSheetHeaderProps) {
  return (
    <div
      className={[
        "relative flex items-center gap-[13px] border-b border-[var(--color-ln-line)] border-t-[3px] px-[18px] py-[16px]",
        toneTopBorder[tone],
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Icon box */}
      {icon && (
        <div
          className={[
            "grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[8px] border text-[16px]",
            toneIconBg[tone],
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <h1
          className="m-0 font-[var(--font-ln-serif)] text-[18px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]"
          role="heading"
          aria-level={1}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-[2px] text-[12px] text-[var(--color-ln-mute)]">{subtitle}</p>
        )}
      </div>

      {/* Close */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-[30px] w-[30px] flex-shrink-0 cursor-pointer place-items-center rounded-[6px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] text-[var(--color-ln-mute)] transition-colors hover:bg-[var(--color-ln-stripe)]"
        >
          <span aria-hidden="true" className="text-[18px] leading-none">
            ×
          </span>
        </button>
      )}
    </div>
  );
}

// ---------- LnSheetBody --------------------------------------------------

export function LnSheetBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[14px] px-[18px] py-[18px]">
      {children}
    </div>
  );
}

// ---------- LnSheetFooter ------------------------------------------------

export type LnSheetFooterProps = {
  tone?: LnSheetTone;
  ctaLabel?: string;
  formId?: string;
  isPending?: boolean;
  onCancel?: () => void;
  /** Render a custom CTA instead of the default submit button */
  customCta?: ReactNode;
};

export function LnSheetFooter({
  tone = "azul",
  ctaLabel = "Guardar",
  formId,
  isPending = false,
  onCancel,
  customCta,
}: LnSheetFooterProps) {
  return (
    <div className="flex items-center gap-[10px] border-t border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[18px] py-[13px]">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[14px] py-[8px] text-[12.5px] font-semibold text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar
        </button>
      )}
      <div className="flex-1" />
      {customCta ?? (
        <button
          type="submit"
          form={formId}
          disabled={isPending}
          aria-busy={isPending || undefined}
          className={[
            "inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-60",
            toneCtaClass[tone],
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {isPending ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Guardando...
            </>
          ) : (
            ctaLabel
          )}
        </button>
      )}
    </div>
  );
}

// ---------- LnSheetPetRow ------------------------------------------------

/**
 * Pet selector strip shown at the top of the sheet body.
 * Displays photo (or placeholder), name, meta info, and a "CAMBIAR" affordance.
 */
export type LnSheetPetRowProps = {
  name: string;
  meta?: string;
  photoUrl?: string | null;
  onChangePet?: () => void;
};

export function LnSheetPetRow({ name, meta, photoUrl, onChangePet }: LnSheetPetRowProps) {
  return (
    <div className="flex items-center gap-[12px] rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[12px] py-[10px]">
      {/* Photo / placeholder */}
      <div className="h-[38px] w-[38px] flex-shrink-0 overflow-hidden rounded-full border border-[var(--color-ln-line-strong)]">
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#e7e2d6_0_4px,#f2efe6_4px_8px)]" />
        )}
      </div>
      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="font-[var(--font-ln-serif)] text-[15px] font-semibold leading-tight text-[var(--color-ln-ink)]">
          {name}
        </p>
        {meta && <p className="mt-[1px] text-[11.5px] text-[var(--color-ln-mute)]">{meta}</p>}
      </div>
      {/* Change */}
      {onChangePet && (
        <button
          type="button"
          onClick={onChangePet}
          className="ml-auto cursor-pointer font-[var(--font-ln-mono)] text-[10px] tracking-[.04em] text-[var(--color-ln-azul)]"
        >
          CAMBIAR
        </button>
      )}
    </div>
  );
}

// ---------- LnSubCard ----------------------------------------------------

/**
 * Grouped field card (enriched identity sub-card, disclosure prefs sub-card).
 */
export type LnSubCardProps = {
  heading?: string;
  children: ReactNode;
  className?: string;
};

export function LnSubCard({ heading, children, className = "" }: LnSubCardProps) {
  return (
    <div
      className={[
        "flex flex-col gap-[12px] rounded-[5px] border border-[var(--color-ln-line)] bg-[#fcfbf7] px-[14px] py-[14px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {heading && (
        <p className="border-b border-[var(--color-ln-line-2)] pb-[7px] font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--color-ln-azul)]">
          {heading}
        </p>
      )}
      {children}
    </div>
  );
}

// ---------- LnGroupLabel -------------------------------------------------

export function LnGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-ln-faint)]">
      {children}
    </p>
  );
}

// ---------- LnSheetAccordion ----------------------------------------------

/**
 * Numbered <details> accordion for the Editar mascota sheet.
 * Shows "✓ completo" when closed (if complete={true}).
 */
export type LnSheetAccordionProps = {
  num: string;
  title: string;
  defaultOpen?: boolean;
  complete?: boolean;
  children: ReactNode;
};

export function LnSheetAccordion({
  num,
  title,
  defaultOpen = false,
  complete = false,
  children,
}: LnSheetAccordionProps) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]"
    >
      <summary className="flex cursor-pointer select-none list-none items-center gap-[12px] px-[14px] py-[11px] hover:bg-[var(--color-ln-stripe)]">
        {/* Number */}
        <span className="font-[var(--font-ln-mono)] text-[12px] font-semibold tracking-[.04em] text-[var(--color-ln-azul)]">
          {num}
        </span>
        {/* Title */}
        <span className="flex-1 text-[13.5px] font-semibold text-[var(--color-ln-ink)]">
          {title}
        </span>
        {/* Complete badge — hidden when open */}
        {complete && (
          <span className="font-[var(--font-ln-mono)] text-[10px] text-[var(--color-ln-ok)] group-open:hidden">
            ✓ completo
          </span>
        )}
        {/* Chevron */}
        <span
          aria-hidden="true"
          className="text-[var(--color-ln-mute)] transition-transform duration-150 group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="border-t border-[var(--color-ln-line-2)] px-[14px] py-[14px]">
        {children}
      </div>
    </details>
  );
}
