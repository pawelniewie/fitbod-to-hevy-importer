// config.ts
import { load } from "jsr:@std/dotenv";

const env = await load();

const arg = (name: string) => Deno.args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

// Everything personal or generated lives in data/ (git-ignored)
export const DATA = 'data';
export const FITBOD_CSV_PATH = arg('csv') ?? `${DATA}/WorkoutExport.csv`;
export const HEVY_API_KEY = env['HEVY_API_KEY'] ?? Deno.env.get('HEVY_API_KEY') ?? '';
export const HEVY_API_BASE = 'https://api.hevyapp.com/v1';
