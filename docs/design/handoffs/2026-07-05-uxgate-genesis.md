# Pre-launch UX gate — the "Génesis" run (from an empty world)

An alternative (and superior, for the coherence goal) to the fixture-cohort runbook. Instead of testing against a pre-seeded world, we **grow the world from empty** through real user actions, in the natural causal order. This tests the seams, the empty-states, the dependency chain, and — because it's one continuous story — the "does the whole thing hang together, does each screen say the JUST-necessary" judgment falls out for free.

## Precondition — an EMPTY server (not the full seed)
`pnpm db:reset && pnpm db:bootstrap` + create ONLY the first admin (`admin@dim.test`). No demo data. Then `pnpm build && pnpm start` → the gate runs on :3000. The world is built BY the test.

## The one honest tradeoff
A from-zero chain is a **RELAY, not independent parallelism** — each act depends on the previous one's output. So the two agents don't run isolated cohorts; they **pass a baton across role seams**. That's actually more faithful (it tests the handoffs). Less wall-clock parallel, much more coherence signal.

## The Génesis storyline (the causal chain — each act's precondition is the prior act's output)
1. **Bootstrap.** Admin logs in → provisions the first **Government** for a locality (jurisdiction). *(empty admin console → first entity)*
2. **A citizen is born.** A person signs up → registers their **first pet** → the credential (DIM-code) exists. *(the empty "mis mascotas" → first pet)*
3. **An organization appears.** A person registers a **refugio** (and/or a **clínica**) from `/cuenta` → it lands in the **verification queue** → **govt/admin verifies it**. *(SEAM: citizen creates → operator approves)*
4. **A professional is credentialed.** A person requests a **vet matrícula** upgrade → **govt approves** → the vet role + verified provenance is granted. *(SEAM)*
5. **Permissions flow.** The org grants a member **`event.write`** via the capability matrix (explicit, revocable). *(operator self-governance)*
6. **Life happens (the payoff — cross-POV seams):**
   - **Vaccine signature (the money shot):** the vet **signs** a vaccine on the owner's pet → the owner watches it flip **declarada → verificada (MP-xxxx)** → the govt's **rabies-coverage KPI moves**. *(owner → vet → owner → govt)*
   - **Rescue → adoption:** the org **intakes** a rescued dog → **publishes** it in `/adoptar` → a person **applies** → the org **reviews → finalizes** → the adopter **becomes the owner** (custody transfers, ledgered). *(org → public → org → new owner)*
   - **Bite → observation:** a bite is reported → a **10-day rabies observation** opens → the owner is notified → it closes.
   - **Lost → found:** a pet is marked lost → **public scan** → sighting → the owner marks found → the govt case opens and closes.
7. **Governance closes the loop (the punchline).** The admin/govt filters to **their locality**, sees the **specific data** they just generated (coverage, cases, the rescued+adopted pets), **acts on a rule** (a business rule / PPP classification / a compliance threshold), and **watches the system's behavior change** (the rule re-evaluates, notifications fire, a KPI/list shifts). This tests the event → projection → governance loop end-to-end.

At every act, apply the **sufficiency rubric** (¿sobra? ¿falta? ¿autocontenido? ¿de un vistazo? — from the fixture runbook) + a screenshot. The story either coheres or it doesn't.

## The two agents = a relay across the seam. Who owns which side
- **Operator agent (Cursor):** admin, government, org-verification, matrícula-approval, permission-grants, rule-action + KPI-watching. Owns acts 1, 3-approval, 4-approval, 5, and 7.
- **Citizen/org agent (Cowork):** the person(s), the pet owner, the org's operational side (intake/publish/finalize), the vet's clinical signing, the public paths. Owns acts 2, 3-register, 4-request, 6.
- They alternate as the baton passes (register → verify → grant → sign → …).

## The shared world-ledger (how the baton passes)
A single running file both agents append to — `docs/reviews/results/genesis-ledger.md` — recording every entity created and the token the next act needs:
```
[act 1] admin created GOVT: govt-caba-palermo (jurisdiction CABA/Palermo)
[act 2] citizen lucia@… registered → pet DIM-XXXX-XXXX (Chichila)
[act 3] refugio "Patitas" registered → ORG-token ORG-…  →  AWAITING VERIFY
[act 3✓] govt verified ORG-…  →  refugio active
[act 4] alejo@… requested matrícula MP-…  →  AWAITING APPROVE
...
```
The downstream agent reads the ledger, waits for the `AWAITING → ✓` it needs, then proceeds. This IS the handoff protocol.

## How you (the PO) interact with each agent
1. **Kick each agent once** with its side of the relay + the ledger path: *"You are the OPERATOR agent. Follow the Génesis runbook, acts 1/3-verify/4-approve/5/7. Read+append `genesis-ledger.md`. Wait for an `AWAITING` you own to be satisfied before that act. Screenshot + rubric each screen."* (same for the CITIZEN agent with its acts).
2. **You are the conductor at the seams.** Either let them poll the ledger and self-sync, or relay manually ("org verified — citizen agent, go request the matrícula"). Manual relay is safer for the first run.
3. **Watch the world grow** in the ledger — that growing file IS the test evidence.
4. **At the end, one synthesis** (a third agent, or you): read both addenda + the ledger, render the single verdict — did the story cohere, and did each screen say the *just-necessary* (nada de más, nada de menos)? PASS = zero blockers + the narrative never needed a doc or a guess to advance.

## Why this beats the fixture run for your goal
The fixture run maximizes *coverage breadth*. The Génesis run maximizes *coherence + sufficiency* — it walks the product the way a real locality would adopt it, so every gap in "the right amount of information, self-contained, at a glance, with its storyline" surfaces in context. Run Génesis first (the acceptance story); use the fixture matrix (other runbook) to mop up single-POV screen coverage after.
