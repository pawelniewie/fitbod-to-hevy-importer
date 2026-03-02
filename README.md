# Fitbod → Hevy Import

Scripts to migrate workout history from a Fitbod CSV export into Hevy via its API.

## Prerequisites

- [Deno](https://deno.com) installed
- A Fitbod CSV export (`WorkoutExport.csv`) in this directory
- A [Hevy API key](https://hevy.com/settings?tab=developer)

## Setup

Copy the sample env file and add your Hevy API key:

```sh
cp .env.sample .env
```

Then edit `.env`:

```
HEVY_API_KEY=your_api_key_here
```

## Workflow

### Step 1 — Generate the exercise map template

Reads your CSV and outputs `exercise-map.ts` listing every unique exercise name:

```sh
deno task generate-map
```

### Step 2 — Generate the Hevy exercise list

Fetches all exercise templates from your Hevy account and writes `HEVY_EXERCISES.ts`, a typed constant with ALL_CAPS keys mapping to Hevy template IDs:

```sh
deno task generate-template-list
```

This produces entries like:

```ts
export const HEVY_EXERCISES: Record<string, string> = {
  RUNNING: "abc123-...",
  DUMBBELL_ROW: "def456-...",
  // ...
};
```

### Step 3 — Fill in the exercise map

Open `exercise-map.ts` and set each value to the matching `HEVY_EXERCISES` constant. Use your editor's autocomplete to browse available keys:

```ts
import { HEVY_EXERCISES } from './HEVY_EXERCISES.ts';

export const EXERCISE_MAP: Record<string, string> = {
  "Running": HEVY_EXERCISES.RUNNING,
  "Dumbbell Row": HEVY_EXERCISES.DUMBBELL_ROW,
  // ...
};
```

Any exercise left as `""` will be skipped during import.

### Step 4 — Run the import

```sh
deno task import
```

Workouts are sent one day at a time with a 1.5-second delay between requests to respect Hevy's rate limits.

## Files

| File | Purpose |
|------|---------|
| `.env` | Your Hevy API key (not committed) |
| `.env.sample` | Template for `.env` |
| `config.ts` | Loads env vars, CSV path, API base URL |
| `generate-map.ts` | Generates `exercise-map.ts` from the CSV |
| `generate-template-list.ts` | Fetches Hevy templates and writes `HEVY_EXERCISES.ts` |
| `HEVY_EXERCISES.ts` | Generated — ALL_CAPS constants mapping to Hevy template IDs |
| `exercise-map.ts` | Maps Fitbod exercise names → Hevy template IDs |
| `import.ts` | Main import script |
| `WorkoutExport.csv` | Your Fitbod data export (not committed) |
