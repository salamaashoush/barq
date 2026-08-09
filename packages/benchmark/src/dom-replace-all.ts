/**
 * G3: is "list: replace all 100 rows" really slower in barq than in Solid?
 *
 * `dom-head-to-head.ts` reports one min-of-7 ratio per case, and for this case
 * it lands within a percent or two of parity — which a single ratio cannot tell
 * apart from run-to-run drift. This file answers it properly: many paired
 * trials, the whole distribution reported, a distribution-free test on the
 * paired differences, and a CONTROL case where both sides run byte-identical
 * code so the harness's own bias is measured rather than assumed.
 *
 * It then decomposes the case — allocation, reconciler, DOM patch — so that a
 * verdict of "real" comes with a location instead of a guess.
 *
 * Run: bun run bench:replace-all
 *   (i.e. `bun --conditions=browser run src/dom-replace-all.ts`)
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import {
  bootstrapMedianCi,
  paired,
  SUMMARY_HEADER,
  summarize,
  summaryLine,
  wilcoxon,
  type PairedResult,
} from "./stats.ts";

const barq = await import("@barqjs/core");
const solid = await import("solid-js/web");
const solidCore = await import("solid-js");

if (solid.isServer) {
  throw new Error(
    "solid-js/web resolved to its SERVER build. Run as " +
      "`bun --conditions=browser run src/dom-replace-all.ts` (or `bun run bench:replace-all`).",
  );
}

type Row = { id: number; label: string };

let nextId = 1;
function makeRows(n: number): Row[] {
  const rows: Row[] = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = { id: nextId++, label: `row ${nextId}` };
  return rows;
}

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const N = 100;
const TRIALS = 61;
const ITERATIONS = 200;

let sink = 0;

// ---------------------------------------------------------------- cases

interface Investigation {
  name: string;
  what: string;
  barq: () => () => void;
  solid: () => () => void;
  iterations?: number;
}

const investigations: Investigation[] = [];

/**
 * The control. Both sides run the SAME function, so any difference this reports
 * is the harness, the machine, or the scheduler — never the frameworks. Every
 * other verdict below is only as strong as this one is small.
 */
investigations.push({
  name: "CONTROL: identical work",
  what: "makeRows(100) on both sides — measures the harness's own bias",
  barq: () => () => {
    sink += makeRows(N).length;
  },
  solid: () => () => {
    sink += makeRows(N).length;
  },
});

/** The case as `dom-head-to-head.ts` states it, unchanged. */
investigations.push({
  name: "A: replace all, as reported",
  what: "makeRows inside the iteration, mapArray -> 100 fresh <div>, full insert",
  barq: () => {
    const parent = container();
    const data = barq.signal(makeRows(N));
    const view = barq.mapArray(data, (row: Row) => {
      const el = document.createElement("div");
      el.textContent = row.label;
      return el;
    });
    barq.insert(parent, () => view());
    barq.flush();
    return () => {
      data.set(makeRows(N));
      barq.flush();
    };
  },
  solid: () => {
    const parent = container();
    let set!: (v: Row[]) => void;
    solidCore.createRoot(() => {
      const [data, setData] = solidCore.createSignal(makeRows(N));
      set = setData as (v: Row[]) => void;
      const view = solidCore.createMemo(
        solidCore.mapArray(data, (row: Row) => {
          const el = document.createElement("div");
          el.textContent = row.label;
          return el;
        }),
      );
      solid.insert(parent, view);
    });
    return () => {
      set(makeRows(N));
    };
  },
});

