// import.ts
//
//   deno task import -- --dry-run                 # build every payload into dry-run.json, send nothing
//   deno task import                              # import everything not yet imported
//   deno task import -- --csv=data/Other.csv      # a different export
//   deno task import -- --update="Exercise Name"   # re-send imported workouts containing it (after a map change)
//
// One Hevy workout per Fitbod workout (rows sharing a Date timestamp), starting at
// Fitbod's recorded time. The CSV has no workout duration, so it ends after the real
// duration from data/fitbod-durations.json ({ "<Fitbod Date>": minutes }, optional) or,
// failing that, MIN_PER_SET per set. Sets are shaped by the Hevy template's exercise type,
// so a weighted hold sends weight + time and a bodyweight exercise sends no weight.
// Imported workouts are recorded in data/imported.json and skipped on re-runs.
import * as fs from 'node:fs';
import { DATA, FITBOD_CSV_PATH as CSV_PATH, HEVY_API_KEY, HEVY_API_BASE } from './config.ts';
import { EXERCISE_MAP } from '../data/exercise-map.ts';

const arg = (name: string) => Deno.args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const DRY_RUN = Deno.args.includes('--dry-run');
const LEDGER = `${DATA}/imported.json`;
const DURATIONS_PATH = `${DATA}/fitbod-durations.json`;
const DELAY_MS = 1500;
// Median pace across 116 real Fitbod workouts with a known duration (p10–p90: 1.9–3.1)
const MIN_PER_SET = 2.47;
const DURATIONS: Record<string, number> = fs.existsSync(DURATIONS_PATH)
  ? JSON.parse(fs.readFileSync(DURATIONS_PATH, 'utf-8'))
  : {};

// --- Types ---
type HevySet = {
  type: "normal" | "warmup" | "failure" | "dropset";
  weight_kg?: number;
  reps?: number;
  distance_meters?: number;
  duration_seconds?: number;
};
type FitbodRow = { reps: number; weightKg: number; durationSec: number; distanceM: number; isWarmup: boolean };
type Workout = { start: string; exercises: Map<string, FitbodRow[]> };

// Hevy template id -> exercise type (written by generate-template-list.ts)
const templateType = new Map<string, string>(
  JSON.parse(fs.readFileSync(`${DATA}/hevy-templates.json`, 'utf-8')).map((t: { id: string; type: string }) => [t.id, t.type]),
);

