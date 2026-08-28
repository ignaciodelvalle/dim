// DocumentChromeNative — the framed-sheet chrome that makes both faces read as
// ONE physical two-sided credential, drawn by React Native.
//
// THE REFERENCE IS THE WEB'S `DocumentChrome` + the `.ln-*` rules in
// app/globals.css, at the PHONE layout (`@media (max-width: 720px)`) — a phone
// is always ≤720. Same anatomy: the blue pinstripe band carrying the
// certificate title and the turn button, the situation chip, the certificate
// inner hairline frame, and the body. What differs is only the drawing tool:
//
//   · The band's `repeating-linear-gradient` pinstripes have no RN equivalent,
//     so the band is an SVG (react-native-svg, already a dependency): one
//     linear gradient underneath, one set of diagonal hairlines on top.
//   · The white-translucency literals (rgba(255,255,255,.22) on the turn
//     button, rgba(0,0,0,.22) on the chip, the .5-alpha pinstripe) are the
//     web's own values from globals.css, copied — not invented. They are not
//     tokens on the web either.
//
// THE SITUATION IS SERVER-DECIDED. `situation` arrives as the contract's
// `OwnerPetSituationV1` — key, tone, icon and an already-gender-agreed label —
// and this chrome paints it without re-deriving anything. The band tint per
// key mirrors the `.ln-face[data-situation]` variants; `prenada` and
// `fallecida` keep the DEFAULT band here because their tint tokens
// (--color-ln-rosa*, --color-ln-memorial-*) are not in `@dim/contract/tokens`
// yet and this file invents no value — the chip still carries the state as
// icon + text, so nothing rests on color alone (WCAG).
//
// THE TURN IS INSTANT. This chrome owns the button, not the motion: the
// reduced-motion path (conditional render swap) IS the mechanic in this unit;
// the animated turn is a later unit, and it will be React Native core
// `Animated`, not Reanimated — this repo lost a production build to the
// worklets runtime (see src/release/release-config.test.ts) and the card stays
// off it.

import type { OwnerPetSituationV1 } from "@dim/contract/api";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "../ui/Icon";
import { FONTS } from "../ui/fonts";
import { COLORS, LABEL_TRACKING_EM, RADIUS } from "../ui/theme";

export type DocumentFace = "credencial" | "libreta";

/** The band's gradient stops + the face's border tint, per situation key —
 *  mirroring the `.ln-face[data-situation]` CSS variants, tokens only. */
function bandSkin(situationKey: string | undefined): {
  stops: ReadonlyArray<{ offset: string; color: string }>;
  border: string;
} {
  switch (situationKey) {
    case "perdida":
      return {
        stops: [
          { offset: "0%", color: COLORS.seal },
          { offset: "100%", color: COLORS.danger },
        ],
        border: COLORS.dangerBorder,
      };
    case "custodia-oficial":
    case "en-tratamiento":
      return {
        stops: [
          { offset: "0%", color: COLORS.warnInk },
          { offset: "100%", color: COLORS.warnInk },
        ],
        border: COLORS.warnBorder,
      };
    case "observacion-antirrabica":
      return {
        stops: [
          { offset: "0%", color: COLORS.accent },
          { offset: "55%", color: COLORS.celeste },
          { offset: "100%", color: COLORS.celeste },
        ],
        border: COLORS.celeste100,
      };
    case "en-adopcion":
    case "en-transito":
      return {
        stops: [
          { offset: "0%", color: COLORS.ink },
          { offset: "100%", color: COLORS.inkSoft },
        ],
        border: COLORS.borderStrong,
      };
    default:
      // The default navy band — azul-900 → azul (58%) → celeste, the web's
      // stops verbatim. Also the deliberate fallback for `prenada` and
      // `fallecida` (see the header) and for a situation key from a newer
      // server: the chip still names the state.
      return {
        stops: [
          { offset: "0%", color: COLORS.bandDeep },
          { offset: "58%", color: COLORS.accent },
          { offset: "100%", color: COLORS.celeste },
        ],
        border: COLORS.border,
      };
  }
}

/** The pinstriped band background. The web's repeating-linear-gradient(135deg,
 *  rgba(255,255,255,.5) 0 1px, transparent 1px 11px) becomes diagonal SVG
 *  hairlines over the gradient — 11px period, measured perpendicular like the
 *  CSS does, so the x-step is 11/cos(45°) ≈ 15.5. */
