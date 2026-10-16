---
name: review-mapping
description: Decide which Hevy exercise each Fitbod exercise maps to, writing data/exercise-decisions.ts until build-map passes. Use when build-map reports "no decision for", when reviewing exercise-map.suggested.ts, when the user disagrees with a mapping, or when contributing decisions back to mappings/fitbod-hevy.ts.
---

# Review the Fitbod → Hevy exercise mapping

Name matching alone gets equipment and variants wrong (Fitbod "Hack Squat" is the sled
machine, Hevy "Hack Squat" is barbell). Every Fitbod exercise needs a reviewed decision.

## Where decisions live

- `mappings/fitbod-hevy.ts` — shared seed, ~300 Fitbod built-ins. Don't edit it during a
  migration.
- `data/exercise-decisions.ts` — the user's own. Overrides the seed entry by entry.
  Create it if missing:

```ts
import { ask, C, custom, type Decision, fix, ok, skip, variant } from "../src/decisions.ts";

export const DECISIONS: Record<string, Decision> = {
  // "Fitbod name": ok("HEVY_KEY"),
};
```

Statuses and helpers are documented in `src/decisions.ts`. `hevy` values are keys of
`data/HEVY_EXERCISES.ts`.

## Process

1. `deno task suggest-map` — lists only exercises with no decision, most-used first, with
   name-match candidates, in `data/exercise-map.suggested.ts`.
2. For each, gather evidence before deciding:
   - **What Fitbod logged**: count sets with weight / reps / duration / distance from the
     CSV (columns `Exercise`, `Reps`, `Weight(kg)`, `Duration(s)`, `Distance(m)`). This
     decides the exercise type.
   - **What the Fitbod exercise is**: `https://fitbod.me/exercises/<slug>` (lowercase,
     non-alphanumerics → `-`). The page and its demo image show equipment and setup.
     No page usually means the user created it in Fitbod — ask them.
   - **Hevy candidates**: search `data/hevy-templates.json` by words, not just the top
     fuzzy match (`jq -r '.[] | select(.title|test("curl";"i")) | "\(.title) · \(.type) · \(.equipment)"'`).
     Compare equipment, one- vs two-arm, and type.
3. Decide:
   - `ok` / `fix` — same movement and equipment exists.
   - `variant(base, C(...))` — Hevy has only the base movement (pause, tempo, stance,
     grip). build-map maps it to the base unless it has ≥10 sets (`--variants=<n>`,
     `builtin`, `custom`), then creates the custom. Ask the user if they care about
     separate history.
   - `custom(C(...))` — nothing usable. Title in Hevy style: `Movement (Equipment)`.
     Check the title doesn't already exist in `hevy-templates.json`.
   - `skip` — only if the user says so (e.g. a one-off they'll never do again).
   - `ask` — park it with a question; it stays unmapped until answered.
4. Pick the custom type from the logged data, since it can't be changed later:
   timed holds and stretches → `duration`; weight + time → `weight_duration`;
   weight + distance (carries) → `short_distance_weight`; distance + time →
   `distance_duration`; reps with some weighted sets → `weight_reps`, not `reps_only`
   (that drops the weight). Equipment: `none barbell dumbbell kettlebell machine plate
   resistance_band suspension other`. Muscles: `abdominals shoulders biceps triceps
   forearms quadriceps hamstrings calves glutes abductors adductors lats upper_back traps
   lower_back chest cardio neck full_body other`. If the API rejects a value, the 400
   response says why.
5. Batch the questions. Ask the user only what evidence can't settle — their own Fitbod
   exercises, how they actually performed something — several at a time with your best
   guess for each. Screenshots from the Fitbod app are the fastest answer.
6. `deno task build-map` and fix every reported problem: missing decisions, unknown Hevy
   keys, and type mismatches ("sets are timed but type counts reps", "weighted but type
   is reps-only").

On claude.ai with Artifacts available, a side-by-side review page (Fitbod demo vs Hevy
thumbnail, approve/flag + note) is a quicker way for the user to check dozens of calls.
In the terminal, list them in compact groups instead.

## Contributing back

Decisions in `data/exercise-decisions.ts` for Fitbod **built-in** exercises (they have a
fitbod.me page) help the next person. Offer to move them into `mappings/fitbod-hevy.ts`
(sorted by name, neutral notes, no personal data, no exercises the user created in
Fitbod) and open a PR to the upstream repo. Run `deno task build-map` before and after to
confirm nothing changed for the user.