/**
 * The same, with the row objects pre-built and rotated. Allocation is real work
 * a page does, but it is identical on both sides and it is roughly a third of
 * case A, so leaving it in dilutes whatever difference the frameworks have.
 */
{
  const POOL = 16;
  const pool: Row[][] = Array.from({ length: POOL }, () => makeRows(N));
  investigations.push({
    name: "B: replace all, pre-built rows",
    what: "same, but the Row[] comes from a rotating pool — no allocation in the loop",
    barq: () => {
      const parent = container();
      const data = barq.signal(pool[0]);
      const view = barq.mapArray(data, (row: Row) => {
        const el = document.createElement("div");
        el.textContent = row.label;
        return el;
      });
      barq.insert(parent, () => view());
      barq.flush();
      let i = 0;
      return () => {
        data.set(pool[++i % POOL]);
        barq.flush();
      };
    },
    solid: () => {
      const parent = container();
      let set!: (v: Row[]) => void;
      solidCore.createRoot(() => {
        const [data, setData] = solidCore.createSignal(pool[0]);
        set = setData as (v: Row[]) => void;
        const view = solidCore.createMemo(
          solidCore.mapArray(data, (row: Row) => {
            const el = document.createElement("div");
            el.textContent = row.label;
            return el;
          }),
        );
        solid.insert(parent, view);
      });
      let i = 0;
      return () => {
        set(pool[++i % POOL]);
      };
    },
  });
}

/**
 * The reconciler on its own: 100 rows in, 100 disposals and 100 fresh scopes
 * out, and a mapper that touches no DOM. Nothing is inserted anywhere, so this
 * is `mapArray` + the scope/dispose machinery and nothing else.
 */
{
  const POOL = 16;
  const pool: Row[][] = Array.from({ length: POOL }, () => makeRows(N));
  investigations.push({
    name: "C: reconciler only",
    what: "mapArray over 100 fresh keys, mapper returns a plain object — zero DOM",
    barq: () => {
      const data = barq.signal(pool[0]);
      const view = barq.mapArray(data, (row: Row) => ({ label: row.label }));
      let out: unknown;
      barq.createRoot(() => {
        barq.renderEffect(() => {
          out = view();
        });
      });
      barq.flush();
      let i = 0;
      return () => {
        data.set(pool[++i % POOL]);
        barq.flush();
        sink += (out as unknown[]).length;
      };
    },
    solid: () => {
      let set!: (v: Row[]) => void;
      let out: unknown;
      solidCore.createRoot(() => {
        const [data, setData] = solidCore.createSignal(pool[0]);
        set = setData as (v: Row[]) => void;
        const view = solidCore.createMemo(
          solidCore.mapArray(data, (row: Row) => ({ label: row.label })),
        );
        solidCore.createComputed(() => {
          out = view();
        });
      });
      let i = 0;
      return () => {
        set(pool[++i % POOL]);
        sink += (out as unknown[]).length;
      };
    },
  });
}

/**
 * The DOM patch on its own: `insert` swapping one array of 100 pre-built nodes
 * for another. No reconciler, no scopes, no allocation — just each runtime's
 * node-replacement path against happy-dom.
 */
{
  const POOL = 4;
  const nodePool: HTMLElement[][] = Array.from({ length: POOL }, () =>
    Array.from({ length: N }, (_, i) => {
      const el = document.createElement("div");
      el.textContent = `n ${i}`;
      return el;
    }),
  );
  investigations.push({
    name: "D: insert() patch only",
    what: "insert() swaps 100 pre-built nodes for 100 others — no mapArray, no scopes",
    barq: () => {
      const parent = container();
      const which = barq.signal(0);
      barq.insert(parent, () => nodePool[which() % POOL]);
      barq.flush();
      let i = 0;
      return () => {
        which.set(++i);
        barq.flush();
      };
    },
    solid: () => {
      const parent = container();
      let set!: (v: number) => void;
      solidCore.createRoot(() => {
        const [which, setWhich] = solidCore.createSignal(0);
        set = setWhich as (v: number) => void;
        solid.insert(parent, () => nodePool[which() % POOL]);
      });
      let i = 0;
      return () => {
        set(++i);
      };
    },
  });
}

// ---------------------------------------------------------------- reporting

function verdict(r: PairedResult): string {
  const diffs = r.diffs;
  const w = wilcoxon(diffs);
  const [lo, hi] = bootstrapMedianCi(diffs);
  const med = summarize(diffs).median;
  const pct = (med / r.b.median) * 100;
  const spans0 = lo <= 0 && hi >= 0;

  if (spans0 || w.p > 0.01) {
    return (
      `NOISE — the 95% CI on the paired median difference spans zero ` +
      `[${(lo / 1000).toFixed(2)}, ${(hi / 1000).toFixed(2)}] µs, Wilcoxon p=${w.p.toFixed(3)}`
    );
  }
  const dir = med > 0 ? "barq SLOWER" : "barq FASTER";
  return (
    `REAL — ${dir} by ${Math.abs(pct).toFixed(2)}% ` +
    `(median diff ${(med / 1000).toFixed(2)} µs, 95% CI [${(lo / 1000).toFixed(2)}, ` +
    `${(hi / 1000).toFixed(2)}] µs, Wilcoxon p=${w.p < 1e-9 ? "<1e-9" : w.p.toExponential(1)}, ` +
    `${w.positive}/${w.n} trials slower)`
  );
}

