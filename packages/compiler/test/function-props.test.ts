import { afterEach, describe, expect, test } from "bun:test";

import { compileSource, loadModule, writeSibling } from "./harness.ts";
import { host, wire } from "./hydration.ts";

/**
 * A function handed to a component as a prop's VALUE: a callback, not a
 * reactive read. Props cross as Cells and a read calls the Cell, so a path that
 * hands the callback over without its Cell has the read call the callback.
 *
 * Every path a prop can take to a component is here, each with a callback that
 * takes nothing and one that takes an argument. The child records what it was
 * handed; nothing in the module may have been called by the time it has.
 */

writeSibling(
  "function-props-from-ts.ts",
  `
import { createComponent, values } from "@barqjs/core";

export function fromTs(component, zero, one, label) {
  return createComponent(component, {
    name: () => "ts",
    zero: () => zero,
    one: () => one,
    label,
  });
}

export function valuesOf(zero, one) {
  const record = values({ zero: () => zero, one: () => one });
  return { zero: record.zero, one: record.one, again: record.zero };
}
`,
);

const SOURCE = `
import {
  asRecord, cells, createSignal, fromCells, merge, omit, type Incoming,
} from "@barqjs/core";
import { fromTs, valuesOf } from "./function-props-from-ts.ts";

export const calls = { zero: 0, one: 0, pick: 0 };
export function reset() {
  calls.zero = 0;
  calls.one = 0;
  calls.pick = 0;
}
export const [tick, setTick] = createSignal(0);
export const zero = () => (calls.zero++, "zero");
export function one(x: string) {
  calls.one++;
  return "one:" + x;
}
export const pick = () => (calls.pick++, "pick");

type Seen = { zero?: unknown; one?: unknown; again?: unknown; pick?: unknown };
export const seen: Record<string, Seen> = {};

type Taken = {
  name: string;
  zero?: () => unknown;
  one?: (x: string) => unknown;
  onPick?: () => unknown;
  label?: string;
  drop?: string;
};

function Probe(props: Taken) {
  seen[props.name] = { zero: props.zero, one: props.one, again: props.zero, pick: props.onPick };
  return <i data-row={props.name}>{props.label}</i>;
}

function Forward(props: Taken) {
  return <Probe {...props} />;
}
function Anchor(props: { current?: () => string | undefined }) {
  return <a data-row="anchor" aria-current={props.current} />;
}
function Spreads(props: { "aria-current"?: () => string | undefined }) {
  return <a data-row="spreads" {...props} />;
}
function Button(props: { onClick?: () => unknown; title?: string }) {
  return <button type="button" data-row="button" {...props} />;
}
function Omitted(props: Taken) {
  return <Probe {...omit(props, "drop")} />;
}
function MergedAfter(props: Taken) {
  return <Probe {...merge(props, { one })} />;
}
function MergedBefore(props: Taken) {
  return <Probe {...merge({ zero, one }, props)} />;
}

function useHeld(record: Incoming<Taken>): Seen {
  return { zero: record.zero?.(), one: record.one?.(), again: record.zero?.(), pick: record.onPick?.() };
}
function Hooked(props: Taken) {
  seen.hook = useHeld(cells(props));
  return <i data-row="hook">{props.label}</i>;
}

function Destructured({ name, zero, one, onPick, label }: Taken) {
  seen[name] = { zero, one, again: zero, pick: onPick };
  return <i data-row={name}>{label}</i>;
}
function Defaulted({
  name,
  zero = () => (calls.zero++, "fallback"),
  one = (x: string) => (calls.one++, x),
  label,
}: Taken) {
  seen[name] = { zero, one, again: zero };
  return <i data-row={name}>{label}</i>;
}

function read(record: Taken): Seen {
  return { zero: record.zero, one: record.one, again: record.zero, pick: record.onPick };
}
function Escaped(props: Taken) {
  seen.escape = read(props);
  return <i data-row="escape">{props.label}</i>;
}

const Handwritten = fromCells((props: Incoming<Taken>) => {
  seen.handwritten = { zero: props.zero?.(), one: props.one?.(), again: props.zero?.() };
  return null;
});

const spread = { zero, one, onPick: pick };
// A part's props as aria builds them for an element: a handler is the
// function itself, anything else that moves is the accessor that reads it.
const part = asRecord({ name: "part", zero: () => zero, one: () => one, onPick: pick, label: "part" });

export default function Page() {
  seen.values = valuesOf(zero, one);
  return (
    <div>
      <Probe name="inline" zero={() => (calls.zero++, "zero")} one={(x) => (calls.one++, x)} onPick={() => (calls.pick++, "pick")} label="inline" />
      <Probe name="named" zero={zero} one={one} onPick={pick} label="named" />
      <Probe name="reactive" zero={() => (calls.zero++, tick())} one={(x) => (calls.one++, x + tick())} label={String(tick())} />
      <Probe name="eta" zero={() => tick()} label={String(tick())} />
      <Probe name="accessor" zero={tick} label={String(tick())} />
      <Probe name="spread" {...spread} label="spread" />
      <Forward name="forward" zero={() => (calls.zero++, "zero")} one={one} onPick={pick} label={String(tick())} />
      <Omitted name="omit" zero={() => (calls.zero++, "zero")} one={one} onPick={pick} drop="x" label={String(tick())} />
      <MergedAfter name="merge-after" zero={() => (calls.zero++, "zero")} onPick={pick} label={String(tick())} />
      <MergedBefore name="merge-before" onPick={pick} label={String(tick())} />
      <Hooked name="hook" zero={() => (calls.zero++, "zero")} one={one} onPick={pick} label={String(tick())} />
      <Destructured name="destructured" zero={() => (calls.zero++, "zero")} one={one} onPick={pick} label={String(tick())} />
      <Defaulted name="defaulted-given" zero={() => (calls.zero++, "zero")} one={one} label={String(tick())} />
      <Defaulted name="defaulted-left-out" label={String(tick())} />
      <Escaped name="escape" zero={() => (calls.zero++, "zero")} one={one} onPick={pick} label={String(tick())} />
      <Handwritten name="handwritten" zero={() => (calls.zero++, "zero")} one={one} />
      {fromTs(Probe, zero, one, () => String(tick()))}
      <Probe {...part} />
      <Button onClick={() => calls.pick++} title={String(tick())} />
      <Anchor current={() => (tick() > 0 ? "page" : undefined)} />
      <Spreads aria-current={() => (tick() > 0 ? "page" : undefined)} />
    </div>
  );
}
`;

