// import.tsm
import * as fs from 'node:fs';
import { FITBOD_CSV_PATH, HEVY_API_KEY, HEVY_API_BASE } from './config.ts';
import { EXERCISE_MAP } from './exercise-map.ts';

// --- Types ---
type HevySet = {
  type: "normal" | "warmup" | "failure" | "drop";
  weight_kg?: number;
  reps?: number;
  distance_meters?: number;
  duration_seconds?: number;
};

type WorkoutData = Record<string, HevySet[]>;

function parseFitbodCSV(filePath: string): Map<string, WorkoutData> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const idxDate = headers.indexOf('Date');
  const idxExercise = headers.indexOf('Exercise');
  const idxReps = headers.indexOf('Reps');
  const idxWeight = headers.indexOf('Weight(kg)');
  const idxDuration = headers.indexOf('Duration(s)');
  const idxDistance = headers.indexOf('Distance(m)');
  const idxWarmup = headers.indexOf('isWarmup');

  const workouts = new Map<string, WorkoutData>();

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < headers.length) continue;

    const dateStr = row[idxDate];
    const day = dateStr.split(' ')[0];
    const exercise = row[idxExercise].trim();

    const reps = parseInt(row[idxReps], 10) || 0;
    const weightKg = parseFloat(row[idxWeight]) || 0;
    const durationSec = parseFloat(row[idxDuration]) || 0;
    const distanceM = parseFloat(row[idxDistance]) || 0;
    const isWarmup = row[idxWarmup].toLowerCase() === 'true';

    const setData: HevySet = { type: isWarmup ? 'warmup' : 'normal' };

    // Determine if this is a cardio/distance set or a weight/reps set
    if (distanceM > 0) {
      setData.distance_meters = distanceM;
      setData.duration_seconds = Math.round(durationSec);
    } else if (durationSec > 0 && weightKg === 0 && reps === 0) {
      setData.duration_seconds = Math.round(durationSec);
    } else {
      setData.weight_kg = weightKg;
      setData.reps = reps;
    }

    if (!workouts.has(day)) {
      workouts.set(day, {});
    }

    const dayWorkouts = workouts.get(day)!;
    if (!dayWorkouts[exercise]) {
      dayWorkouts[exercise] = [];
    }

    dayWorkouts[exercise].push(setData);
  }

  return workouts;
}

async function pushToHevy(dayStr: string, exercisesData: WorkoutData) {
  // Convert YYYY-MM-DD to ISO 8601 string defaulting to noon UTC
  const isoDate = `${dayStr}T12:00:00Z`;

  const payload = {
    workout: {
      title: "Fitbod Import",
      start_time: isoDate,
      end_time: isoDate,
      exercises: [] as any[]
    }
  };

  for (const [exName, sets] of Object.entries(exercisesData)) {
    const templateId = EXERCISE_MAP[exName];
    if (!templateId) {
      console.log(`  [!] Skipping unknown/unmapped exercise: '${exName}'`);
      continue;
    }

    payload.workout.exercises.push({
      exercise_template_id: templateId,
      sets: sets
    });
  }

  if (payload.workout.exercises.length === 0) {
    console.log(`Skipping ${dayStr} - No mapped exercises found.`);
    return;
  }

  const response = await fetch(`${HEVY_API_BASE}/workouts`, {
    method: 'POST',
    headers: {
      'api-key': HEVY_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    console.log(`Successfully imported workout for ${dayStr}`);
  } else {
    const errText = await response.text();
    console.log(`Failed to import ${dayStr}: ${response.status} - ${errText}`);
  }
}

async function main() {
  if (HEVY_API_KEY === 'YOUR_HEVY_API_KEY_HERE') {
    console.error("Please set your HEVY_API_KEY in config.tsm first.");
    return;
  }

  console.log("Parsing Fitbod CSV...");
  const workouts = parseFitbodCSV(FITBOD_CSV_PATH);

  console.log(`Found ${workouts.size} workout days. Starting import...`);

  for (const [dayStr, exercisesData] of workouts.entries()) {
    await pushToHevy(dayStr, exercisesData);

    // 1.5-second delay to respect Hevy API rate limits
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

main().catch(console.error);
