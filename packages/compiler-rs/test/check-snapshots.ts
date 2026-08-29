/**
 * The snapshot gate.
 *
 * It used to be `git diff -U0 HEAD -- *.snap | grep -c '^-[^-]'` must be zero —
 * "a snapshot line may only be added". That is unsatisfiable by construction the
 * moment a runtime helper is RENAMED: M5 moved `setProp` to eight named channels
 * and the gate went red at 221 removed lines for a change that was entirely
 * correct, which means it would have been waived rather than consulted. A gate
 * that has to be waived on the milestones it exists for is not a gate.
 *
 * What it asserts instead is the thing a re-record can silently destroy and a
 * reviewer cannot see in a 5,000-line diff: COVERAGE. Every snapshot key that
 * exists at HEAD must still exist in the working tree. A fixture whose entry
 * disappears has stopped being checked, and `--update-snapshots` will not tell
 * anyone. Changing what a key RECORDS is a reviewable diff; losing the key is
 * not.
 *
 *   bun test/check-snapshots.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "__snapshots__");
const KEY = /^exports\[`(.+)`\] = /gm;

function keys(text: string): Set<string> {
  return new Set([...text.matchAll(KEY)].map((match) => match[1]!));
}

async function atHead(path: string): Promise<string> {
  const proc = Bun.spawn(["git", "show", `HEAD:packages/compiler-rs/test/__snapshots__/${path}`], {
    cwd: join(import.meta.dir, "..", "..", ".."),
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return proc.exitCode === 0 ? text : "";
}

const lost: string[] = [];
let checked = 0;
for (const file of readdirSync(DIR).filter((name) => name.endsWith(".snap"))) {
  const before = keys(await atHead(file));
  const after = keys(readFileSync(join(DIR, file), "utf8"));
  checked += before.size;
  for (const key of before) if (!after.has(key)) lost.push(`${file}: ${key}`);
}

if (checked === 0) {
  console.error(
    "the snapshot gate read no keys at HEAD — the scanner has gone blind, which reports the same " +
      "zero a clean tree does",
  );
  process.exit(1);
}

if (lost.length > 0) {
  console.error(`${lost.length} snapshot key(s) exist at HEAD and not in the working tree:\n`);
  for (const key of lost) console.error(`  ${key}`);
  console.error(
    "\nA key that disappears is a fixture that stopped being checked, and " +
      "`--update-snapshots` does not report it.",
  );
  process.exit(1);
}

console.log(`snapshots: ${checked} key(s) at HEAD, all still recorded.`);