function BandBackground({ situationKey }: { situationKey: string | undefined }) {
  const skin = bandSkin(situationKey);
  const lines: number[] = [];
  for (let x = 0; x <= BAND_VIEWBOX_W + BAND_H; x += 15.5) lines.push(x);
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${BAND_VIEWBOX_W} ${BAND_H}`}
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        {/* 118deg on the web — mostly horizontal, falling slightly. */}
        <LinearGradient id="band" x1="0" y1="0" x2="1" y2="0.35">
          {skin.stops.map((stop) => (
            <Stop
              key={`${stop.offset}-${stop.color}`}
              offset={stop.offset}
              stopColor={stop.color}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={BAND_VIEWBOX_W} height={BAND_H} fill="url(#band)" />
      {lines.map((x) => (
        <Line
          key={x}
          x1={x}
          y1={BAND_H + 10}
          x2={x + BAND_H + 10}
          y2={-10}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

const BAND_H = 120;
const BAND_VIEWBOX_W = 400;

type DocumentChromeNativeProps = {
  face: DocumentFace;
  onTurn: () => void;
  /** Server-decided situation (key/tone/icon/label) — or null for the default
   *  blue band and no chip. Never re-derived client-side. */
  situation: OwnerPetSituationV1 | null;
  children: ReactNode;
};

export function DocumentChromeNative({
  face,
  onTurn,
  situation,
  children,
}: DocumentChromeNativeProps) {
  const isCredencial = face === "credencial";
  const bandSubtitle = isCredencial ? "Credencial · frente" : "Libreta · dorso";
  const turnLabel = isCredencial ? "Dar vuelta" : "Ver credencial";
  // The accessible name always names the TARGET face — the web's exact wording.
  const turnAria = isCredencial ? "Girar a Libreta" : "Girar a Credencial";
  const skin = bandSkin(situation?.key);

  return (
    <View style={[styles.face, { borderColor: skin.border }]}>
      <View style={styles.band}>
        <BandBackground situationKey={situation?.key} />
        <View style={styles.bandTitle} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.bandTitleText}>Libreta Sanitaria Nacional</Text>
          <Text style={styles.bandSubtitleText}>{bandSubtitle}</Text>
        </View>
        {/* State chip — icon + label, never color alone. OUTSIDE the hidden
            title wrapper: on the back face this chip is the only textual
            carrier of the state, so it must stay accessible text. */}
        {situation === null ? null : (
          <View style={styles.bandChip}>
            <Icon name={situation.icon} size="sm" color="#fff" />
            <Text style={styles.bandChipText} numberOfLines={1}>
              {situation.label}
            </Text>
          </View>
        )}
        {/* The single flip control. `selected` carries the toggle state the
            web expresses with aria-pressed. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={turnAria}
          accessibilityState={{ selected: face === "libreta" }}
          onPress={onTurn}
          style={styles.turn}
        >
          <Icon name="girar" size="sm" color="#fff" />
          <Text style={styles.turnLabel}>{turnLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>{children}</View>

      {/* Certificate inner hairline — last so it paints over the body edge;
          pointerEvents none so it never eats a tap. */}
      <View pointerEvents="none" style={styles.frame} />
    </View>
  );
}

/**
 * A labeled hairline divider — the web's `.ln-divider` + `.ln-divider-label`.
 * Exported from here because it is document chrome: both faces bind their
 * sections with it so the sheet reads as one credential, not a stack of cards.
 */
export function FaceDivider({ icon, label }: { icon?: string; label?: string }) {
  if (label === undefined) return <View style={styles.divider} />;
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLabel}>
        {icon === undefined ? null : <Icon name={icon} size="sm" color={COLORS.inkFaint} />}
        <Text style={styles.dividerLabelText}>{label}</Text>
      </View>
    </View>
  );
}

/** The web's `.ln-sec` at the phone layout: 20px vertical, 18px horizontal. */
export function FaceSection({ children }: { children: ReactNode }) {
  return <View style={styles.sec}>{children}</View>;
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderRadius: RADIUS.card,
    overflow: "hidden",
  },
  frame: {
    position: "absolute",
    top: 7,
    right: 7,
    bottom: 7,
    left: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.borderSoft,
    borderRadius: 9,
    zIndex: 5,
  },
  band: {
    height: BAND_H,
    overflow: "hidden",
  },
  bandTitle: {
    position: "absolute",
    left: 22,
    top: 16,
    maxWidth: "55%",
  },
  bandTitleText: {
    fontFamily: FONTS.monoSemibold,
    fontSize: 10,
    letterSpacing: 10 * 0.24,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.9)",
  },
  bandSubtitleText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 8 * 0.16,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.6)",
    marginTop: 3,
  },
  bandChip: {
    position: "absolute",
    top: 82,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: "60%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.button,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    zIndex: 4,
  },
  bandChipText: {
    fontFamily: FONTS.monoSemibold,
    fontSize: 10,
    letterSpacing: 10 * LABEL_TRACKING_EM,
    textTransform: "uppercase",
    color: "#fff",
  },
  turn: {
    position: "absolute",
    right: 16,
    top: 14,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 13,
    paddingRight: 16,
    borderRadius: RADIUS.button,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  turnLabel: {
    fontFamily: FONTS.sansSemibold,
    fontSize: 14,
    color: "#fff",
  },
  body: {
    zIndex: 2,
  },
  sec: {
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
  },
  dividerLabel: {
    position: "absolute",
    top: -8,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
  },
  dividerLabelText: {
    fontFamily: FONTS.monoSemibold,
    fontSize: 10,
    letterSpacing: 10 * 0.18,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
});
