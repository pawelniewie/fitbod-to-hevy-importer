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

Reads your CSV and outputs an `exercise-map.ts` file listing every unique exercise name:

```sh
deno task generate-map
```

### Step 2 — Get your Hevy exercise template IDs

Fetches all exercise templates from your Hevy account and prints them as mappable key/value pairs:

```sh
deno task get-templates
```

### Step 3 — Fill in the exercise map

Open `exercise-map.ts` and paste in the Hevy template ID for each exercise. Any exercise left as an empty string will be skipped during import.

```ts
export const EXERCISE_MAP: Record<string, string> = {
  "Running": "abc123",
  "Dumbbell Row": "def456",
  // ...
};
```

### Step 4 — Run the import

```sh
deno task import
```

Workouts are sent one day at a time with a 1.5-second delay between requests to respect Hevy's rate limits. Exercises not found in the map are skipped with a warning.

## Files

| File | Purpose |
|------|---------|
| `.env` | Your Hevy API key (not committed) |
| `.env.sample` | Template for `.env` |
| `config.ts` | Loads env vars, CSV path, API base URL |
| `generate-map.ts` | Generates `exercise-map.ts` from the CSV |
| `get-templates.ts` | Lists Hevy exercise templates and their IDs |
| `exercise-map.ts` | Maps Fitbod exercise names → Hevy template IDs |
| `import.ts` | Main import script |
| `WorkoutExport.csv` | Your Fitbod data export (not committed) |
