#!/usr/bin/env bash
#
# Fails when a compiler-emitted declaration sits beside its own source in a
# package's `src`.
#
# `tsc` run with emit on, from any config whose program reaches a package's
# `src` through the `bun` export condition, writes `foo.d.ts` next to `foo.ts`
# when it cannot place it under a `rootDir`. The file then shadows nothing for
# the bundler but changes what the formatter, the linter and a later `tsc`
# see. A hand-written declaration has no same-named source, so it passes.
#
set -uo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root" || exit 1

found=0
while IFS= read -r -d '' file; do
  base=${file%.map}
  base=${base%.d.ts}
  if [ -e "$base.ts" ] || [ -e "$base.tsx" ]; then
    echo "emitted declaration beside its source: $file"
    found=1
  fi
done < <(find packages/*/src -path '*/node_modules' -prune -o \( -name '*.d.ts' -o -name '*.d.ts.map' \) -print0)

if [ "$found" -ne 0 ]; then
  echo
  echo "These were written by a compiler run with emit on, not by the build. Delete them,"
  echo "and run tsc with --noEmit (every package tsconfig sets noEmit and noEmitOnError)."
  exit 1
fi
echo "stray declarations: none."
