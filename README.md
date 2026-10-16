# Fitbod → Hevy importer

Move your whole Fitbod workout history into [Hevy](https://hevy.com): every workout,
set, weight, rep, warm-up and timed hold, on the original dates. Fitbod exercises
without a Hevy equivalent become custom exercises, and those can get demo pictures too.

Scripts do the mechanical work. Picking the right Hevy exercise for each Fitbod one is a
judgement call, and so is driving the Hevy web app (the API can't do everything), so
this repo ships [Claude Code](https://claude.com/claude-code) skills that guide you
through those steps. Without Claude it all still works: you make the calls by hand.

Based on [Mark Bennett's fitbod-to-hevy-importer](https://tangled.org/markbennett.ca/fitbod-to-hevy-importer)
(the original importer, template list and config). This fork adds the reviewed mapping
pipeline, a shared mapping of ~300 Fitbod exercises, custom exercise creation, images,
and a re-runnable import.

## What you need

- **Hevy Pro**, for the API. Get a key at [Settings → Developer](https://hevy.com/settings?tab=developer).
- **Your Fitbod export.** Use "Export workout data" in the Fitbod app's settings. Save
  the CSV it produces as `data/WorkoutExport.csv`.
- [Deno](https://deno.com) 2.
- Optional: [Claude Code](https://claude.com/claude-code), and
  [agent-browser](https://github.com/vercel-labs/agent-browser) (`npx agent-browser`)
  for attaching images.

```sh
git clone https://github.com/pawelniewie/fitbod-to-hevy-importer
cd fitbod-to-hevy-importer
cp .env.sample .env        # then put your key in: HEVY_API_KEY=...
cp ~/Downloads/WorkoutExport.csv data/
```

## With Claude Code

```sh
claude
> /migrate
```

Claude checks what's done, runs the next script, reviews the results with you, and
stops for your OK before anything is written to your Hevy account.

## Steps

| # | Step | Who | Command |
|---|------|-----|---------|
| 1 | Fetch your Hevy exercise list | script | `deno task generate-template-list` |
| 2 | Suggest matches for exercises the shared mapping doesn't cover | script | `deno task suggest-map` |
| 3 | Review those into decisions | **Claude** / you | edit `data/exercise-decisions.ts` |
| 4 | Build and validate the map | script | `deno task build-map` |
| 5 | Create custom exercises | script | `deno task create-missing --dry-run`, then without `--dry-run` |
| 6 | Refresh the list and rebuild the map | script | `deno task generate-template-list && deno task build-map` |
| 7 | *Optional:* images for custom exercises | script + **Claude** | `deno task fetch-images`, then `src/attach-images.sh` |
| 8 | Import | script | `deno task import --dry-run`, then `deno task import` |

### Mapping decisions

`mappings/fitbod-hevy.ts` holds reviewed decisions for about 300 Fitbod built-in
exercises, so most people only need to review a handful. Your own decisions go in
`data/exercise-decisions.ts` and override the shared ones:

```ts
import { C, custom, type Decision, fix, ok, skip, variant } from "../src/decisions.ts";

export const DECISIONS: Record<string, Decision> = {
  "Barbell Bench Press": ok("BENCH_PRESS_BARBELL"),                  // same exercise
  "Hack Squat": fix("HACK_SQUAT_MACHINE"),                           // name match gets it wrong
  "Pause Front Squat": custom(C("Pause Front Squat (Barbell)", "weight_reps", "barbell", "quadriceps")),
  "Tuck Crunch": variant("CRUNCH", C("Tuck Crunch", "reps_only", "none", "abdominals")),
  "Pelvic Opener": skip("not importing"),
};
```

- **Keys** are Fitbod names exactly as they appear in the CSV.
- **`ok` / `fix` values** are keys of `data/HEVY_EXERCISES.ts`.
- **A `variant`** maps to its base Hevy exercise. If you did it at least 10 sets, it gets
  its own custom instead (`build-map --variants=builtin|custom|<n>`).
- **`build-map` checks your decisions:** every exercise needs a decision, every Hevy key
  must exist, and the data Fitbod logged must fit the exercise type. For example, it
  warns if timed sets would go to a reps exercise.

### Import

- **Workouts:** each Fitbod workout becomes one Hevy workout titled "Fitbod Import",
  starting at the time Fitbod recorded.
- **End time:** the CSV has no workout duration, so the end time is estimated at
  2.47 min per set. If you know real durations, put them in `data/fitbod-durations.json`
  as `{ "<Fitbod Date value>": minutes }`.
- **Re-running:** imported workouts are recorded in `data/imported.json`. Running again,
  for example with a newer export, sends only new workouts.
- **Fixing a mapping later:** `deno task import --update="<Fitbod exercise>"` rebuilds the
  workouts you already imported that contain that exercise, and overwrites them in Hevy.

## Good to know

- **No undo.** The Hevy API can't delete workouts or custom exercises, and an
  exercise's type (reps, weight × reps, duration…) can never be changed. Check the dry
  runs; to undo, you delete things by hand in the app.
- **Images are yours to keep, not to share.** `fetch-images` downloads Fitbod's demo
  pictures for your own account. Everything personal stays in `data/`, which git
  ignores.
- **The upload script depends on Hevy's web UI.** The API has no image field, so images
  are uploaded through the web app with agent-browser. If Hevy changes its UI, the
  script needs adjusting.

## Contributing

Mapped a Fitbod exercise that `mappings/fitbod-hevy.ts` doesn't cover, or found a wrong
call? Open a PR. With Claude Code, ask it to contribute your decisions back; the
`review-mapping` skill knows how.

## Files

| Path | What |
|------|------|
| `src/` | Scripts: `generate-template-list`, `suggest-map`, `build-map`, `create-missing`, `fetch-images`, `import`, `attach-images.sh` |
| `src/decisions.ts` | Decision types and helpers |
| `mappings/fitbod-hevy.ts` | Shared Fitbod → Hevy decisions |
| `.claude/skills/` | Claude Code skills: `migrate`, `review-mapping`, `exercise-images` |
| `data/` | Your files, git-ignored: export, `HEVY_EXERCISES.ts`, `hevy-templates.json`, `exercise-decisions.ts`, `exercise-map.ts`, `missing.json`, `imported.json`, images |

## License

MIT for the changes in this fork; see [LICENSE](LICENSE). The files that come from
[the original repository](https://tangled.org/markbennett.ca/fitbod-to-hevy-importer)
had no license when this fork was made; their copyright stays with Mark Bennett.

Not affiliated with Fitbod or Hevy.
