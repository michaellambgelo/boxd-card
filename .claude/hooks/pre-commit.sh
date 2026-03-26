#!/bin/bash
# Pre-commit hook: rebuild docs/app/ when web app source files are staged.
#
# Watches:
#   src/web/**          — React components, scraper, CSS modules
#   vite.web.config.ts  — build config
#   .env.production     — baked-in proxy URL
#
# On a match: runs `npm run build:web`, stages the output, and lets the
# commit proceed. The build output (docs/app/) ends up in the same commit
# as the source change.

WEB_SOURCES=$(git diff --cached --name-only | grep -E '^(src/web/|vite\.web\.config\.ts|\.env\.production)')

if [ -z "$WEB_SOURCES" ]; then
  exit 0
fi

echo "▶ Web source changed — rebuilding docs/app/..."
cd "$(git rev-parse --show-toplevel)"

if ! npm run build:web; then
  echo "✗ build:web failed — commit aborted." >&2
  exit 1
fi

git add docs/app/
echo "✓ docs/app/ rebuilt and staged."
