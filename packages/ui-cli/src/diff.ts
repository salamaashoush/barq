/**
 * A unified diff, in fifty lines and with no dependency.
 *
 * The classic Myers shortest-edit-script over LINES. A component file is a few
 * hundred lines and the two versions are nearly identical, which is the case
 * Myers is fastest on — it walks the diagonal, so the work is proportional to
 * the size of the DIFFERENCE rather than to the size of the files.
 */

export type Op = "keep" | "add" | "remove";

export interface Change {
  readonly op: Op;
  readonly line: string;
}

/** The edit script turning `before` into `after`. */
export function diffLines(before: readonly string[], after: readonly string[]): Change[] {
  const n = before.length;
  const m = after.length;
  const max = n + m;
  // `v[k]` is the furthest `x` reached on diagonal `k`, and a copy is kept per
  // step so the path can be walked back once the end is found.
  const trace: Map<number, number>[] = [];
  let v = new Map<number, number>([[1, 0]]);

  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
      let x = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) return walk(trace, before, after, d);
    }
    v = new Map(v);
  }
  return [];
}

function walk(
  trace: readonly Map<number, number>[],
  before: readonly string[],
  after: readonly string[],
  end: number,
): Change[] {
  const out: Change[] = [];
  let x = before.length;
  let y = after.length;

  for (let d = end; d > 0; d--) {
    const v = trace[d] as Map<number, number>;
    const k = x - y;
    const down = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = v.get(previousK) ?? 0;
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      out.push({ op: "keep", line: before[--x] as string });
      y--;
    }
    if (down) out.push({ op: "add", line: after[--y] as string });
    else out.push({ op: "remove", line: before[--x] as string });
  }
  while (x > 0 && y > 0) {
    out.push({ op: "keep", line: before[--x] as string });
    y--;
  }
  return out.toReversed();
}

export interface HunkOptions {
  /** Unchanged lines kept either side of a change. @default 3 */
  readonly context?: number;
}

/**
 * The changes as a unified diff, with the runs of untouched lines collapsed.
 *
 * A component is mostly untouched, so printing every line would bury the three
 * that moved.
 */
export function unified(before: string, after: string, options: HunkOptions = {}): string {
  const context = options.context ?? 3;
  const changes = diffLines(before.split("\n"), after.split("\n"));
  if (!changes.some((change) => change.op !== "keep")) return "";

  const keep = new Set<number>();
  changes.forEach((change, index) => {
    if (change.op === "keep") return;
    for (let at = index - context; at <= index + context; at++) keep.add(at);
  });

  const out: string[] = [];
  let skipping = false;
  changes.forEach((change, index) => {
    if (!keep.has(index)) {
      if (!skipping) out.push("  ...");
      skipping = true;
      return;
    }
    skipping = false;
    out.push(`${change.op === "add" ? "+ " : change.op === "remove" ? "- " : "  "}${change.line}`);
  });
  return out.join("\n");
}
