// The locality typeahead — and the only place this app asks the server "what
// exists".
//
// WHY THERE IS NO PROVINCE DROPDOWN
// ---------------------------------------------------------------------------
// `POST /api/v1/pets` needs `provinceCode` AND `localityName`, and the obvious
// design — pick a province, then a locality inside it — needs a hardcoded list
// of the 24 jurisdictions in this app. That list is a CATALOG whose authority is
// a database table (`normalizeLocationForWrite` resolves against it in `strict`
// mode and refuses anything it cannot match), and `@dim/contract/reference` is
// explicit about the boundary: a catalog a client can render is fine; a decision
// the server must resolve per jurisdiction is not.
//
// So there is one field. A `/api/v1/localities` result already carries BOTH
// halves — `localityName` and `provinceCode` — and selecting a row copies them
// straight into the draft. The app never forms an opinion about which pairs are
// legal, which is exactly what stops it drifting from the table.
//
// THE SHORT-QUERY RULE IS THE SERVER'S, THE DEBOUNCE IS OURS
// ---------------------------------------------------------------------------
// The endpoint answers `results: []` for a query under two characters rather
// than refusing, so this component does not re-implement that check — the day
// the server relaxes it, this keeps working. What it does decide is when to
// SPEND a request: one per 300ms of quiet, and none at all under two characters,
// because a round trip per keystroke burns a 60/min per-IP budget on a person
// who has typed "Pa".

import type { LocalityV1 } from "@dim/contract/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { apiFailureMessage } from "../api/client";
import { searchLocalities } from "../api/endpoints";
import { Body, ErrorNotice, Loading } from "../ui/components";
import { FONTS } from "../ui/fonts";
import { TextField } from "../ui/kit";
import { COLORS, LEADING, RADIUS, SPACE, TOUCH_TARGET, TRACKING, TYPE } from "../ui/theme";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
/** The endpoint can return many; a phone screen can show a few honestly. */
const MAX_ROWS = 8;

type SearchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "results"; rows: LocalityV1[] }
  | { phase: "failed"; message: string };

/**
 * What selecting a row hands back.
 *
 * BOTH HALVES OF THE PROVINCE, and the second one is not redundant. `POST
 * /api/v1/pets` and the mudanza command take `provinceCode` (`"AR-B"`), because
 * they resolve against `ar_localities` in `strict` mode. The TURNO SEARCH takes
 * the province NAME (`"Buenos Aires"`), because it matches
 * `service_offerings.jurisdiction_province`, which stores the display name — the
 * web's own filter form submits `result.provinceName` for exactly that reason
 * (`SearchFiltersForm.tsx`). One picker feeding both means carrying both, and a
 * consumer picking the wrong one gets an empty search rather than an error, which
 * is the failure mode worth spending a field to avoid.
 *
 * AND THE INDEC ID, which is what makes the choice mean anything
 * (A2-alta-asentar-03). This picker disambiguates homonyms by showing the
 * DEPARTMENT — there are several San Martín in one province — and then handed
 * back only the name, so the server's name lookup stored the alphabetically
 * first department regardless of the row tapped. Carrying the id is what makes
 * the two rows the person is choosing between actually different.
 */
export type LocalitySelection = {
  provinceCode: string;
  provinceName: string;
  localityName: string;
  /** INDEC's id for the row that was tapped. The server resolves THIS one. */
  localityIndecId: string;
  /** For a chip that says WHICH homonym was chosen. Null for CABA barrios. */
  departmentName: string | null;
};

