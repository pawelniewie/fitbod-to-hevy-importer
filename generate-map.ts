// generate-map.ts
import * as fs from 'node:fs';
import { FITBOD_CSV_PATH } from './config.ts';

function generateExerciseMapTemplate() {
  console.log(`Reading CSV from ${FITBOD_CSV_PATH}...`);
  const content = fs.readFileSync(FITBOD_CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) {
    console.error("CSV file is empty.");
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const exerciseIndex = headers.indexOf('Exercise');

  if (exerciseIndex === -1) {
    console.error("Could not find 'Exercise' column in the CSV.");
    return;
  }

  const uniqueExercises = new Set<string>();

  // Start at 1 to skip header row
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < headers.length) continue;

    const exerciseName = row[exerciseIndex].trim();
    if (exerciseName) {
      uniqueExercises.add(exerciseName);
    }
  }

  let fileContent = `// exercise-map.ts\n`;
  fileContent += `// Run generate-template-list.ts first, then fill in each value using H.KEY\n`;
  fileContent += `// e.g. "Running": H.RUNNING\n`;
  fileContent += `import { HEVY_EXERCISES as H } from './HEVY_EXERCISES.ts';\n\n`;
  fileContent += `const DEFAULT_EXERCISE = undefined;\n\n`;
  fileContent += `export const EXERCISE_MAP: Record<string, string | undefined> = {\n`;

  for (const ex of uniqueExercises) {
    fileContent += `  "${ex}": DEFAULT_EXERCISE,\n`;
  }

  fileContent += `};\n`;

  fs.writeFileSync('exercise-map.ts', fileContent);
  console.log(`Successfully generated 'exercise-map.ts' with ${uniqueExercises.size} unique exercises.`);
  console.log(`Please fill in the template IDs before running the import script.`);
}

generateExerciseMapTemplate();
