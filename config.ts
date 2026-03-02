// config.ts
import { load } from "jsr:@std/dotenv";

const env = await load();

export const FITBOD_CSV_PATH = 'WorkoutExport.csv';
export const HEVY_API_KEY = env['HEVY_API_KEY'] ?? '';
export const HEVY_API_BASE = 'https://api.hevyapp.com/v1';