export function LocalityPicker({
  provinceCode,
  localityName,
  onSelect,
  required = true,
}: {
  provinceCode: string;
  localityName: string;
  onSelect: (selection: LocalitySelection) => void;
  /**
   * Whether the field announces itself as obligatorio. TRUE BY DEFAULT because
   * two of the three call sites are writes — the alta and the mudanza both
   * refuse to submit without a locality — and a default that lied about the
   * common case is the failure this prop exists to fix, in reverse.
   *
   * The turno search passes `false`: there the locality is a ZONE FILTER a
   * person may skip, and the server picks a default for them. Telling a screen
   * reader that an optional filter is obligatorio is not a cosmetic slip — it
   * is the app instructing somebody to fill in a field they are free to leave
   * alone, in the one modality where the visible screen cannot correct it.
   */
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });
  /** The department of the row THIS picker last selected — see the chip below. */
  const [pickedDepartment, setPickedDepartment] = useState<string | null>(null);
  const generation = useRef(0);

  const run = useCallback(async (text: string) => {
    const mine = ++generation.current;
    setState({ phase: "searching" });
    const result = await searchLocalities({ q: text });
    // A slower earlier request must not overwrite a faster later one — the
    // classic typeahead bug, where deleting a character brings back the results
    // for the longer query.
    if (mine !== generation.current) return;

    if (result.outcome !== "ok") {
      setState({
        phase: "failed",
        message: apiFailureMessage(result) ?? "No pudimos buscar localidades.",
      });
      return;
    }
    setState({ phase: "results", rows: result.payload.results.slice(0, MAX_ROWS) });
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      generation.current += 1; // cancel anything in flight
      setState({ phase: "idle" });
      return;
    }
    const timer = setTimeout(() => void run(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  const selected = provinceCode.length > 0 && localityName.length > 0;
  const where = pickedDepartment === null ? provinceCode : `${pickedDepartment} · ${provinceCode}`;

  // A PICKER WITH A CHOICE SHOWS THE CHOICE, NOT THE CATALOGUE. Reported from a
  // real Android on 2026-09-11, and the breed picker in `app/alta.tsx` had the
  // identical defect: after tapping a locality the chip appeared, and the search
  // field and its result rows stayed below it. The rows pushed "Continuar" off
  // the screen, so the person could neither see that the choice had taken nor
  // reach the way forward.
  //
  // The list was not staying open "in case you change your mind" — changing it
  // has its own control, and it says "Cambiar". A catalogue rendered underneath
  // an answer invites the reading that nothing was chosen yet.
  if (selected) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Localidad elegida: ${localityName}, ${where}. Tocá para cambiarla.`}
        onPress={() => {
          setPickedDepartment(null);
          onSelect({
            provinceCode: "",
            provinceName: "",
            localityName: "",
            localityIndecId: "",
            departmentName: null,
          });
        }}
        style={styles.selected}
      >
        <View style={styles.selectedText}>
          <Text style={styles.selectedName}>{localityName}</Text>
          {/* THE DEPARTMENT, when this picker is the one that chose the row
              (A2-alta-asentar-03). The list disambiguates homonyms by
              department and the chip then showed only the province code, so the
              person could not check that the San Martín on the confirm screen
              was the San Martín they tapped. Held in this component's own state
              rather than threaded through four callers' drafts: on a remount the
              chip falls back to the province, which is what it always said. */}
          <Text style={styles.selectedProvince}>{where}</Text>
        </View>
        <Text style={styles.selectedClear}>Cambiar</Text>
      </Pressable>
    );
  }

  return (
    <>
      {/* NO explicit `accessibilityLabel` (CA-M2, WCAG 2.5.3 "Label in Name").
          It said "Buscar localidad" while the visible label said "Localidad",
          so a person driving the phone by voice who read the screen and said
          "Localidad" named a control the system could not match. The kit
          derives the name from the visible label and adds ", obligatorio" WHEN
          THE FIELD IS ONE; the verb the old name carried is in the placeholder,
          where it belongs. */}
      <TextField
        autoCapitalize="words"
        autoCorrect={false}
        label="Localidad"
        onChangeText={setQuery}
        placeholder="Escribí el nombre de tu localidad"
        required={required}
        value={query}
      />

      <SearchBody
        state={state}
        query={query}
        onPick={(selection) => {
          setPickedDepartment(selection.departmentName);
          // COLLAPSE THE SEARCH. Without these three lines the rows stayed on
          // screen under the chip and pushed the form's next button out of
          // reach. Cancelling the generation matters as much as clearing the
          // text: a response already in flight would otherwise land after the
          // choice and repopulate the list nobody asked to see again.
          generation.current += 1;
          setQuery("");
          setState({ phase: "idle" });
          onSelect(selection);
        }}
        onRetry={() => void run(query.trim())}
      />
    </>
  );
}

function SearchBody({
  state,
  query,
  onPick,
  onRetry,
}: {
  state: SearchState;
  query: string;
  onPick: (selection: LocalitySelection) => void;
  onRetry: () => void;
}) {
  switch (state.phase) {
    case "idle":
      return (
        <Body>
          {query.trim().length === 0
            ? "La provincia se completa sola cuando elegís la localidad."
            : "Escribí al menos dos letras."}
        </Body>
      );
    case "searching":
      return <Loading label="Buscando…" />;
    case "failed":
      // Not an empty result list. A failed search that renders as "no
      // encontramos nada" tells the user their town does not exist.
      return <ErrorNotice message={state.message} onRetry={onRetry} />;
    case "results":
      if (state.rows.length === 0) {
        return (
          <Body>
            No encontramos ninguna localidad con ese nombre. Probá con menos letras o con el nombre
            oficial.
          </Body>
        );
      }
      return (
        <>
          {state.rows.map((row) => (
            <Pressable
              accessibilityRole="button"
              // THE INDEC ID, not the slug. Two homonyms in one province share a
              // slug — that is what makes them homonyms — so the old key
              // collided on exactly the rows this list exists to tell apart, and
              // React reconciled two different localities as one.
              key={row.indecId ?? `${row.provinceCode}:${row.localitySlug}:${row.departmentName}`}
              onPress={() =>
                onPick({
                  provinceCode: row.provinceCode,
                  provinceName: row.provinceName,
                  localityName: row.localityName,
                  // `""` for a row whose catalogue id is null — the field is
                  // nullable on the wire and the server falls back to the pair.
                  localityIndecId: row.indecId ?? "",
                  departmentName: row.departmentName,
                })
              }
              style={styles.option}
            >
              <Text style={styles.optionName}>{row.localityName}</Text>
              {/* The department disambiguates the many homonyms — there are
                  several "San Martín" in one province, and a picker that shows
                  only the name makes the user guess. */}
              <Text style={styles.optionWhere}>
                {row.departmentName === null
                  ? row.provinceName
                  : `${row.departmentName} · ${row.provinceName}`}
              </Text>
            </Pressable>
          ))}
        </>
      );
  }
}

const styles = StyleSheet.create({
  option: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    gap: 2,
  },
  optionName: { fontFamily: FONTS.sansSemibold, color: COLORS.ink, fontSize: TYPE.base },
  optionWhere: {
    fontFamily: FONTS.sans,
    color: COLORS.inkMuted,
    fontSize: TYPE.md,
    lineHeight: TYPE.md * LEADING.md,
  },
  // The chosen row is the institutional blue, not ink: a filled selection is an
  // ACTION's result, and blue is what this design gives to actions.
  selected: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  selectedText: { gap: 2 },
  selectedName: { fontFamily: FONTS.sansSemibold, color: COLORS.surface, fontSize: TYPE.base },
  selectedProvince: {
    fontFamily: FONTS.mono,
    color: COLORS.surface,
    fontSize: TYPE.xs,
    letterSpacing: TYPE.xs * TRACKING.wider,
    opacity: 0.85,
  },
  selectedClear: { fontFamily: FONTS.sansMedium, color: COLORS.surface, fontSize: TYPE.md },
});
