/**
 * How much does `dom-head-to-head.ts`'s own headline number move between runs?
 *
 * That file reports one min-of-7 ratio per case. A min is not robust when the
 * per-iteration cost is dominated by allocation, because whichever side happens
 * to dodge a GC pause in one of its seven rounds wins. This spawns the file N
 * times in fresh processes and reports the distribution of the ratio it prints,
 * which is the only honest way to read a claim like "1-3% slower".
 *
 * Run: bun run bench:spread            (defaults to 15 runs, all cases)
 *      bun run src/protocol-spread.ts 25 "replace all"
 */
import { summarize } from "./stats.ts";

const runs = Number(Bun.argv[2] ?? 15);
const filter = Bun.argv[3] ?? "";

const script = new URL("./dom-head-to-head.ts", import.meta.url).pathname;

/**
 * `name  barqNs  solidNs  tag` — the columns the head-to-head prints. The tag
 * is `1.23x` or `1.23x SLOW`, so it has to be allowed to contain a space; a
 * pattern that forbids one silently drops exactly the runs this file exists to
 * count.
 */
const ROW = /^(.+?)\s{2,}(\d+)\s+(\d+)\s+([\d.]+x(?: SLOW)?)$/;

const perCase = new Map<string, number[]>();

for (let i = 0; i < runs; i++) {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "--conditions=browser", "run", script],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`dom-head-to-head.ts exited ${proc.exitCode}:\n${proc.stderr.toString()}`);
  }
  for (const line of proc.stdout.toString().split("\n")) {
    const m = ROW.exec(line.trimEnd());
    if (!m) continue;
    const name = m[1].trim();
    if (filter && !name.includes(filter)) continue;
    const barq = Number(m[2]);
    const solid = Number(m[3]);
    if (!Number.isFinite(barq) || !Number.isFinite(solid) || solid === 0) continue;
    if (!perCase.has(name)) perCase.set(name, []);
    perCase.get(name)!.push(barq / solid);
  }
  process.stdout.write(`.`);
}
process.stdout.write("\n\n");

for (const [name, ratios] of perCase) {
  if (ratios.length !== runs) {
    throw new Error(
      `only parsed ${ratios.length} of ${runs} runs for "${name}" — the output format moved and ` +
        "this file's regex is dropping rows",
    );
  }
}

console.log(
  `${runs} independent processes, each running dom-head-to-head.ts's own min-of-7 protocol.\n` +
    `Ratio is barq/solid: below 1 means barq is faster.\n`,
);
console.log(
  `${"case".padEnd(34)}${"min".padStart(9)}${"p25".padStart(9)}${"median".padStart(9)}` +
    `${"p75".padStart(9)}${"max".padStart(9)}${"slower".padStart(10)}`,
);
console.log("-".repeat(89));
for (const [name, ratios] of perCase) {
  const s = summarize(ratios);
  const slower = ratios.filter((r) => r > 1).length;
  console.log(
    `${name.padEnd(34)}${s.min.toFixed(4).padStart(9)}${s.p25.toFixed(4).padStart(9)}` +
      `${s.median.toFixed(4).padStart(9)}${s.p75.toFixed(4).padStart(9)}` +
      `${s.max.toFixed(4).padStart(9)}${`${slower}/${ratios.length}`.padStart(10)}`,
  );
}
console.log(
  `\nA case whose "slower" column is neither 0 nor ${runs} did not measure a difference; it ` +
    `measured\nthe machine. Read those rows as parity, whatever any single run printed.`,
);
