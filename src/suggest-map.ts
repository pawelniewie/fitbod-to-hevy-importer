/**
 * suggest-map.ts — first-pass name matching for exercises with no decision yet.
 *
 * Offline. Makes no network calls.
 * Reads the CSV + data/HEVY_EXERCISES.ts, fuzzy-matches every Fitbod exercise that
 * has no decision in mappings/fitbod-hevy.ts or data/exercise-decisions.ts against
 * your Hevy exercise templates, and writes data/exercise-map.suggested.ts sorted by
 * how often you actually did the exercise.
 *
 * Run:  deno task suggest-map [--all]   (--all also lists exercises that have a decision)
 *
 * The output is a starting point for review (the review-mapping skill, or by hand),
 * not a map to import with: name matching gets equipment and variants wrong.
 * Nothing is auto-accepted below the confidence threshold — those land as ""
 * with the top candidates in a comment.
 */
import { SEED } from "../mappings/fitbod-hevy.ts";
import { DATA, FITBOD_CSV_PATH as CSV_PATH } from "./config.ts";

const HEVY_PATH = `${DATA}/HEVY_EXERCISES.ts`;
const OUT_PATH = `${DATA}/exercise-map.suggested.ts`;
const ALL = Deno.args.includes("--all");
const local: Record<string, unknown> = await import(`../${DATA}/exercise-decisions.ts`)
  .then((m) => m.DECISIONS)
  .catch(() => ({}));
const decided = (name: string) => name in SEED || name in local;

const AUTO_ACCEPT = 0.72; // below this you get a TODO instead of a guess

// ---------------------------------------------------------------- CSV

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// ---------------------------------------------------------------- matching

const SYNONYMS: Record<string, string> = {
  bb: "barbell",
  db: "dumbbell",
  kb: "kettlebell",
  ohp: "overhead press",
  bw: "bodyweight",
  ez: "ezbar",
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  lat: "lateral",
  laterals: "lateral",
  raises: "raise",
  curls: "curl",
  rows: "row",
  presses: "press",
  extensions: "extension",
  squats: "squat",
  deadlifts: "deadlift",
  lunges: "lunge",
  pullups: "pull up",
  pullup: "pull up",
  chinups: "chin up",
  chinup: "chin up",
  pushups: "push up",
  pushup: "push up",
  "sit-ups": "sit up",
  situp: "sit up",
  dips: "dip",
  flyes: "fly",
  flies: "fly",
  flye: "fly",
  crunches: "crunch",
  bulgarian: "bulgarian split",
};

const NOISE = new Set(["the", "a", "with", "and", "of", "on", "in", "to", "for"]);

function tokenize(s: string): string[] {
  const words = s
    .toLowerCase()
    .replace(/[_\-/()]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (SYNONYMS[w] ?? w).split(" "))
    .filter((w) => !NOISE.has(w));
  return [...new Set(words)];
}

function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function score(fitbod: string, hevyKey: string): number {
  const ft = tokenize(fitbod);
  const ht = tokenize(hevyKey.replace(/_/g, " "));
  const fs = new Set(ft);
  const hs = new Set(ht);

  // token overlap, weighted toward covering every Fitbod word
  const covered = ft.filter((w) => hs.has(w)).length;
  const coverage = ft.length ? covered / ft.length : 0;
  const tokenScore = 0.6 * coverage + 0.4 * jaccard(fs, hs);

  // character bigram similarity catches spelling / plural drift
  const charScore = jaccard(bigrams(fitbod), bigrams(hevyKey.replace(/_/g, " ")));

  let s = 0.7 * tokenScore + 0.3 * charScore;
  if (ft.join(" ") === ht.join(" ")) s = 1;
  return s;
}

// ---------------------------------------------------------------- main

const csvRaw = await Deno.readTextFile(CSV_PATH).catch(() => {
  console.error(`Missing ${CSV_PATH} — put your Fitbod export there.`);
  Deno.exit(1);
});
const hevyRaw = await Deno.readTextFile(HEVY_PATH).catch(() => {
  console.error(`Missing ${HEVY_PATH} — run \`deno task generate-template-list\` first.`);
  Deno.exit(1);
});

const hevyKeys = [...hevyRaw.matchAll(/^\s*([A-Z0-9_]+)\s*:/gm)].map((m) => m[1]);
if (!hevyKeys.length) {
  console.error(`No exercise constants found in ${HEVY_PATH}.`);
  Deno.exit(1);
}

const rows = parseCsv(csvRaw);
const header = rows[0].map((h) => h.trim());
const exIdx = header.findIndex((h) => /exercise/i.test(h));
const dateIdx = header.findIndex((h) => /date/i.test(h));
if (exIdx === -1) {
  console.error(`No "Exercise" column found. Header was: ${header.join(" | ")}`);
  Deno.exit(1);
}

const counts = new Map<string, number>();
const dates: string[] = [];
for (const r of rows.slice(1)) {
  const name = (r[exIdx] ?? "").trim();
  if (!name) continue;
  counts.set(name, (counts.get(name) ?? 0) + 1);
  if (dateIdx !== -1 && r[dateIdx]) dates.push(r[dateIdx].trim());
}

const ranked = [...counts.entries()]
  .filter(([name]) => ALL || !decided(name))
  .sort((a, b) => b[1] - a[1]);
const alreadyDecided = [...counts.keys()].filter(decided).length;

const lines: string[] = [];
let auto = 0;
let todo = 0;

for (const [name, n] of ranked) {
  const cands = hevyKeys
    .map((k) => ({ k, s: score(name, k) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const best = cands[0];
  const esc = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  if (best && best.s >= AUTO_ACCEPT) {
    auto++;
    lines.push(
      `  "${esc}": HEVY_EXERCISES.${best.k}, // ${n} sets · ${best.s.toFixed(2)}`,
    );
  } else {
    todo++;
    const alt = cands.map((c) => `${c.k} (${c.s.toFixed(2)})`).join(" | ");
    lines.push(`  "${esc}": "", // TODO ${n} sets · candidates: ${alt || "none"}`);
  }
}

const out = `// Generated by suggest-map.ts — REVIEW BEFORE USE.
// Entries left as "" are skipped by the importer.
// ${ranked.length} unique Fitbod exercises · ${auto} auto-matched · ${todo} need review
import { HEVY_EXERCISES } from "./HEVY_EXERCISES.ts";

export const EXERCISE_MAP: Record<string, string> = {
${lines.join("\n")}
};
`;

await Deno.writeTextFile(OUT_PATH, out);

const sorted = dates.slice().sort();
console.log(`CSV rows:            ${rows.length - 1}`);
if (sorted.length) console.log(`Date range:          ${sorted[0]} → ${sorted[sorted.length - 1]}`);
console.log(`Hevy templates:      ${hevyKeys.length}`);
console.log(`Unique exercises:    ${counts.size} (${alreadyDecided} already have a decision)`);
console.log(`Listed:              ${ranked.length}`);
console.log(`Auto-matched:        ${auto}`);
console.log(`Needs review (TODO): ${todo}`);
console.log(`\nWrote ${OUT_PATH}. Review it into ${DATA}/exercise-decisions.ts, then: deno task build-map`);
