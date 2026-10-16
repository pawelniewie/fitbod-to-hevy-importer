---
name: exercise-images
description: Give the user's Hevy custom exercises a demo picture — fetch Fitbod's images, fill gaps from screenshots, and upload them through the Hevy web app with agent-browser. Use after custom exercises are created, or when the user asks for images/thumbnails on custom exercises.
---

# Images for custom exercises

Hevy's API can't set an exercise image, so this has two halves: collect one square
image per custom into `data/exercise-images/` (with `index.json`), then upload each
through the web app. The images are Fitbod's or the user's — they stay in `data/`.

## 1. Collect

1. `deno task fetch-images` — downloads Fitbod's demo image for every custom in
   `data/customs.json` (written by build-map), 512×512 centre crop, and records it in
   `data/exercise-images/index.json` as `{ "<Hevy title>": { file, fitbod, source } }`.
   Already-indexed titles are skipped; `--force` refetches.
2. For each one reported as "No image found" (usually exercises the user created in
   Fitbod), ask the user for a screenshot of the exercise from the Fitbod app — or any
   photo they like, or none. Pasted screenshots are temporary files, so copy them into
   `data/exercise-images/` straight away. Crop to a square with the person and
   equipment fully in frame (pad with the background colour rather than cutting off
   limbs), cut captions, resize to 512×512, add an index entry with
   `source: "user screenshot"`.
3. Check the crops visually — build a labelled contact sheet or open a few — and redo
   any where the centre crop cut off the movement. If an image shows different
   equipment than the custom's definition, tell the user: the definition may be wrong.

## 2. Upload

1. Refresh ids: `deno task generate-template-list` (new customs must be in
   `data/hevy-templates.json`).
2. Log in once. The user does this by hand; never ask for their password:
   `AGENT_BROWSER_SESSION=hevy npx agent-browser --restore --headed open https://hevy.com/login`,
   and wait for them to say they're in. `--restore` saves the cookies, so the script's
   headless runs reuse the login. Close it with
   `AGENT_BROWSER_SESSION=hevy npx agent-browser close` before running the script.
   Hevy sessions expire after a while; if uploads land on `/login`, repeat this.
3. Test with one: `src/attach-images.sh "<one title>"`. It opens
   `https://hevy.com/exercise/<id>`, Edit, uploads into the file input, saves the crop
   dialog, then Save Exercise, and verifies through the API that `thumbnail_url` is set.
4. Run all: `src/attach-images.sh` (~15–20 s each; run in the background for many). It
   skips exercises that already have an image, so re-running retries only failures.
   Failure screenshots go to `tmp/agent-browser/fail-<id>.png` — look at them. The
   usual cause is clicking Save Exercise before the cropped image returns to the dialog;
   raise the `sleep` after the crop dialog in the script and re-run. If Hevy changed its
   UI, use `npx agent-browser snapshot` on the edit dialog to find the new buttons.
