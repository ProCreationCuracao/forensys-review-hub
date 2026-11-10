#!/usr/bin/env bash
# Publishes the ForenSys Review Hub to Vercel (team: Anexxt).
# Run from this folder:  bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.local ] || { echo ".env.local is missing"; exit 1; }
echo "→ Logging in to Vercel (a browser window may open)…"
npx --yes vercel@latest whoami >/dev/null 2>&1 || npx --yes vercel@latest login
echo "→ Linking the project 'forensys-review-hub'…"
npx --yes vercel@latest link --yes --project forensys-review-hub --scope anexxt
echo "→ Saving the Supabase settings in Vercel…"
while IFS='=' read -r key value; do
  [ -z "$key" ] && continue; case "$key" in \#*) continue;; esac
  for target in production preview; do
    npx --yes vercel@latest env rm "$key" "$target" --yes --scope anexxt >/dev/null 2>&1 || true
    printf '%s' "$value" | npx --yes vercel@latest env add "$key" "$target" --scope anexxt >/dev/null
  done
  echo "   saved $key"
done < .env.local
echo "→ Publishing…"
npx --yes vercel@latest deploy --prod --scope anexxt
echo "✓ Done. The link above is your Review Hub."