function parseFitbodCSV(filePath: string): Workout[] {
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const col = (n: string) => headers.indexOf(n);

  const workouts = new Map<string, Workout>();
  for (const line of lines.slice(1)) {
    const row = line.split(',');
    if (row.length < headers.length) continue;

    const date = row[col('Date')].trim(); // "2026-09-08 08:08:21 +0000"
    const exercise = row[col('Exercise')].trim();
    const w = workouts.get(date) ?? { start: date, exercises: new Map() };
    const sets = w.exercises.get(exercise) ?? [];
    sets.push({
      reps: parseInt(row[col('Reps')], 10) || 0,
      weightKg: parseFloat(row[col('Weight(kg)')]) || 0,
      durationSec: parseFloat(row[col('Duration(s)')]) || 0,
      distanceM: parseFloat(row[col('Distance(m)')]) || 0,
      isWarmup: row[col('isWarmup')].trim().toLowerCase() === 'true',
    });
    w.exercises.set(exercise, sets);
    workouts.set(date, w);
  }
  return [...workouts.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// Fields each Hevy exercise type accepts. GET returns some types under older names.
const FIELDS: Record<string, (keyof HevySet)[]> = {
  weight_reps: ['weight_kg', 'reps'],
  reps_only: ['reps'],
  bodyweight_reps: ['weight_kg', 'reps'],
  bodyweight_weighted: ['weight_kg', 'reps'],
  bodyweight_assisted_reps: ['weight_kg', 'reps'],
  bodyweight_assisted: ['weight_kg', 'reps'],
  duration: ['duration_seconds'],
  weight_duration: ['weight_kg', 'duration_seconds'],
  distance_duration: ['distance_meters', 'duration_seconds'],
  short_distance_weight: ['weight_kg', 'distance_meters'],
  // Stair machines also take floors/steps in custom_metric; Fitbod logs time only
  floors_duration: ['duration_seconds'],
  steps_duration: ['duration_seconds'],
};

function toHevySet(r: FitbodRow, type: string): HevySet {
  const all: Partial<HevySet> = {
    weight_kg: r.weightKg,
    reps: r.reps,
    duration_seconds: Math.round(r.durationSec),
    distance_meters: Math.round(r.distanceM), // API takes whole meters
  };
  const set: HevySet = { type: r.isWarmup ? 'warmup' : 'normal' };
  for (const f of FIELDS[type] ?? FIELDS.weight_reps) (set as Record<string, unknown>)[f] = all[f];
  return set;
}

// "2026-09-08 08:08:21 +0000" -> "2026-09-08T08:08:21+00:00"
const toIso = (d: string) => {
  const [day, time, tz] = d.split(' ');
  return `${day}T${time}${tz.slice(0, 3)}:${tz.slice(3)}`;
};

function buildPayload(w: Workout) {
  const exercises = [];
  const skipped: string[] = [];
  for (const [name, rows] of w.exercises) {
    const templateId = EXERCISE_MAP[name];
    if (!templateId) { skipped.push(name); continue; }
    const type = templateType.get(templateId) ?? 'weight_reps';
    exercises.push({ exercise_template_id: templateId, sets: rows.map((r) => toHevySet(r, type)) });
  }
  const start = toIso(w.start);
  const totalSets = [...w.exercises.values()].reduce((n, rows) => n + rows.length, 0);
  const minutes = DURATIONS[w.start] ?? Math.round(totalSets * MIN_PER_SET);
  const end = new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
  return {
    skipped,
    durationSource: (w.start in DURATIONS ? 'real' : 'estimated') as 'real' | 'estimated',
    payload: { workout: { title: "Fitbod Import", start_time: start, end_time: end, exercises } },
  };
}

async function main() {
  if (!DRY_RUN && !HEVY_API_KEY) {
    console.error("Set HEVY_API_KEY in .env first.");
    return;
  }

  const ledger: Record<string, string> = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf-8')) : {};
  const workouts = parseFitbodCSV(CSV_PATH);

  // --update=<exercise name>: rebuild already-imported workouts containing that Fitbod
  // exercise from the CSV and overwrite them in place (after a mapping change).
  const updateName = arg('update');
  if (updateName) {
    const targets = workouts.filter((w) => w.exercises.has(updateName) && ledger[w.start]);
    console.log(`${targets.length} imported workout(s) contain "${updateName}"${DRY_RUN ? ' (dry run)' : ''}`);
    for (const w of targets) {
      const { payload } = buildPayload(w);
      if (DRY_RUN) { console.log(`  would update ${w.start} → ${ledger[w.start]}`); continue; }
      const res = await fetch(`${HEVY_API_BASE}/workouts/${ledger[w.start]}`, {
        method: 'PUT',
        headers: { 'api-key': HEVY_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log(`  ${res.ok ? 'UPDATED' : `FAIL ${res.status} ${await res.text()}`}  ${w.start}`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return;
  }
  const todo = workouts.filter((w) => !ledger[w.start]);
  console.log(`${CSV_PATH}: ${workouts.length} workouts, ${workouts.length - todo.length} already imported, ${todo.length} to go${DRY_RUN ? ' (dry run)' : ''}`);

  const skippedNames = new Map<string, number>();
  let sent = 0, failed = 0, sets = 0;
  const durations = { real: 0, estimated: 0 };
  const dump: unknown[] = [];

  for (const [i, w] of todo.entries()) {
    const { payload, skipped, durationSource } = buildPayload(w);
    durations[durationSource]++;
    for (const s of skipped) skippedNames.set(s, (skippedNames.get(s) ?? 0) + 1);
    sets += payload.workout.exercises.reduce((n, e) => n + e.sets.length, 0);
    if (payload.workout.exercises.length === 0) continue;

    if (DRY_RUN) {
      dump.push(payload);
      continue;
    }

    const res = await fetch(`${HEVY_API_BASE}/workouts`, {
      method: 'POST',
      headers: { 'api-key': HEVY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (res.ok) {
      ledger[w.start] = JSON.parse(text)?.workout?.[0]?.id ?? JSON.parse(text)?.id ?? 'ok';
      fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
      sent++;
      console.log(`[${i + 1}/${todo.length}] OK   ${w.start}`);
    } else {
      failed++;
      console.log(`[${i + 1}/${todo.length}] FAIL ${w.start}: ${res.status} ${text}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n${DRY_RUN ? 'Would send' : 'Sent'} ${DRY_RUN ? todo.length : sent} workouts, ${sets} sets${DRY_RUN ? '' : `, ${failed} failed`}`);
  if (DRY_RUN) { fs.writeFileSync(`${DATA}/dry-run.json`, JSON.stringify(dump, null, 1)); console.log(`Payloads written to ${DATA}/dry-run.json`); }
  console.log(`Durations: ${durations.real} from ${DURATIONS_PATH}, ${durations.estimated} estimated at ${MIN_PER_SET} min/set`);
  if (skippedNames.size) {
    console.log('Skipped (not mapped):', [...skippedNames].map(([n, c]) => `${n} ×${c}`).join(', '));
  }
}

main().catch(console.error);
