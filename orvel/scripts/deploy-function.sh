#!/usr/bin/env bash
# Deploys the ORVEL server function. The rules engine lives in src/ (shared
# with the app and the tests), so it is copied next to the function first.
#   ./scripts/deploy-function.sh <project-ref>
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-yhiyehwsqaromgxfpkxh}"
DIR=supabase/functions/orvel
mkdir -p "$DIR/server" "$DIR/lib"
cp src/server/game.js src/server/battle.js src/server/defaults.js src/server/rng.js "$DIR/server/"
cp src/lib/seedArt.js "$DIR/lib/"
supabase functions deploy orvel --project-ref "$REF" --no-verify-jwt
