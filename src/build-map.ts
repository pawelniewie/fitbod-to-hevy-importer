/**
 * build-map.ts — turns the mapping decisions into data/exercise-map.ts (for import.ts),
 * data/missing.json (for create-missing.ts) and data/customs.json (for fetch-images.ts).
 *
 *   deno task build-map [--variants=builtin|custom|<min sets>] [--csv=data/WorkoutExport.csv]
 *
 * Decisions: mappings/fitbod-hevy.ts (shared seed), overridden by data/exercise-decisions.ts.
 *
 * --variants=builtin maps "variant" exercises to the closest Hevy built-in;
 * --variants=custom creates a custom exercise for each instead; a number (default
 * 10) creates customs only for variants done in at least that many sets.
 *
 * Checks: every Fitbod exercise in the CSV has a decision, every referenced
 * HEVY_EXERCISES key exists (or is a custom still to be created), and the data
 * Fitbod logged (weight/reps/time/distance) fits the target exercise type.
 */
import { HEVY_EXERCISES } from "../data/HEVY_EXERCISES.ts";
import { SEED } from "../mappings/fitbod-hevy.ts";
import { DATA, FITBOD_CSV_PATH as csvPath } from "./config.ts";
import type { Custom, Decision } from "./decisions.ts";

const LOCAL = `${DATA}/exercise-decisions.ts`;
const local: Record<string, Decision> = await import(`../${LOCAL}`)
  .then((m) => m.DECISIONS)
  .catch((e) => {
    if (e instanceof TypeError && /Module not found/.test(e.message)) return {};
    throw e;
  });
const DECISIONS: Record<string, Decision> = { ...SEED, ...local };

const arg = (name: string, def: string) =>
  Deno.args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const variantsAs = arg("variants", "10");

const toKey = (title: string) => {
  const key = title.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[0-9]/.test(key) ? `_${key}` : key;
};

// --- What Fitbod logged per exercise
type Shape = { sets: number; weight: number; reps: number; duration: number; distance: number };
const shapes = new Map<string, Shape>();
const lines = (await Deno.readTextFile(csvPath)).trim().split("\n");
const h = lines[0].split(",").map((s) => s.trim());
const col = (n: string) => h.indexOf(n);
for (const line of lines.slice(1)) {
  const r = line.split(",");
  const name = r[col("Exercise")].trim();
  const s = shapes.get(name) ?? { sets: 0, weight: 0, reps: 0, duration: 0, distance: 0 };
  s.sets++;
  if (parseFloat(r[col("Weight(kg)")]) > 0) s.weight++;
  if (parseInt(r[col("Reps")]) > 0) s.reps++;
  if (parseFloat(r[col("Duration(s)")]) > 0) s.duration++;
  if (parseFloat(r[col("Distance(m)")]) > 0) s.distance++;
  shapes.set(name, s);
}

// --- Hevy template types (from the API dump, if present) for compatibility checks
const hevyTypes = new Map<string, string>();
try {
  for (const t of JSON.parse(await Deno.readTextFile(`${DATA}/hevy-templates.json`))) {
    hevyTypes.set(toKey(t.title), t.type);
  }
} catch { /* optional */ }

// Hevy API names some types differently in GET vs POST
const normType = (t: string) =>
  ({ bodyweight_weighted: "bodyweight_reps", bodyweight_assisted: "bodyweight_assisted_reps" } as Record<string, string>)[t] ?? t;

function fits(type: string, s: Shape): string | null {
  const t = normType(type);
  const timed = s.duration > 0 && s.reps === 0;
  if (["duration"].includes(t) && s.weight > 0) return "weight would be dropped";
  if (["reps_only"].includes(t) && s.weight > 0) return `${s.weight}/${s.sets} sets weighted but type is reps-only`;
  if (["weight_reps", "reps_only", "bodyweight_reps", "bodyweight_assisted_reps"].includes(t) && timed && s.distance === 0) {
    return "sets are timed but type counts reps";
  }
  if (["duration", "weight_duration"].includes(t) && s.reps > 0 && s.duration === 0) return "sets are reps but type is timed";
  if (["distance_duration", "short_distance_weight"].includes(t) && s.distance === 0) return "type needs distance, data has none";
  return null;
}

// --- Resolve
const map: [string, string, string][] = []; // fitbod, key-or-empty, comment
const toCreate = new Map<string, Custom>();
const problems: string[] = [];
const customTypes = new Map<string, string>();

