/**
 * Base layout/typography primitives (Wave 3.2).
 *
 * Additive — no existing usage migrated. These give new code a
 * token-driven vocabulary. All primitives consume CSS custom properties
 * from app/globals.css @theme (--text-*, --leading-*, --tracking-*,
 * --radius-*, --shadow-*, --color-ln-*).
 */

export { Box } from "./Box";
export type { BoxPadding, BoxProps, BoxRadius, BoxShadow } from "./Box";

export { CardFrame } from "./CardFrame";
export type { CardFrameProps, CardFrameShadow, CardFrameSurface } from "./CardFrame";

export { Heading } from "./Heading";
export type { HeadingLevel, HeadingProps, HeadingTone } from "./Heading";

export { IconButton } from "./IconButton";
export type { IconButtonProps, IconButtonSize, IconButtonVariant } from "./IconButton";

export { Inline } from "./Inline";
export type { InlineAlign, InlineGap, InlineProps } from "./Inline";

export { PageContainer } from "./PageContainer";
export type { PageContainerProps, PageContainerWidth } from "./PageContainer";

export { Spinner } from "./Spinner";
export type { SpinnerProps, SpinnerSize, SpinnerTone } from "./Spinner";

export { Stack } from "./Stack";
export type { StackGap, StackProps } from "./Stack";

export { Text } from "./Text";
export type { TextProps, TextSize, TextTone, TextWeight } from "./Text";
