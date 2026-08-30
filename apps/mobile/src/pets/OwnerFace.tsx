// The FRONT face of the pet document — what the person responsible for the
// animal sees, composed the way the web's `CredentialFace` composes it:
// identity row (photo · name · breedLine · tags · QR) → Cumplimiento → Avisos
// → action footer, bound by labeled hairline dividers inside the chrome's
// framed sheet. (Two-face rewrite, PO decision 2026-08-28 — this file was
// `OwnerFaceScreen`, a standalone screen; the honesty rules below survived the
// recomposition unchanged.)
//
// THIS IS NOT THE PUBLIC CREDENTIAL, AND IT DOES NOT REPLACE IT.
// `CredentialScreen` renders the anonymous public document — identical for the
// owner and for a stranger who scanned the QR. That document is now a ROUTE
// (`publicCredentialRoute`), one tap from this face's QR block, exactly where
// the web puts it (`/p/{token}` behind the owner card's QR).
//
// EVERY SECTION FAILS ON ITS OWN. The payload wraps each one, and
// `unavailable` means the server could not read it — NOT that it is empty.
// "No hay recordatorios activos" is a fact; "No se pudo leer esta sección" is
// a different fact; and a section that rendered as an empty view would be
// telling the owner the first one while the server meant the second.
//
// CONTROLS WITHOUT A NATIVE DESTINATION ARE DRAWN DISABLED, NOT OMITTED. The
// web's action row and ⋯ Más sheet shape this document; omitting "Editar
// datos" because the app cannot edit would make the card look like a different
// product, which is the thing the PO ordered against ("1 solo perfil mobile
// native, lo más símil al web posible"). So the row renders — recognisably
// itself, visibly not available, with honest copy — the same doctrine
// `DISABLED_OPACITY`'s header records. A disabled control announces its state
// (`accessibilityState.disabled`) and its reason (the caption).

import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { publicCredentialPageUrl } from "../config/api";
import { CredentialQr } from "../credential/CredentialQr";
import { Icon } from "../ui/Icon";
import { Body, Card, Row, Unavailable } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { Callout } from "../ui/kit";
import {
  caretakerPetRoute,
  editPetRoute,
  lostModeRoute,
  publicCredentialRoute,
  recordEventRoute,
  returnPetRoute,
  sharesRoute,
  transferPetRoute,
} from "../ui/routes";
import { COLORS, LEADING, RADIUS, SPACE, TOUCH_TARGET, TRACKING, TYPE } from "../ui/theme";
import { FaceDivider, FaceSection } from "./DocumentChromeNative";
import {
  type OwnerFaceView,
  REMINDERS_EMPTY_LABEL,
  type SectionView,
  alertHeadline,
  alertTone,
  caretakerBannerLines,
  casesLine,
  complianceStampLabel,
  complianceSummaryLabel,
  registeredBadgeWord,
  rehomeBannerLine,
  reminderDueLabel,
  transitBannerLine,
  truncationNote,
} from "./owner-face-view-model";

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

