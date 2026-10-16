/**
 * fetch-images.ts — downloads a demo image for each custom exercise from fitbod.me.
 *
 *   deno task fetch-images            # every custom in data/customs.json without an image yet
 *   deno task fetch-images --force    # re-download all
 *
 * Hevy's API can't set an exercise image, so custom exercises have none. This fetches
 * Fitbod's public demo picture for the Fitbod exercise each custom came from
 * (https://fitbod.me/exercises/<slug>), center-crops it to a 512×512 JPEG in
 * data/exercise-images/, and records it in data/exercise-images/index.json for
 * attach-images.sh to upload. The images are Fitbod's: keep them for your own account,
 * don't commit or redistribute them.
 *
 * Exercises you created in Fitbod yourself, and some newer ones, have no page — those are
 * listed at the end; add an image by hand (a screenshot, cropped square) and an index entry
 * with the same shape.
 */
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { DATA } from "./config.ts";

const DIR = `${DATA}/exercise-images`;
const INDEX = `${DIR}/index.json`;
const SIZE = 512;
const force = Deno.args.includes("--force");

type Entry = { file: string; fitbod: string; source: string };

const customs: Record<string, { fitbod: string[] }> = JSON.parse(
  await Deno.readTextFile(`${DATA}/customs.json`).catch(() => {
    console.error(`Missing ${DATA}/customs.json — run \`deno task build-map\` first.`);
    Deno.exit(1);
  }),
);
await Deno.mkdir(DIR, { recursive: true });
const index: Record<string, Entry> = JSON.parse(await Deno.readTextFile(INDEX).catch(() => "{}"));

const slug = (s: string) =>
  s.toLowerCase().replace(/°/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The exercise's own media id is the one with a video; other ids on the page are related exercises
async function imageUrl(fitbodName: string): Promise<[string, string] | undefined> {
  const page = `https://fitbod.me/exercises/${slug(fitbodName)}`;
  const res = await fetch(page);
  if (!res.ok) {
    await res.body?.cancel();
    return undefined;
  }
  const id = (await res.text()).match(/app-media-r2\.fitbod\.me\/v2\/(\d+)\/videos/)?.[1];
  return id ? [page, `https://app-media.fitbod.me/v2/${id}/images/landscape/0_960x540.jpg`] : undefined;
}

let ok = 0, kept = 0;
const missing: string[] = [];
for (const [title, { fitbod }] of Object.entries(customs)) {
  if (index[title] && !force) {
    kept++;
    continue;
  }
  let found: [string, string] | undefined;
  for (const name of fitbod) if ((found = await imageUrl(name))) break;
  if (!found) {
    missing.push(`${title}  (Fitbod: ${fitbod.join(", ")})`);
    continue;
  }
  const [page, url] = found;
  const res = await fetch(url);
  if (!res.ok) {
    missing.push(`${title}  (${res.status} for ${url})`);
    continue;
  }
  const img = (await decode(new Uint8Array(await res.arrayBuffer()))) as Image;
  const side = Math.min(img.width, img.height);
  img.crop(Math.floor((img.width - side) / 2), Math.floor((img.height - side) / 2), side, side).resize(SIZE, SIZE);
  const file = `${slug(title)}.jpg`;
  await Deno.writeFile(`${DIR}/${file}`, await img.encodeJPEG(90));
  index[title] = { file, fitbod: fitbod[0], source: page };
  await Deno.writeTextFile(INDEX, JSON.stringify(index, null, 1) + "\n");
  ok++;
  console.log(`OK       ${title}  ← ${page}`);
}

console.log(`\nDownloaded: ${ok}   Already had one: ${kept}   No image found: ${missing.length}`);
for (const m of missing) console.log(`  ${m}`);
if (ok) console.log(`\nCheck the crops in ${DIR}/, then run src/attach-images.sh`);
