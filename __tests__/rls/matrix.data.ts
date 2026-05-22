// Matrix specification: role × table × operation → expected outcome.
//
// Source of truth for the RLS contract. Edited by hand when a new role,
// table, or operation joins the contract; consumed by `matrix.test.ts`
// as the assertion oracle.
//
// **Why TS and not YAML** (the §4.4 doctrine asked for YAML): a plain TS
// const buys us type-safety, autocomplete, and avoids adding `js-yaml` as
// a runtime dep just for one file. Conversion to `db/rls-matrix.yaml`
// later is mechanical if a non-developer needs to edit it.
//
// **Expected outcomes:**
//   - `allow`  — the operation surfaces rows / mutates state successfully.
//   - `deny`   — RLS blocks the operation (zero rows returned for SELECT,
//                zero rows inserted/updated/deleted for the others, OR
//                PostgREST returns a 42501-style error).
//   - `n/a`    — the combination is structurally impossible (e.g. INSERT
//                into a system-managed table where no policy permits any
//                authenticated write — currently marked deny instead).
//
// **Roles (resolved at test-time):**
//   - `anon`        — no signed-in session. The public surface.
//   - `owner`       — `owner@dim.test` (the seed's pet owner).
//   - `other_user`  — `vet@dim.test` (a different signed-in account that
//                     does NOT own the fixture pet).
//   - `admin`       — `admin@dim.test` (universal-scope role).
//
// **Fixture resource (the target of every cross-role probe):**
//   - The first pet owned by `owner@dim.test`, plus any pet_events /
//     ownerships / notifications tied to it.

export type RlsRole = "anon" | "owner" | "other_user" | "admin";
export type RlsOperation = "select" | "insert" | "update" | "delete";
export type RlsOutcome = "allow" | "deny";

export interface RlsCell {
  outcome: RlsOutcome;
  /** Free-form note explaining WHY this cell has its expected outcome. */
  reason?: string;
}

export type RlsTableMatrix = {
  [Role in RlsRole]: {
    [Op in RlsOperation]: RlsCell;
  };
};

export type RlsMatrix = Record<string, RlsTableMatrix>;

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

const deny = (reason: string): RlsCell => ({ outcome: "deny", reason });
const allow = (reason: string): RlsCell => ({ outcome: "allow", reason });

