/**
 * create-missing.ts — bulk-creates custom exercise templates in Hevy via
 * POST /v1/exercise_templates, so Fitbod exercises with no Hevy equivalent get a
 * real template instead of being skipped by the importer.
 *
 *   deno task create-missing --dry-run     # print the payloads
 *   deno task create-missing               # create them
 *   deno task generate-template-list && deno task build-map   # then refresh
 *
 * Input: data/missing.json, written by build-map.ts — e.g.
 * [
 *   {
 *     "title": "Tibialis Raise (Wall)",
 *     "exercise_type": "reps_only",
 *     "equipment_category": "none",
 *     "primary_muscle_group": "calves",
 *     "other_muscles": []
 *   }
 * ]
 *
 * NOTE ON ENUMS: exercise_type / equipment_category / muscle group values are
 * defined by the API, not by this script — the payload is passed through as-is.
 * If a value is wrong the API returns 400 and this script prints the response
 * body. Reference: https://api.hevyapp.com/docs/
 *
 * IMPORTANT: there is no API to delete or edit a custom exercise, and exercise_type
 * cannot be changed after creation. Isometrics and timed drills need a duration
 * type, not reps — otherwise you delete and recreate them by hand in the app.
 */
import { DATA, HEVY_API_KEY as key } from "./config.ts";

const API = "https://api.hevyapp.com/v1/exercise_templates";
const INPUT = `${DATA}/missing.json`;
const DELAY_MS = 1500;

const dryRun = Deno.args.includes("--dry-run");

if (!key && !dryRun) {
  console.error("No HEVY_API_KEY in env or ./.env");
  Deno.exit(1);
}

type NewExercise = {
  title: string;
  exercise_type: string;
  equipment_category: string;
  primary_muscle_group: string;
  other_muscles?: string[];
};

const raw = await Deno.readTextFile(INPUT).catch(() => {
  console.error(`Missing ${INPUT} — see the header of this file for the format.`);
  Deno.exit(1);
});

let items: NewExercise[];
try {
  items = JSON.parse(raw);
} catch (e) {
  console.error(`${INPUT} is not valid JSON: ${(e as Error).message}`);
  Deno.exit(1);
}

const required = ["title", "exercise_type", "equipment_category", "primary_muscle_group"];
const bad = items.filter((it) => required.some((f) => !(it as Record<string, unknown>)[f]));
if (bad.length) {
  console.error(`Missing required fields in ${bad.length} entr(ies):`);
  for (const b of bad) console.error(`  ${JSON.stringify(b)}`);
  Deno.exit(1);
}

const seen = new Set<string>();
for (const it of items) {
  const k = it.title.toLowerCase().trim();
  if (seen.has(k)) console.warn(`Duplicate title in input: "${it.title}"`);
  seen.add(k);
}

console.log(`${items.length} exercise(s) to create${dryRun ? " (dry run)" : ""}\n`);

const created: string[] = [];
const failed: string[] = [];

for (const [i, it] of items.entries()) {
  // Per the OpenAPI spec (CreateCustomExerciseRequestBody): wrapped in `exercise`,
  // and the primary muscle field is `muscle_group`.
  const body = {
    exercise: {
      title: it.title,
      exercise_type: it.exercise_type,
      equipment_category: it.equipment_category,
      muscle_group: it.primary_muscle_group,
      other_muscles: it.other_muscles ?? [],
    },
  };

  if (dryRun) {
    console.log(`[${i + 1}/${items.length}] POST ${API}`);
    console.log(JSON.stringify(body, null, 2));
    continue;
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "api-key": key!, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (res.ok) {
      created.push(it.title);
      console.log(`[${i + 1}/${items.length}] OK   ${it.title} → ${text.trim()}`);
    } else {
      failed.push(it.title);
      console.error(`[${i + 1}/${items.length}] FAIL ${it.title} → ${res.status} ${text.trim()}`);
      if (res.status === 403) {
        console.error("  403 usually means the custom-exercise limit was hit (free tier = 7).");
      }
    }
  } catch (e) {
    failed.push(it.title);
    console.error(`[${i + 1}/${items.length}] ERR  ${it.title} → ${(e as Error).message}`);
  }

  if (i < items.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
}

if (!dryRun) {
  console.log(`\nCreated: ${created.length}   Failed: ${failed.length}`);
  if (failed.length) console.log(`Failed titles:\n  ${failed.join("\n  ")}`);
  console.log("\nNext: deno task generate-template-list  &&  deno task build-map");
}