const names = [...shapes.keys()].sort((a, b) => shapes.get(b)!.sets - shapes.get(a)!.sets);
for (const n of names.filter((n) => !DECISIONS[n])) problems.push(`no decision for "${n}"`);
const used = names.filter((n) => DECISIONS[n]);

const asCustom = (n: string, d: Decision) =>
  d.status === "custom" ||
  (d.status === "variant" &&
    (variantsAs === "custom" || (/^\d+$/.test(variantsAs) && (shapes.get(n)?.sets ?? 0) >= Number(variantsAs))));

// First pass: which customs get created — only for exercises in your CSV. A decision's
// `hevy` may point at a custom defined by another decision (e.g. a variant of a custom).
const customByKey = new Map<string, Custom>();
for (const d of Object.values(DECISIONS)) {
  if (d.custom) {
    customByKey.set(toKey(d.custom.title), d.custom);
    customTypes.set(toKey(d.custom.title), d.custom.exercise_type);
  }
}
for (const n of used) {
  const d = DECISIONS[n];
  const c = asCustom(n, d) ? d.custom : d.hevy ? customByKey.get(d.hevy) : undefined;
  if (c && !HEVY_EXERCISES[toKey(c.title)]) toCreate.set(c.title, c);
}

const resolve = (n: string, d: Decision): string | undefined => {
  if (d.status === "ask" || d.status === "skip") return undefined;
  if (asCustom(n, d)) return toKey(d.custom!.title);
  return d.hevy;
};

const customs = new Map<string, string[]>(); // custom title → Fitbod names mapped to it
for (const n of used) {
  const d = DECISIONS[n];
  const s = shapes.get(n)!;
  const key = resolve(n, d);
  const pending = key && !HEVY_EXERCISES[key] && [...toCreate.values()].some((c) => toKey(c.title) === key);
  if (key && !HEVY_EXERCISES[key] && !pending) problems.push(`"${n}" → ${key}: not in HEVY_EXERCISES.ts`);

  const type = key ? (hevyTypes.get(key) ?? customTypes.get(key)) : undefined;
  const misfit = type ? fits(type, s) : null;
  if (misfit) problems.push(`"${n}" → ${key} (${type}): ${misfit}`);

  const bits = [d.status === "variant" ? `variant→${asCustom(n, d) ? "custom" : "builtin"}` : d.status, `${s.sets} sets`];
  if (pending) bits.push("custom, not created yet");
  if (d.note) bits.push(d.note);
  map.push([n, key && HEVY_EXERCISES[key] ? key : "", bits.join(" · ")]);
  const c = key && customByKey.get(key);
  if (c) customs.set(c.title, [...(customs.get(c.title) ?? []), n]);
}

// --- Write
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const body = map
  .map(([n, k, c]) => `  "${esc(n)}": ${k ? `HEVY_EXERCISES.${k}` : `""`}, // ${c}`)
  .join("\n");
await Deno.writeTextFile(
  `${DATA}/exercise-map.ts`,
  `// Generated by build-map.ts (--variants=${variantsAs}) — edit the decisions, not this file.\n` +
    `// Entries left as "" are skipped by the importer.\n` +
    `import { HEVY_EXERCISES } from "./HEVY_EXERCISES.ts";\n\n` +
    `export const EXERCISE_MAP: Record<string, string> = {\n${body}\n};\n`,
);
await Deno.writeTextFile(`${DATA}/missing.json`, JSON.stringify([...toCreate.values()], null, 2) + "\n");
await Deno.writeTextFile(
  `${DATA}/customs.json`,
  JSON.stringify(Object.fromEntries([...customs].map(([title, fitbod]) => [title, { fitbod }])), null, 1) + "\n",
);

const count = (st: string) => names.filter((n) => DECISIONS[n]?.status === st).length;
const unmapped = names.length - map.filter(([, k]) => k).length;
console.log(
  `${names.length} exercises: ${count("ok")} ok · ${count("fix")} fixed · ${count("variant")} variant (as ${variantsAs}) · ` +
    `${count("custom")} custom · ${count("ask")} ask · ${count("skip")} skipped`,
);
console.log(`Decisions: ${names.filter((n) => SEED[n] && !local[n]).length} from the shared seed, ${names.filter((n) => local[n]).length} from ${LOCAL}`);
console.log(`${DATA}/exercise-map.ts: ${names.length - unmapped} mapped, ${unmapped} unmapped`);
console.log(`${DATA}/missing.json: ${toCreate.size} custom exercise(s) to create`);
if (problems.length) console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
