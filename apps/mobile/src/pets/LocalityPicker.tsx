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
import { COLORS, LEADING, RADIUS, SPACE, TRACKING, TYPE } from "../ui/theme";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
/** The endpoint can return many; a phone screen can show a few honestly. */
const MAX_ROWS = 8;

type SearchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "results"; rows: LocalityV1[] }
  | { phase: "failed"; message: string };

export function LocalityPicker({
  provinceCode,
  localityName,
  onSelect,
}: {
  provinceCode: string;
  localityName: string;
  onSelect: (selection: { provinceCode: string; localityName: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });
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

  return (
    <>
      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Localidad elegida: ${localityName}, ${provinceCode}. Tocá para cambiarla.`}
          onPress={() => onSelect({ provinceCode: "", localityName: "" })}
          style={styles.selected}
        >
          <View style={styles.selectedText}>
            <Text style={styles.selectedName}>{localityName}</Text>
            <Text style={styles.selectedProvince}>{provinceCode}</Text>
          </View>
          <Text style={styles.selectedClear}>Cambiar</Text>
        </Pressable>
      ) : null}

      <TextField
        accessibilityLabel="Buscar localidad"
        autoCapitalize="words"
        autoCorrect={false}
        label="Localidad"
        onChangeText={setQuery}
        placeholder="Escribí el nombre de tu localidad"
        required
        value={query}
      />

      <SearchBody
        state={state}
        query={query}
        onPick={onSelect}
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
  onPick: (selection: { provinceCode: string; localityName: string }) => void;
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
              key={`${row.provinceCode}:${row.localitySlug}`}
              onPress={() =>
                onPick({ provinceCode: row.provinceCode, localityName: row.localityName })
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