interface Matrix {
  calls: { zero: number; one: number; pick: number };
  reset: () => void;
  seen: Record<string, { zero?: unknown; one?: unknown; again?: unknown; pick?: unknown }>;
  zero: () => string;
  one: (x: string) => string;
  pick: () => string;
  tick: () => number;
  setTick: (value: number) => void;
  default: () => unknown;
}

/** Each row, and what calling its callbacks answers. `null` where the row passes none. */
const ROWS: Record<string, { zero: unknown; one: unknown; pick: unknown; same?: boolean }> = {
  inline: { zero: "zero", one: "a", pick: "pick" },
  named: { zero: "zero", one: "one:a", pick: "pick", same: true },
  reactive: { zero: 0, one: "a0", pick: null },
  eta: { zero: 0, one: null, pick: null },
  accessor: { zero: 0, one: null, pick: null, same: true },
  spread: { zero: "zero", one: "one:a", pick: "pick", same: true },
  forward: { zero: "zero", one: "one:a", pick: "pick" },
  omit: { zero: "zero", one: "one:a", pick: "pick" },
  "merge-after": { zero: "zero", one: "one:a", pick: "pick" },
  "merge-before": { zero: "zero", one: "one:a", pick: "pick", same: true },
  hook: { zero: "zero", one: "one:a", pick: "pick" },
  destructured: { zero: "zero", one: "one:a", pick: "pick" },
  "defaulted-given": { zero: "zero", one: "one:a", pick: null },
  "defaulted-left-out": { zero: "fallback", one: "a", pick: null },
  escape: { zero: "zero", one: "one:a", pick: "pick" },
  handwritten: { zero: "zero", one: "one:a", pick: null },
  ts: { zero: "zero", one: "one:a", pick: null, same: true },
  values: { zero: "zero", one: "one:a", pick: null, same: true },
  part: { zero: "zero", one: "one:a", pick: "pick", same: true },
};

/** The rows whose label follows `tick`. */
const LIVE = [
  "reactive",
  "eta",
  "accessor",
  "forward",
  "omit",
  "merge-after",
  "merge-before",
  "hook",
  "destructured",
  "defaulted-given",
  "defaulted-left-out",
  "escape",
  "ts",
];

