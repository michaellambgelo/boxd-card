#!/bin/bash
# PostToolUse hook: run tests after editing src/ TypeScript files.
# Exits 0 silently on pass or skip; exits 2 with stderr on failure
# so Claude sees the output and can act on it.

INPUT=$(cat)

# Extract the edited file path from hook JSON input
FILE_PATH=$(python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" <<< "$INPUT" 2>/dev/null)

# Only run for .ts / .tsx files under src/
if [[ -z "$FILE_PATH" ]] || [[ ! "$FILE_PATH" =~ /src/.*\.(ts|tsx)$ ]]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

OUTPUT=$(npm run test:run 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  exit 0
fi

# Tests failed — send output to Claude as feedback
echo "$OUTPUT" >&2
exit 2
