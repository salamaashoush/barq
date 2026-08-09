#!/usr/bin/env bash
#
# The typecheck gate.
#
# `bun run typecheck` at the root does propagate a non-zero exit (measured on
# bun 1.4.0: `bun run typecheck` and `bun run --filter '*' typecheck` both exit
# 2). So a plain CI step calling it would fail TODAY, on errors that predate
# this project — @barqjs/core and its JSX type declarations between them.
#
# That is what this script is for, and the reason is a baseline rather than a
# broken exit code: it runs each package's typecheck on its own and compares the
# errors against a checked-in list. It fails when a NEW error appears, and it
# also fails when a baselined error is FIXED without removing its line, so the
# list can only shrink and cannot rot into an allowlist for everything.
#
#   .github/scripts/typecheck.sh            # gate
#   .github/scripts/typecheck.sh --write    # re-record the baseline
#
set -uo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
baseline="$root/.github/typecheck-baseline.txt"
cd "$root" || exit 1

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
actual="$tmp/actual.txt"
: > "$actual"

for dir in packages/*/; do
  pkg=${dir%/}
  pkg=${pkg#packages/}
  grep -q '"typecheck"' "packages/$pkg/package.json" 2>/dev/null || continue

  log="$tmp/$pkg.log"
  if bun run --cwd "packages/$pkg" typecheck > "$log" 2>&1; then
    echo "ok    packages/$pkg"
    continue
  fi

  echo "FAIL  packages/$pkg"
  sed -n 's/^ *//p' "$log" | grep -oE '[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+' \
    | sed -E 's#^.*/node_modules/\.bun/[^/]+/node_modules/#node_modules/#' \
    | sed -E "s#^#packages/$pkg #" >> "$actual"
  sed 's/^/      /' "$log"
done

LC_ALL=C sort -o "$actual" "$actual"

if [ "${1:-}" = "--write" ]; then
  {
    echo "# Pre-existing TypeScript errors, as of the day the gate became real."
    echo "#"
    echo "# These are NOT the compiler-rs project's work and nothing here was"
    echo "# weakened, deleted or @ts-ignored to make them go away. The gate fails"
    echo "# on any error NOT in this list, and equally on any line here that stops"
    echo "# reproducing — so the list can only shrink, never quietly grow."
    echo "#"
    echo "# Regenerate with .github/scripts/typecheck.sh --write"
    cat "$actual"
  } > "$baseline"
  echo
  echo "baseline rewritten: $(grep -cv '^#' "$baseline") known error(s)"
  exit 0
fi

if [ ! -f "$baseline" ]; then
  echo "no baseline at $baseline — run with --write once and commit it" >&2
  exit 1
fi

echo
grep -v '^#' "$baseline" > "$tmp/known.txt"
if diff -u "$tmp/known.txt" "$actual" > "$tmp/diff"; then
  known=$(wc -l < "$tmp/known.txt")
  if [ "$known" -gt 0 ]; then
    echo "typecheck: $known KNOWN error(s), unchanged."
    echo "They are pre-existing and listed in .github/typecheck-baseline.txt."
  else
    echo "typecheck: clean."
  fi
  exit 0
fi

cat "$tmp/diff"
echo
echo "The typecheck baseline moved. A '+' line is a NEW error and must be fixed."
echo "A '-' line is an error that was FIXED — delete it from"
echo ".github/typecheck-baseline.txt (or rerun this script with --write)."
exit 1