const handedOver = (matrix: Matrix): void => {
  expect(matrix.calls).toEqual({ zero: 0, one: 0, pick: 0 });
  for (const [row, expected] of Object.entries(ROWS)) {
    const seen = matrix.seen[row];
    expect(seen, row).toBeDefined();
    expect(typeof seen.zero, `${row}: zero`).toBe("function");
    expect(seen.again, `${row}: zero read twice`).toBe(seen.zero);
    if (expected.one !== null) expect(typeof seen.one, `${row}: one`).toBe("function");
    if (expected.pick !== null) expect(typeof seen.pick, `${row}: onPick`).toBe("function");
    if (expected.same === true) {
      expect(
        seen.zero === matrix.zero || seen.zero === matrix.tick,
        `${row}: zero is the same function`,
      ).toBe(true);
    }
  }
  expect(matrix.calls).toEqual({ zero: 0, one: 0, pick: 0 });
  for (const [row, expected] of Object.entries(ROWS)) {
    const seen = matrix.seen[row];
    const before = { ...matrix.calls };
    expect((seen.zero as () => unknown)(), `${row}: zero()`).toBe(expected.zero);
    if (expected.one !== null)
      expect((seen.one as (x: string) => unknown)("a"), `${row}: one("a")`).toBe(expected.one);
    if (expected.pick !== null)
      expect((seen.pick as () => unknown)(), `${row}: onPick()`).toBe(expected.pick);
    const counted = row === "eta" || row === "accessor" ? 0 : 1;
    expect(matrix.calls.zero - before.zero, `${row}: zero ran once`).toBe(counted);
  }
};

async function load(name: string, options: Record<string, unknown>): Promise<Matrix> {
  return (await loadModule(
    compileSource(SOURCE, "function-props.tsx", options),
    name,
  )) as unknown as Matrix;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("a function handed to a component as a prop's value", () => {
  test("reaches the component uncalled on every path, and reactive props still move", async () => {
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const matrix = await load("function-props-dom", {});
    const page = host();
    cleanups.push(web.render(matrix.default as never, page), () => page.remove());
    core.flush();
    handedOver(matrix);
    expect(page.querySelector('[data-row="anchor"]')?.hasAttribute("aria-current")).toBe(false);
    expect(page.querySelector('[data-row="spreads"]')?.hasAttribute("aria-current")).toBe(false);

    matrix.reset();
    matrix.setTick(4);
    core.flush();
    expect(matrix.calls).toEqual({ zero: 0, one: 0, pick: 0 });
    for (const row of LIVE) {
      expect(page.querySelector(`[data-row="${row}"]`)?.textContent, row).toBe("4");
    }
    expect((matrix.seen.reactive.zero as () => unknown)()).toBe(4);
    expect((matrix.seen.eta.zero as () => unknown)()).toBe(4);
    for (const row of ["anchor", "spreads"]) {
      expect(page.querySelector(`[data-row="${row}"]`)?.getAttribute("aria-current"), row).toBe(
        "page",
      );
    }
    const button = page.querySelector<HTMLButtonElement>('[data-row="button"]');
    expect(button?.title).toBe("4");
    matrix.reset();
    button?.click();
    expect(matrix.calls).toEqual({ zero: 0, one: 0, pick: 1 });
    matrix.setTick(0);
    core.flush();
  });

  test("reaches it uncalled when the server renders it", async () => {
    const matrix = await load("function-props-ssr", { ssr: true, hydratable: true });
    const markup = wire(matrix);
    expect(markup).toContain('data-row="inline"');
    expect(markup).toContain('<a data-row="anchor"></a>');
    expect(markup).not.toContain("=>");
    handedOver(matrix);
  });

  test("reaches it uncalled when the page hydrates, and claims the server's nodes", async () => {
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const server = await load("function-props-hy-ssr", { ssr: true, hydratable: true });
    const client = await load("function-props-hy-dom", { hydratable: true });
    const page = host(wire(server));
    const before = page.querySelector('[data-row="inline"]');
    cleanups.push(web.hydrate(client.default as never, page), () => page.remove());
    core.flush();
    expect(web.hydrate.report.mismatches).toEqual([]);
    expect(page.querySelector('[data-row="inline"]')).toBe(before);
    handedOver(client);
  });
});
