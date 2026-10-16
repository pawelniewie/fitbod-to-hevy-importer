# Fitbod → Hevy importer

Moves a Fitbod workout history (CSV export) into Hevy through its API. Deno scripts in
`src/`, run via `deno task <name>` from the repo root. When the user wants to migrate, or
asks what's next, use the `migrate` skill; it calls `review-mapping` and
`exercise-images` along the way.

## Rules

- `data/` holds the user's personal files (export, generated maps, ledger, images) and
  is git-ignored, along with `.env` and `tmp/`. Never commit, upload or paste them.
- Writes to the user's Hevy account (create-missing, import, attach-images) need their
  explicit go-ahead for that step, after a dry run. The API has no delete, and custom
  exercise types are permanent.
- Change mappings in `data/exercise-decisions.ts` (or `mappings/fitbod-hevy.ts` when
  contributing), never in the generated `data/exercise-map.ts`.

## Hevy API notes

- Base `https://api.hevyapp.com/v1`, header `api-key`, requires Hevy Pro. Spec:
  https://api.hevyapp.com/docs/ (the OpenAPI JSON is embedded in `docs/swagger-ui-init.js`).
- `GET /exercise_templates` reports types `bodyweight_weighted` / `bodyweight_assisted`;
  `POST` expects `bodyweight_reps` / `bodyweight_assisted_reps`.
- `POST /exercise_templates` body is `{ exercise: { title, exercise_type,
  equipment_category, muscle_group, other_muscles } }`. No image field, no delete.
- Workouts: `POST /workouts`, `PUT /workouts/{id}`, no delete. `distance_meters` and
  `duration_seconds` must be integers; set `type` is `normal|warmup|failure|dropset`.
