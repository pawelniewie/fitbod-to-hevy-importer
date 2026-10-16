#!/usr/bin/env bash
# attach-images.sh — uploads data/exercise-images/<file> to each custom exercise in Hevy
# via the web app (the API has no image field). Needs agent-browser (npx agent-browser)
# and a logged-in session named "hevy" — log in once with:
#
#   AGENT_BROWSER_SESSION=hevy npx agent-browser --headed open https://hevy.com/login
#
# Skips exercises that already have an image, so it is safe to re-run.
#
#   src/attach-images.sh            # all exercises in data/exercise-images/index.json
#   src/attach-images.sh "Title"    # just one
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p tmp/agent-browser
export AGENT_BROWSER_SESSION=hevy
AB="npx agent-browser"
KEY=$(grep ^HEVY_API_KEY= .env | cut -d= -f2-)

thumb() { # id -> thumbnail_url or empty
  curl -s -H "api-key: $KEY" "https://api.hevyapp.com/v1/exercise_templates/$1" | jq -r '.thumbnail_url // empty'
}

titles=("$@")
if [ ${#titles[@]} -eq 0 ]; then
  while IFS= read -r t; do titles+=("$t"); done < <(jq -r 'keys[]' data/exercise-images/index.json)
fi

ok=0; skipped=0; failed=()
for title in "${titles[@]}"; do
  id=$(jq -r --arg t "$title" '.[] | select(.title == $t and .is_custom) | .id' data/hevy-templates.json | head -1)
  file=$(jq -r --arg t "$title" '.[$t].file // empty' data/exercise-images/index.json)
  if [ -z "$id" ] || [ -z "$file" ]; then echo "MISSING  $title (id=$id file=$file; just created? run deno task generate-template-list)"; failed+=("$title"); continue; fi
  if [ -n "$(thumb "$id")" ]; then echo "SKIP     $title (already has image)"; skipped=$((skipped+1)); continue; fi

  for attempt in 1 2; do
    $AB open "https://hevy.com/exercise/$id" >/dev/null 2>&1
    $AB wait --load networkidle >/dev/null 2>&1
    $AB find text "Edit" click >/dev/null 2>&1
    sleep 2
    $AB upload 'input[type=file]' "$PWD/data/exercise-images/$file" >/dev/null 2>&1
    sleep 3
    $AB find role button click --name "Save" --exact >/dev/null 2>&1   # crop dialog
    sleep 3   # image goes back into the edit dialog; saving too early drops it
    $AB find role button click --name "Save Exercise" >/dev/null 2>&1
    sleep 4
    [ -n "$(thumb "$id")" ] && break
    $AB press Escape >/dev/null 2>&1
  done

  if [ -n "$(thumb "$id")" ]; then echo "OK       $title"; ok=$((ok+1))
  else echo "FAIL     $title"; failed+=("$title"); $AB screenshot "tmp/agent-browser/fail-$id.png" >/dev/null 2>&1; $AB press Escape >/dev/null 2>&1
  fi
done

echo; echo "Uploaded: $ok   Already had image: $skipped   Failed: ${#failed[@]}"
for t in "${failed[@]}"; do echo "  $t"; done