/**
 * One process is not enough. The trial-level machinery above is calibrated —
 * CONTROL comes back at 1.000 every time — but the ratio a single process
 * settles on still moves by a few percent between processes, because the heap
 * layout and the JIT's tier-up decisions are fixed at startup and differ from
 * run to run. `--processes=N` re-runs this file N times and reports the spread
 * of the per-case medians, which is the level a "is it real" claim has to be
 * made at.
 */
const processesArg = Bun.argv.find((a) => a.startsWith("--processes="));

if (processesArg) {
  const runs = Number(processesArg.slice("--processes=".length));
  const perCase = new Map<string, number[]>();
  const RATIO = /^ {2}ratio barq\/solid: median ([\d.]+)/;
  for (let i = 0; i < runs; i++) {
    const proc = Bun.spawnSync({
      cmd: [process.execPath, "--conditions=browser", "run", import.meta.path],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
      throw new Error(`child run exited ${proc.exitCode}:\n${proc.stderr.toString()}`);
    }
    let current = "";
    for (const line of proc.stdout.toString().split("\n")) {
      if (/^[A-Z]:? /.test(line) || line.startsWith("CONTROL")) current = line.trim();
      const m = RATIO.exec(line);
      if (m && current) {
        if (!perCase.has(current)) perCase.set(current, []);
        perCase.get(current)!.push(Number(m[1]));
      }
    }
    process.stdout.write(".");
  }
  console.log(`\n\n${runs} independent processes — distribution of each case's MEDIAN ratio`);
  console.log(`barq/solid; below 1 means barq is faster.\n`);
  console.log(
    `${"case".padEnd(34)}${"min".padStart(9)}${"median".padStart(9)}${"max".padStart(9)}` +
      "runs>1".padStart(9),
  );
  console.log("-".repeat(70));
  for (const [name, xs] of perCase) {
    const s = summarize(xs);
    console.log(
      `${name.slice(0, 33).padEnd(34)}${s.min.toFixed(4).padStart(9)}` +
        `${s.median.toFixed(4).padStart(9)}${s.max.toFixed(4).padStart(9)}` +
        `${xs.filter((x) => x > 1).length}/${xs.length}`.padStart(9),
    );
  }
  process.exit(0);
}

console.log(
  `G3 — "replace all ${N} rows", ${TRIALS} paired trials x ${ITERATIONS} iterations each,\n` +
    `order flipped every trial. All figures are microseconds per iteration.\n` +
    `A single process's VERDICT is provisional — pass --processes=6 for the cross-process one.\n`,
);

for (const inv of investigations) {
  const r = paired(inv.barq, inv.solid, {
    trials: TRIALS,
    iterations: inv.iterations ?? ITERATIONS,
  });
  console.log(`\n${inv.name}`);
  console.log(`  ${inv.what}`);
  console.log(SUMMARY_HEADER);
  console.log("-".repeat(86));
  console.log(summaryLine("  barq", r.a, 1000, 2));
  console.log(summaryLine("  solid", r.b, 1000, 2));
  console.log(summaryLine("  diff (barq - solid)", summarize(r.diffs), 1000, 3));
  const ratio = summarize(r.ratios);
  console.log(
    `  ratio barq/solid: median ${ratio.median.toFixed(4)}, ` +
      `p25-p75 ${ratio.p25.toFixed(4)}-${ratio.p75.toFixed(4)}, min ${ratio.min.toFixed(4)}, ` +
      `max ${ratio.max.toFixed(4)}`,
  );
  console.log(`  VERDICT: ${verdict(r)}`);
}

if (sink === 0) throw new Error("the measured work was eliminated");