export const RLS_MATRIX: RlsMatrix = {
  pets: {
    anon: {
      select: deny("anon has no session — no read policy matches"),
      insert: deny("anon cannot insert pets"),
      update: deny("anon cannot mutate"),
      delete: deny("anon cannot delete"),
    },
    owner: {
      select: allow("owner can read own pets via ownerships join"),
      insert: deny("owner inserts pets only via server action (Drizzle bypasses RLS)"),
      update: allow("owner can update own pet metadata"),
      delete: deny("pets are never deleted from PostgREST"),
    },
    other_user: {
      select: deny("non-owner without org membership sees zero rows"),
      insert: deny("only the server action path can insert pets"),
      update: deny("non-owner cannot mutate other-user pets"),
      delete: deny("non-owner cannot delete"),
    },
    admin: {
      // PostgREST policies do NOT grant admin universal read on pets.
      // Admin access is exercised via /admin routes that use Drizzle
      // (service role), which bypasses RLS. So through supabase-js, admin
      // looks like any authenticated user without ownership.
      select: deny("admin universal scope is enforced in app code, not RLS"),
      insert: deny("admin uses server actions, not PostgREST direct insert"),
      update: deny("admin uses server actions, not PostgREST direct update"),
      delete: deny("admin uses server actions, not PostgREST direct delete"),
    },
  },

  pet_events: {
    anon: {
      select: deny("event log is private"),
      insert: deny("anon cannot append events"),
      update: deny("events are append-only — no UPDATE for anyone"),
      delete: deny("events are append-only — no DELETE for anyone"),
    },
    owner: {
      select: allow("owner sees events for own pets"),
      insert: deny("owners insert events only via server action"),
      update: deny("append-only invariant: even own events are immutable via PostgREST"),
      delete: deny("append-only invariant: even own events cannot be deleted"),
    },
    other_user: {
      select: deny("non-owner cannot read pet events"),
      insert: deny("only server actions append events"),
      update: deny("append-only"),
      delete: deny("append-only"),
    },
    admin: {
      select: deny("admin universal scope enforced in app code, not RLS"),
      insert: deny("admin uses server actions"),
      update: deny("append-only — admin too"),
      delete: deny("append-only — admin too"),
    },
  },

  ownerships: {
    anon: {
      select: deny("ownerships are private"),
      insert: deny("anon cannot seize a pet"),
      update: deny("anon cannot transfer custody"),
      delete: deny("anon cannot end ownership"),
    },
    owner: {
      select: allow("owner reads own ownership rows"),
      insert: deny("ownership transfers go through server actions"),
      update: deny("ownership mutations go through server actions"),
      delete: deny("ownership rows are never DELETEd — endedAt is set instead"),
    },
    other_user: {
      select: deny("non-owner cannot read other-user ownerships"),
      insert: deny("non-owner cannot create ownership over another user's pet"),
      update: deny("non-owner cannot mutate"),
      delete: deny("non-owner cannot delete"),
    },
    admin: {
      select: deny("admin via server actions; PostgREST sees no policy match"),
      insert: deny("admin via server actions"),
      update: deny("admin via server actions"),
      delete: deny("admin via server actions"),
    },
  },

  notifications: {
    anon: {
      select: deny("notifications are per-user private"),
      insert: deny("anon cannot seed notifications"),
      update: deny("anon cannot mutate"),
      delete: deny("anon cannot delete"),
    },
    owner: {
      select: allow("user reads own notifications"),
      insert: deny("notifications are server-side fanout only"),
      update: allow("user can mark own notifications as read/archive"),
      delete: deny("notifications are retained, not deleted"),
    },
    other_user: {
      select: deny("cannot read another user's notifications"),
      insert: deny("cannot create notifications for another user"),
      update: deny("cannot mutate another user's notifications"),
      delete: deny("cannot delete"),
    },
    admin: {
      select: deny("admin uses server actions, not PostgREST"),
      insert: deny("admin uses server actions"),
      update: deny("admin uses server actions"),
      delete: deny("admin uses server actions"),
    },
  },

  profiles: {
    anon: {
      select: deny("profiles are private"),
      insert: deny("profiles are created via the handle_new_user trigger"),
      update: deny("anon cannot edit profiles"),
      delete: deny("anon cannot delete"),
    },
    owner: {
      select: allow("user can read own profile"),
      insert: deny("profile created by trigger, not PostgREST"),
      update: allow("user can edit own profile"),
      delete: deny("profiles are retained (deactivated_at instead)"),
    },
    other_user: {
      select: deny("users cannot read other users' profiles"),
      insert: deny("no insert allowed"),
      update: deny("cannot edit other users' profiles"),
      delete: deny("cannot delete"),
    },
    admin: {
      select: deny("admin uses server actions to access profiles"),
      insert: deny("admin uses server actions"),
      update: deny("admin uses server actions"),
      delete: deny("admin uses server actions"),
    },
  },

  cases: {
    anon: {
      select: deny("cases are private"),
      insert: deny("anon cannot open cases"),
      update: deny("anon cannot mutate"),
      delete: deny("anon cannot delete"),
    },
    owner: {
      // Owner CAN read cases for own pets (except welfare_denuncia, which
      // hides from the subject). At least one open case exists in the
      // seed (e.g. rabies observation on a bite-incident demo pet), so
      // a non-empty owner read confirms the policy matches.
      select: allow("subject-pet owner sees own cases via can_read_case"),
      insert: deny("cases are opened via server actions, not PostgREST"),
      update: deny("case mutations go through server actions"),
      delete: deny("cases are not deleted"),
    },
    other_user: {
      select: deny("non-owner without org membership cannot read cases"),
      insert: deny("non-owner cannot open cases"),
      update: deny("non-owner cannot mutate"),
      delete: deny("non-owner cannot delete"),
    },
    admin: {
      // can_read_case() grants admin universal read. This is the ONE
      // table in the matrix where the admin role gets a true allow
      // through RLS (not via server-action bypass).
      select: allow("can_read_case() short-circuits to true for admin role"),
      insert: deny("admin opens cases via server actions"),
      update: deny("admin uses server actions"),
      delete: deny("cases are not deleted"),
    },
  },

  pet_achievement_views: {
    // Owner UX pulse rows. RLS: owner reads own rows; all writes go through
    // markAchievementSeenAction via Drizzle (service role, bypasses RLS).
    anon: {
      select: deny("anon has no session — no read policy matches"),
      insert: deny("anon cannot seed achievement views"),
      update: deny("anon cannot mutate"),
      delete: deny("no DELETE policy — write-once history"),
    },
    owner: {
      select: allow("owner reads own pulse rows via user_id = auth.uid() + ownerships join"),
      insert: deny("owner inserts via markAchievementSeenAction (Drizzle bypasses RLS)"),
      update: deny("owner updates via markAchievementSeenAction (Drizzle bypasses RLS)"),
      delete: deny("no DELETE policy — write-once history"),
    },
    other_user: {
      select: deny("owner-only isolation guarantee — other_user sees zero rows"),
      insert: deny("cannot seed another user's achievement views"),
      update: deny("cannot mutate another user's views"),
      delete: deny("no DELETE policy"),
    },
    admin: {
      select: deny("admin universal scope is enforced in app code, not RLS"),
      insert: deny("admin uses server actions"),
      update: deny("admin uses server actions"),
      delete: deny("no DELETE policy"),
    },
  },
};
