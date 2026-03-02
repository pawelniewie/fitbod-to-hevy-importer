# Fitbod → Hevy Import

Scripts to migrate workout history from a Fitbod CSV export into Hevy via its API.

## Prerequisites

- [Deno](https://deno.com) installed
- A Fitbod CSV export (`WorkoutExport.csv`) in this directory
- A [Hevy API key](https://hevy.com/settings?tab=developer)

## Setup

Add your Hevy API key to [config.tsm](config.tsm):

```ts
export const HEVY_API_KEY = 'your-key-here';
```

## Workflow

### Step 1 — Generate the exercise map template

Reads your CSV and outputs a `exercise-map.tsm` file listing every unique exercise name:

```sh
deno run --allow-read generate-map.tsm
```

### Step 2 — Get your Hevy exercise template IDs

Fetches all exercise templates from your Hevy account and prints them as mappable key/value pairs:

```sh
deno run --allow-net get-templates.tsm
```

### Step 3 — Fill in the exercise map

Open `exercise-map.tsm` and paste in the Hevy template ID for each exercise. Any exercise left as an empty string will be skipped during import.

```ts
export const EXERCISE_MAP: Record<string, string> = {
  "Running": "abc123",
  "Dumbbell Row": "def456",
  // ...
};
```

### Step 4 — Run the import

```sh
deno run --allow-read --allow-net import.tsm
```

Workouts are sent one day at a time with a 1.5-second delay between requests to respect Hevy's rate limits. Exercises not found in the map are skipped with a warning.

## Files

| File | Purpose |
|------|---------|
| `config.tsm` | API key, CSV path, API base URL |
| `generate-map.tsm` | Generates `exercise-map.tsm` from the CSV |
| `get-templates.tsm` | Lists Hevy exercise templates and their IDs |
| `exercise-map.tsm` | Maps Fitbod exercise names → Hevy template IDs |
| `import.tsm` | Main import script |
| `WorkoutExport.csv` | Your Fitbod data export |
