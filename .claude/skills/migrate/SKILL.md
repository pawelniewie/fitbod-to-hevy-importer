---
name: migrate
description: Walk the user through moving their Fitbod workout history into Hevy end to end — template list, exercise mapping review, custom exercises, images, import. Use when the user says "migrate", "import my Fitbod data", "move from Fitbod to Hevy", or asks what to do next in this repo.
---

# Migrate Fitbod → Hevy

Drive the pipeline one step at a time. Work out where the user is from the files in
`data/`, run the next step, explain the result in a few lines, and move on. Scripts do
the mechanical work; you do the judgement calls in between.

## Rules

- **Nothing reaches the user's Hevy account without an explicit "go" for that step.**
  The API cannot delete workouts or custom exercises, and a custom exercise's type can
  never be changed. Show what will be sent (a dry run) first.
- Personal files stay in `data/` (git-ignored). Never commit them or paste their contents
  anywhere outside this machine.
- Speak the user's language. Keep updates short: what ran, what it found, what's next.

## Steps

Check state with `ls data/` and pick the first step that isn't done.

0. **Setup.** Need `deno`, a `.env` with `HEVY_API_KEY=` (Hevy Pro → Settings →
   Developer, https://hevy.com/settings?tab=developer), and the Fitbod export at
   `data/WorkoutExport.csv` ("Export workout data" in the Fitbod app's settings). Ask
   the user for whichever is missing; never ask them to paste the API key into the
   chat — have them edit `.env` themselves.

1. **Template list** `[script]` — `deno task generate-template-list`.
   Writes `data/HEVY_EXERCISES.ts` and `data/hevy-templates.json`. Re-run after creating
   custom exercises.

2. **Mapping** `[Claude]` — `deno task suggest-map`, then follow the `review-mapping`
   skill until `deno task build-map` reports no problems. Most Fitbod built-ins are
   already decided in `mappings/fitbod-hevy.ts`; only the rest need review.

3. **Custom exercises** `[script, gated]` — `deno task create-missing --dry-run`.
   Summarise the list (count, titles, types). Point out anything timed that isn't a
   duration type, or weighted that is `reps_only`. On "go":
   `deno task create-missing`, then `deno task generate-template-list` and
   `deno task build-map` (the map now points at the new templates). If the API returns
   403, the account has hit Hevy's custom exercise limit.

4. **Images** `[optional]` — offer it: custom exercises have no picture in Hevy. If
   wanted, follow the `exercise-images` skill. It needs agent-browser
   (`npx agent-browser`) and a one-time Hevy web login. Skipping it is fine.

5. **Import** `[script, gated]` — `deno task import --dry-run`, then inspect
   `data/dry-run.json`:
   - workout count and date range match the CSV;
   - no exercise with all-zero sets (wrong type mapped), e.g. with
     `jq '[.[].workout.exercises[] | select(all(.sets[]; (.weight_kg//0)==0 and (.reps//0)==0 and (.duration_seconds//0)==0 and (.distance_meters//0)==0))] | length' data/dry-run.json`;
   - the "Skipped (not mapped)" list contains only what the user chose to skip.
   On "go": `deno task import`. It sends one workout per 1.5 s, writes each to
   `data/imported.json`, and re-runs skip what's already in. Run it in the background
   for large histories and report progress.

6. **Later fixes** — if a mapping changes after import, fix the decision, run
   `deno task build-map`, back up the affected workouts
   (`GET /v1/workouts/{id}` for each id in `data/imported.json` that contains the
   exercise), then `deno task import --update="<Fitbod exercise name>"`, which PUTs the
   rebuilt workouts in place. A newer Fitbod export can be imported the same way: only
   new workouts are sent.

## Finish

Summarise: workouts and sets imported, customs created, images attached, anything
skipped. If the user added decisions in `data/exercise-decisions.ts` for Fitbod built-in
exercises, offer to contribute them to `mappings/fitbod-hevy.ts` (see `review-mapping`).
