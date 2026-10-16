// decisions.ts — types and helpers for Fitbod → Hevy mapping decisions.
//
// Decisions come from two places, merged by build-map.ts (yours win):
//   mappings/fitbod-hevy.ts      shared, reviewed decisions for Fitbod's built-in exercises
//   data/exercise-decisions.ts   your own: exercises the seed lacks, or where you disagree
//
// Statuses:
//   ok      — exact Hevy equivalent
//   fix     — exact Hevy equivalent that name matching (suggest-map.ts) gets wrong
//   variant — Hevy only has the base movement; `hevy` is that base, `custom`
//             is what to create instead (see build-map --variants)
//   custom  — no usable Hevy equivalent, create `custom`
//   ask     — needs a human; left unmapped until answered
//   skip    — deliberately not imported

export type Custom = {
  title: string;
  // POST names; GET /exercise_templates reports bodyweight_reps as bodyweight_weighted
  // and bodyweight_assisted_reps as bodyweight_assisted. Can't be changed after creation.
  exercise_type:
    | "weight_reps" | "reps_only" | "bodyweight_reps" | "bodyweight_assisted_reps"
    | "duration" | "weight_duration" | "distance_duration" | "short_distance_weight";
  equipment_category: string;
  primary_muscle_group: string;
  other_muscles?: string[];
};

export type Decision = {
  status: "ok" | "fix" | "variant" | "custom" | "ask" | "skip";
  hevy?: string; // HEVY_EXERCISES key
  custom?: Custom;
  note?: string;
};

export const C = (
  title: string,
  exercise_type: Custom["exercise_type"],
  equipment_category: string,
  primary_muscle_group: string,
  other_muscles: string[] = [],
): Custom => ({ title, exercise_type, equipment_category, primary_muscle_group, other_muscles });

export const ok = (hevy: string, note?: string): Decision => ({ status: "ok", hevy, note });
export const fix = (hevy: string, note?: string): Decision => ({ status: "fix", hevy, note });
export const variant = (hevy: string, custom: Custom, note?: string): Decision => ({ status: "variant", hevy, custom, note });
export const custom = (c: Custom, note?: string): Decision => ({ status: "custom", custom: c, note });
export const ask = (note: string, c?: Custom): Decision => ({ status: "ask", custom: c, note });
export const skip = (note: string): Decision => ({ status: "skip", note });