export function OwnerCredentialFace({ view }: { view: OwnerFaceView }) {
  return (
    <>
      <FaceSection>
        <IdentityRow view={view} />
      </FaceSection>

      {/* ESTADO's unavailable arm. When the read WORKS the state's text lives
          exclusively in the band chip (the single state authority, per the
          web's PO decision 2026-07-16) — repeating it here would be the
          "estado repetido varias veces" the PO already flagged once. A FAILED
          read still says so: no chip is what "al día" looks like, and the two
          must never look alike. */}
      {view.status.state === "unavailable" ? (
        <FaceSection>
          <Unavailable title="Estado" message={view.status.message} />
        </FaceSection>
      ) : null}

      {/* CUMPLIMIENTO --------------------------------------------------- */}
      <FaceDivider icon="shield" label="Cumplimiento" />
      <FaceSection>
        {view.compliance.state === "unavailable" ? (
          <Unavailable title="Cumplimiento" message={view.compliance.message} />
        ) : (
          <View style={styles.stack}>
            <Text style={styles.stamp}>{complianceStampLabel(view.compliance.data)}</Text>
            <Body>{complianceSummaryLabel(view.compliance.data)}</Body>
            {view.compliance.data.cards.map((card) => (
              <Row key={card.key} label={card.label} value={card.state} />
            ))}
          </View>
        )}
      </FaceSection>

      {/* AVISOS ---------------------------------------------------------- */}
      {/* Already ranked by the server; a client that reorders this has
          reimplemented a product decision it cannot see the reasons for.
          An EMPTY strip renders no section at all — the web's caller passes
          null and no divider appears — while a FAILED read renders its
          refusal. Empty and unavailable must never look alike. */}
      {view.alerts.state === "unavailable" ? (
        <>
          <FaceDivider icon="alert" label="Avisos" />
          <FaceSection>
            <Unavailable title="Avisos" message={view.alerts.message} />
          </FaceSection>
        </>
      ) : view.alerts.data.items.length > 0 ? (
        <>
          <FaceDivider icon="alert" label="Avisos" />
          <FaceSection>
            <View style={styles.stack}>
              {view.alerts.data.items.map((alert) => (
                <Callout key={alert.id} tone={alertTone(alert)}>
                  <Text style={styles.calloutBody}>{alertHeadline(alert)}</Text>
                </Callout>
              ))}
            </View>
          </FaceSection>
        </>
      ) : null}

      {/* ACTION FOOTER --------------------------------------------------- */}
      <FaceDivider />
      <FaceSection>
        <ActionFooter view={view} />
      </FaceSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Identity row
// ---------------------------------------------------------------------------

/**
 * The web's phone identity layout (`@media (max-width: 720px)`): photo +
 * identity side by side, the name at 26px, and the QR on its OWN full-width
 * centered row below — a phone is always ≤720, so the desktop three-column
 * grid is never the reference here.
 *
 * THE QR ROW IS UNCONDITIONAL AND TAPPABLE. It renders from the token alone,
 * so a degraded identity read must not take down the one block that links to
 * the public document a stranger can already see. Tapping it opens the
 * public credential route — the QR was inert before this rewrite, and an
 * inert QR on a screen is a control-shaped decoration.
 */
function IdentityRow({ view }: { view: OwnerFaceView }) {
  const router = useRouter();

  const status = view.status.state === "ok" ? view.status.data : null;
  const situationActive = status?.situation != null;
  const showBadge = status?.petStatus === "active";
  const badgeWord = registeredBadgeWord(
    view.identity.state === "ok" ? view.identity.data.sex : null,
  );

  return (
    <View style={styles.idWrap}>
      {view.identity.state === "unavailable" ? (
        <Unavailable title="Identidad" message={view.identity.message} />
      ) : (
        <View style={styles.idRow}>
          <View style={styles.photo}>
            {view.identity.data.photoUrl ? (
              <Image
                source={{ uri: view.identity.data.photoUrl }}
                style={styles.photoImage}
                accessibilityIgnoresInvertColors
                accessible
                accessibilityLabel={`Foto de ${view.identity.data.name}`}
              />
            ) : (
              <View style={styles.photoEmpty}>
                <Icon name="paw" size="lg" color={COLORS.inkFaint} />
              </View>
            )}
          </View>
          <View style={styles.idMeta}>
            <View style={styles.nameRow}>
              <Text style={styles.petName}>{view.identity.data.name}</Text>
              {/* Default state: the registration badge sits beside the name.
                  With an active situation it is DEMOTED to the quiet marker
                  below — the situation (in the band chip) is the headline,
                  registration the footnote. The web's exact demotion. */}
              {showBadge && !situationActive ? (
                <View style={styles.badgeReg}>
                  <Icon name="check" size="sm" color={COLORS.accent} />
                  <Text style={styles.badgeRegText}>{badgeWord}</Text>
                </View>
              ) : null}
            </View>
            {showBadge && situationActive ? (
              <View style={styles.regQuiet}>
                <Icon name="check" size="sm" color={COLORS.inkMuted} />
                <Text style={styles.regQuietText}>{badgeWord}</Text>
              </View>
            ) : null}
            {view.identity.data.breedLine ? <Body>{view.identity.data.breedLine}</Body> : null}
            {view.identity.data.tags.length > 0 ? (
              <View style={styles.chipRow}>
                {view.identity.data.tags.map((tag) => (
                  <View key={tag.key} style={styles.chip}>
                    {tag.key === "loc" ? (
                      <Icon name="map-pin" size="sm" color={COLORS.inkSoft} />
                    ) : null}
                    <Text style={styles.chipText}>{tag.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver credencial pública"
        accessibilityHint="Abre el documento público que ve cualquier persona que escanea el código."
        onPress={() => router.push(publicCredentialRoute(view.publicToken))}
        style={styles.qrBlock}
      >
        <View style={styles.qrFrame}>
          <CredentialQr
            value={publicCredentialPageUrl(view.publicToken)}
            size={76}
            label={`Código QR de la credencial pública de ${view.publicToken}`}
          />
        </View>
        <Text style={styles.qrCaption}>
          <Text style={styles.qrCaptionStrong}>Credencial pública{"\n"}</Text>
          {view.publicToken}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Action footer
// ---------------------------------------------------------------------------

/**
 * The web's action row, with this app's destinations behind it — and the
 * web's rows drawn DISABLED where the app has none (see the header).
 *
 * WHAT IS OFFERED UNCONDITIONALLY, AND WHY, is inherited verbatim from the
 * screen this face used to be:
 *
 *   · Modo perdida — the cockpit serves both directions (marking lost and
 *     running the search), and WHICH of the five commands this caller may
 *     send is decided by the server and reported in that payload. A CTA that
 *     appeared only when this face happened to know the animal was lost would
 *     hide the entry point in the one state where somebody needs it fastest.
 *   · Compartir / Transferir — who may mint a link is decided by that
 *     payload's `capabilities`, and who may transfer by the transfer writer's
 *     own ownership check (the ACTIVE `role='owner'` row — a rule narrower
 *     than `viewer.role` can express). A CTA hidden on a guess would be this
 *     screen inventing a rule it cannot see; the server refuses and the
 *     cockpit renders the refusal.
 *   · Cuidador temporal — same shape: the rule is a DENY
 *     (`caretaker-sub-designation`) the server owns. And it sits BESIDE
 *     transferir, never folded into it: a transfer hands the animal over for
 *     good, a grant lends a bounded set of powers. A person who confused them
 *     would give away a pet they meant to lend.
 *   · Anotar — the write the libreta exists for; the server decides whether
 *     this caller may write.
 *
 * WHAT IS ROLE-GATED CLIENT-SIDE: only the DISABLED rows, because a dead
 * control has no server to refuse it. The gates mirror the web's own
 * (`deriveMasSheetItems`): a caretaker never sees Editar datos or Contactos
 * de emergencia; an org member gets Compartir and nothing owner-only.
 */
function ActionFooter({ view }: { view: OwnerFaceView }) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const isOrgViewer = view.viewerRole === "org_member";
  const isCaretaker = view.viewerRole === "caretaker";
  const petName = view.identity.state === "ok" ? view.identity.data.name : null;
  const nameParams = petName === null ? {} : { name: petName };

  if (isOrgViewer) {
    // The web's org action row: Compartir, read-only, and nothing else — no
    // capture, no ⋯ Más. The unconditional offers above are person-path
    // reasoning; an org member acts from the org portal.
    return (
      <View style={styles.actionRow}>
        <FaceAction
          icon="share"
          label="Compartir"
          onPress={() => router.push(sharesRoute(view.publicToken))}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.actionRow}>
        <FaceAction
          icon="libreta"
          label="Anotar"
          accessibilityHint="Asentar un evento en la libreta."
          onPress={() => router.push(recordEventRoute(view.publicToken))}
        />
        <FaceAction
          icon="share"
          label="Compartir"
          accessibilityHint="Crear o revocar links de la libreta, y mostrarla en la credencial pública."
          onPress={() => router.push(sharesRoute(view.publicToken))}
        />
        {isCaretaker ? null : (
          <FaceAction
            icon="edit"
            label="Editar datos"
            accessibilityHint="Cambiar el nombre, la raza y el color. Queda registrado en la libreta."
            onPress={() => router.push(editPetRoute(view.publicToken))}
          />
        )}
        <FaceAction
          icon="alert-triangle"
          label="Modo perdida"
          danger
          accessibilityHint="Marcar la mascota como perdida, seguir la búsqueda o marcarla encontrada."
          onPress={() => router.push(lostModeRoute(view.publicToken))}
        />
        <FaceAction
          icon="ellipsis"
          label="Más"
          expanded={moreOpen}
          onPress={() => setMoreOpen((open) => !open)}
        />
      </View>

      {moreOpen ? (
        <View style={styles.moreList}>
          <MoreRow
            label="Credencial pública"
            onPress={() => router.push(publicCredentialRoute(view.publicToken))}
          />
          <MoreRow
            label="Transferir la titularidad"
            accessibilityHint="Ofrecerle esta mascota a otra persona. No cambia nada hasta que acepte."
            onPress={() =>
              router.push({ pathname: transferPetRoute(view.publicToken), params: nameParams })
            }
          />
          <MoreRow
            label="Cuidador temporal"
            accessibilityHint="Dejarle la mascota a alguien de confianza por un tiempo, o terminar un cuidado en curso."
            onPress={() =>
              router.push({ pathname: caretakerPetRoute(view.publicToken), params: nameParams })
            }
          />
          {/* DEVOLUCIÓN — incondicional para todo holder por vía persona, y esa
              es una diferencia con la web que se declara en vez de esconderse.
              `deriveMasSheetItems` sólo agrega su fila "Confirmar devolución"
              cuando ya hay una propuesta pendiente, con lo cual el MODO DE
              INICIACIÓN de esa misma página —proponerle la devolución al refugio
              que te dio el animal en adopción, o al que te lo dio en tránsito—
              no se alcanza desde ninguna navegación del navegador. La capacidad
              existe en el servidor y en la página; lo que falta ahí es el enlace.

              LA FILA NO ADIVINA NADA. Qué se puede hacer lo contesta el servidor
              en `capabilities`, y los tres estados que no ofrecen nada dicen por
              qué. Es la misma regla que la fila de "Contactos de emergencia" de
              arriba: si el bloque al que lleva es accionable o no es del
              servidor, no de la fila. */}
          <MoreRow
            label="Devolución"
            accessibilityHint="Responder a quien quiere devolverte la mascota, o proponer devolvérsela a la organización que te la dio."
            onPress={() => router.push(returnPetRoute(view.publicToken))}
          />
          <MoreRow label="Chapa física" caption="Disponible en la web" />
          {isCaretaker ? null : (
            <>
              {view.viewerRole === "foster" ? (
                <MoreRow label="Buscar hogar" caption="Disponible en la web" />
              ) : (
                <MoreRow label="Acompañamiento de adopción" caption="Disponible en la web" />
              )}
              {/* THE SAME DESTINATION AS "Editar datos" above, and that is the
                  web's two `?sheet=` rows meeting a stack navigator: both
                  halves live on one screen there. The row survives as its own
                  entry point because the two promise different things — a
                  person looking for "a quién llamamos" is not looking to edit a
                  name — and because the web keeps it. Whether the block it
                  lands on is EDITABLE is the server's call, not this row's: a
                  co-owner and a foster reach it and are shown the reason
                  instead of a form. Only the caretaker is hidden here, which is
                  `deriveMasSheetItems`' own rule. */}
              <MoreRow
                label="Contactos de emergencia"
                accessibilityHint="El veterinario y la persona a la que llamamos por esta mascota."
                onPress={() => router.push(editPetRoute(view.publicToken))}
              />
            </>
          )}
          <MoreRow label="Viaje y movilidad" caption="Próximamente" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One labeled action pill — the web's `.ln-act` (icon + short text, bordered).
 *
 * With no `onPress` the pill is the honest-disabled rendering: same pill,
 * muted, announcing `disabled` — recognisably itself, visibly not available —
 * with the caption saying why. The computed state feeds the behaviour, the
 * styling and the announcement, so the three cannot disagree (the
 * SecondaryButton lesson).
 */
function FaceAction({
  icon,
  label,
  caption,
  danger = false,
  expanded,
  accessibilityHint,
  onPress,
}: {
  icon: string;
  label: string;
  caption?: string;
  danger?: boolean;
  expanded?: boolean;
  accessibilityHint?: string;
  onPress?: () => void;
}) {
  const isInert = onPress === undefined;
  const inkColor = isInert ? COLORS.inkMuted : danger ? COLORS.seal : COLORS.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={isInert}
      onPress={onPress}
      style={[styles.action, danger ? styles.actionDanger : null]}
    >
      <Icon name={icon} size="sm" color={inkColor} />
      <View>
        <Text style={[styles.actionLabel, { color: inkColor }]}>{label}</Text>
        {caption === undefined ? null : <Text style={styles.actionCaption}>{caption}</Text>}
      </View>
    </Pressable>
  );
}

/** One row of the expanded "Más" list. No `onPress` → honest-disabled row. */
function MoreRow({
  label,
  caption,
  accessibilityHint,
  onPress,
}: {
  label: string;
  caption?: string;
  accessibilityHint?: string;
  onPress?: () => void;
}) {
  const isInert = onPress === undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert }}
      disabled={isInert}
      onPress={onPress}
      style={styles.moreRow}
    >
      <Text style={isInert ? styles.moreRowLabelMuted : styles.moreRowLabel}>{label}</Text>
      {caption === undefined ? null : <Text style={styles.moreRowCaption}>{caption}</Text>}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// The sections the document does not carry
// ---------------------------------------------------------------------------

/** Renders a section, or its refusal. The two are never the same view. */
function Section<T>({
  view,
  title,
  children,
}: {
  view: SectionView<T>;
  title: string;
  children: (data: T) => React.ReactNode;
}) {
  if (view.state === "unavailable") {
    return <Unavailable title={title} message={view.message} />;
  }
  return <Card title={title}>{children(view.data)}</Card>;
}

/**
 * Everything the payload carries that the web's credential sheet does NOT
 * print on the document: reminders, arrangements, open cases, pregnancy, the
 * owner's other pets. On the web these live in other surfaces (reminder rows,
 * the ⋯ Más sheets, the carousel above the card); this app has no such
 * surfaces yet, and DROPPING a section the server read for us would be the
 * quiet data loss this file's honesty rules exist against. So they render as
 * plain cards BELOW the document — app content, not credential content, the
 * same separation the web draws ("el carousel lo quiero FUERA de la
 * credencial").
 */
export function OwnerExtraSections({ view }: { view: OwnerFaceView }) {
  return (
    <>
      {/* REMINDERS ------------------------------------------------------- */}
      <Section view={view.reminders} title="Recordatorios">
        {(reminders) =>
          reminders.items.length === 0 ? (
            <Body>{REMINDERS_EMPTY_LABEL}</Body>
          ) : (
            <>
              {reminders.items.map((reminder) => (
                <Row
                  key={reminder.reminderId}
                  label={reminder.title}
                  value={reminderDueLabel(reminder.daysUntilDue)}
                />
              ))}
              {/* A list that shows some of what exists must SAY so. */}
              {truncationNote(reminders.items.length, reminders.total, "recordatorios") ? (
                <Body>
                  {truncationNote(reminders.items.length, reminders.total, "recordatorios")}
                </Body>
              ) : null}
            </>
          )
        }
      </Section>

      {/* THE BANNERS ------------------------------------------------------ */}
      <Section view={view.banners} title="Arreglos">
        {(banners) => {
          const caretakerLines = caretakerBannerLines(banners);
          const rehome = rehomeBannerLine(banners);
          const transit = transitBannerLine(banners);
          if (caretakerLines.length === 0 && !rehome && !transit) {
            // A caretaker or a foster genuinely has no arrangements to see —
            // they are the titular's to make. Say which of the two this is
            // instead of leaving an unexplained gap that reads as a bug.
            return (
              <Body>
                {view.isTitular
                  ? "No hay arreglos activos."
                  : "Solo el titular ve los arreglos de esta mascota."}
              </Body>
            );
          }
          return (
            <>
              {transit ? <Body>{transit}</Body> : null}
              {caretakerLines.map((line) => (
                <Body key={line}>{line}</Body>
              ))}
              {rehome ? <Body>{rehome}</Body> : null}
            </>
          );
        }}
      </Section>

      {/* OPEN CASES ------------------------------------------------------- */}
      <Section view={view.cases} title="Trámites">
        {(cases) => <Body>{casesLine(cases)}</Body>}
      </Section>

      {/* PREGNANCY -------------------------------------------------------- */}
      <Section view={view.pregnancy} title="Preñez">
        {(pregnancy) =>
          pregnancy === null ? (
            <Body>No está preñada.</Body>
          ) : (
            <>
              <Row label="Comenzó" value={formatIsoDate(pregnancy.startedAt)} />
              <Row label="Parto estimado" value={formatIsoDate(pregnancy.expectedBirthAt)} />
              {pregnancy.weeksAtDiagnosis !== null ? (
                <Row label="Semanas al diagnóstico" value={String(pregnancy.weeksAtDiagnosis)} />
              ) : null}
            </>
          )
        }
      </Section>

      {/* THE CAROUSEL ----------------------------------------------------- */}
      {/* The server excludes THIS animal from both `items` and `total` — the
          section is the owner's OTHER pets and the contract says so. This
          screen used to filter it out for RENDERING and then branch and count
          on the unfiltered array, which produced the two states this file's
          own header forbids: a one-pet owner got a card containing literally
          nothing, and a nine-pet owner read "Mostrando 8 de 9" above seven
          rows. One list, filtered once, on the side that knows which animal is
          being read. */}
      <Section view={view.carousel} title="Tus otras mascotas">
        {(carousel) =>
          carousel.items.length === 0 ? (
            <Body>No tenés otras mascotas registradas.</Body>
          ) : (
            <>
              {carousel.items.map((item) => (
                <Row key={item.publicToken} label={item.name || item.publicToken} value="" />
              ))}
              {truncationNote(carousel.items.length, carousel.total, "mascotas") ? (
                <Body>{truncationNote(carousel.items.length, carousel.total, "mascotas")}</Body>
              ) : null}
            </>
          )
        }
      </Section>
    </>
  );
}

/**
 * An ISO instant as a plain Argentine date.
 *
 * `Intl` with an explicit time zone is what keeps this off the DEVICE's zone —
 * a phone travelling with its owner must not renumber an animal's dates.
 */
function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },

  // Identity row — the web's phone layout: photo + meta side by side, QR on
  // its own centered full-width row. The photo pokes up into the band
  // (negative margin), ringed in the card's white like the web's box-shadow
  // ring. 84 / -56 / 12 are the web's own `.ln-photo` values.
  idWrap: { gap: SPACE.md },
  idRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  photo: {
    width: 84,
    height: 84,
    marginTop: -56,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: COLORS.surface,
    backgroundColor: COLORS.stripe,
    overflow: "hidden",
    zIndex: 3,
  },
  photoImage: { width: "100%", height: "100%" },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  idMeta: { flex: 1, gap: SPACE.xs },
  nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  petName: {
    fontFamily: FONTS.serif,
    // The web's phone step for the credential name — globals.css
    // `@media (max-width: 720px) .ln-idname { font-size: 26px }`. Not a
    // named token on either side.
    fontSize: 26,
    lineHeight: 26 * 1.06,
    letterSpacing: 26 * TRACKING.tight,
    color: COLORS.ink,
  },
  badgeReg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.celeste100,
    backgroundColor: COLORS.focusRing,
  },
  badgeRegText: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * 0.12,
    textTransform: "uppercase",
    color: COLORS.accent,
  },
  regQuiet: { flexDirection: "row", alignItems: "center", gap: 6 },
  regQuietText: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * 0.12,
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.canvas2,
    borderColor: COLORS.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  chipText: { fontFamily: FONTS.mono, fontSize: TYPE.sm, color: COLORS.inkSoft },

  qrBlock: { alignItems: "center", gap: SPACE.xs, marginTop: SPACE.sm },
  qrFrame: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
    padding: SPACE.sm,
  },
  qrCaption: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    color: COLORS.inkMuted,
    textAlign: "center",
  },
  qrCaptionStrong: { fontFamily: FONTS.monoSemibold, color: COLORS.inkSoft },

  calloutBody: {
    fontFamily: FONTS.sans,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
    color: COLORS.ink,
  },
  stamp: {
    fontFamily: FONTS.monoSemibold,
    fontSize: TYPE.lg,
    letterSpacing: TYPE.lg * TRACKING.wide,
    color: COLORS.ink,
  },

  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  action: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface,
  },
  actionDanger: { borderColor: COLORS.dangerBorder },
  actionLabel: { fontFamily: FONTS.sansSemibold, fontSize: TYPE.md },
  actionCaption: { fontFamily: FONTS.sans, fontSize: TYPE.xs, color: COLORS.inkMuted },

  moreList: { gap: SPACE.xs },
  moreRow: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.canvas2,
  },
  moreRowLabel: { fontFamily: FONTS.sansMedium, fontSize: TYPE.md, color: COLORS.ink },
  moreRowLabelMuted: { fontFamily: FONTS.sans, fontSize: TYPE.md, color: COLORS.inkMuted },
  moreRowCaption: { fontFamily: FONTS.sans, fontSize: TYPE.sm, color: COLORS.inkFaint },
});
