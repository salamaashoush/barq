import { afterEach, describe, expect, test } from "bun:test";

import { compileSource, loadModule, writeSibling } from "./harness.ts";
import { host, wire } from "./hydration.ts";

/**
 * A function handed to a component as a prop's value: a callback, not a
 * reactive read. Props cross as Cells and a read calls the Cell, so a path that
 * hands the callback over without its Cell has the read call the callback, and
 * a DOM spread handed the Cell attaches it as the listener.
 *
 * Every path a prop can take to a component is here, with a callback that
 * takes an argument and a handler that takes nothing. The child records what
 * it was handed; nothing may have been called by the time it has.
 */

writeSibling(
  "function-props-from-ts.ts",
  `
import { createComponent, values } from "@barqjs/core";

export function fromTs(component, one, pick, label) {
  return createComponent(component, {
    name: () => "ts",
    one: () => one,
    onPick: () => pick,
    label,
  });
}

export function valuesOf(one, pick) {
  const record = values({ one: () => one, onPick: () => pick });
  return { one: record.one, pick: record.onPick, again: record.onPick };
}
`,
);

const SOURCE = `
import { asRecord, cells, createSignal, fromCells, merge, omit, type Incoming } from "@barqjs/core";
import { fromTs, valuesOf } from "./function-props-from-ts.ts";

export const calls = { one: 0, pick: 0 };
export function reset() {
  calls.one = 0;
  calls.pick = 0;
}
export const [tick, setTick] = createSignal(0);
export function one(x: string) {
  calls.one++;
  return "one:" + x;
}
export const pick = () => (calls.pick++, "pick");

type Seen = { one?: unknown; pick?: unknown; again?: unknown };
export const seen: Record<string, Seen> = {};

type Taken = {
  name: string;
  one?: (x: string) => unknown;
  onPick?: () => unknown;
  label?: string;
  drop?: string;
};

function Probe(props: Taken) {
  seen[props.name] = { one: props.one, pick: props.onPick, again: props.onPick };
  return <i data-row={props.name}>{props.label}</i>;
}

function Forward(props: Taken) {
  return <Probe {...props} />;
}
function Omitted(props: Taken) {
  return <Probe {...omit(props, "drop")} />;
}
function MergedAfter(props: Taken) {
  return <Probe {...merge(props, { one })} />;
}
function MergedBefore(props: Taken) {
  return <Probe {...merge({ one, onPick: pick }, props)} />;
}

function useHeld(record: Incoming<Taken>): Seen {
  return { one: record.one?.(), pick: record.onPick?.(), again: record.onPick?.() };
}
function Hooked(props: Taken) {
  seen.hook = useHeld(cells(props));
  return <i data-row="hook">{props.label}</i>;
}

function Destructured({ name, one, onPick, label }: Taken) {
  seen[name] = { one, pick: onPick, again: onPick };
  return <i data-row={name}>{label}</i>;
}
function Defaulted({
  name,
  one = (x: string) => (calls.one++, x),
  onPick = () => (calls.pick++, "fallback"),
  label,
}: Taken) {
  seen[name] = { one, pick: onPick, again: onPick };
  return <i data-row={name}>{label}</i>;
}

function read(record: Taken): Seen {
  return { one: record.one, pick: record.onPick, again: record.onPick };
}
function Escaped(props: Taken) {
  seen.escape = read(props);
  return <i data-row="escape">{props.label}</i>;
}

const Handwritten = fromCells((props: Incoming<Taken>) => {
  seen.handwritten = { one: props.one?.(), pick: props.onPick?.(), again: props.onPick?.() };
  return null;
});

function Button(props: { onClick?: () => unknown; title?: string }) {
  return <button type="button" data-row="button" {...props} />;
}

const spread = { one, onPick: pick };
// A part's props as aria builds them for an element: a handler is the
// function itself, anything else that moves is the accessor that reads it.
const part = asRecord({ name: "part", one: () => one, onPick: pick, label: "part" });

export default function Page() {
  seen.values = valuesOf(one, pick);
  return (
    <div>
      <Probe name="inline" one={(x) => (calls.one++, x)} onPick={() => (calls.pick++, "pick")} label="inline" />
      <Probe name="named" one={one} onPick={pick} label="named" />
      <Probe name="reactive" one={(x) => (calls.one++, x + tick())} onPick={() => (calls.pick++, tick())} label={String(tick())} />
      <Probe name="spread" {...spread} label="spread" />
      <Forward name="forward" one={one} onPick={pick} label={String(tick())} />
      <Omitted name="omit" one={one} onPick={pick} drop="x" label={String(tick())} />
      <MergedAfter name="merge-after" onPick={pick} label={String(tick())} />
      <MergedBefore name="merge-before" label={String(tick())} />
      <Hooked name="hook" one={one} onPick={pick} label={String(tick())} />
      <Destructured name="destructured" one={one} onPick={pick} label={String(tick())} />
      <Defaulted name="defaulted-given" one={one} onPick={pick} label={String(tick())} />
      <Defaulted name="defaulted-left-out" label={String(tick())} />
      <Escaped name="escape" one={one} onPick={pick} label={String(tick())} />
      <Handwritten name="handwritten" one={one} onPick={pick} />
      {fromTs(Probe, one, pick, () => String(tick()))}
      <Probe {...part} />
      <Button onClick={() => calls.pick++} title={String(tick())} />
    </div>
  );
}
`;

interface Matrix {
  calls: { one: number; pick: number };
  reset: () => void;
  seen: Record<string, { one?: unknown; pick?: unknown; again?: unknown }>;
  one: (x: string) => string;
  pick: () => string;
  setTick: (value: number) => void;
  default: () => unknown;
}

/** Each row, and what calling its callbacks answers. */
const ROWS: Record<string, { one: unknown; pick: unknown; same?: boolean }> = {
  inline: { one: "a", pick: "pick" },
  named: { one: "one:a", pick: "pick", same: true },
  reactive: { one: "a0", pick: 0 },
  spread: { one: "one:a", pick: "pick", same: true },
  forward: { one: "one:a", pick: "pick" },
  omit: { one: "one:a", pick: "pick" },
  "merge-after": { one: "one:a", pick: "pick" },
  "merge-before": { one: "one:a", pick: "pick", same: true },
  hook: { one: "one:a", pick: "pick" },
  destructured: { one: "one:a", pick: "pick" },
  "defaulted-given": { one: "one:a", pick: "pick" },
  "defaulted-left-out": { one: "a", pick: "fallback" },
  escape: { one: "one:a", pick: "pick" },
  handwritten: { one: "one:a", pick: "pick" },
  ts: { one: "one:a", pick: "pick", same: true },
  values: { one: "one:a", pick: "pick", same: true },
  part: { one: "one:a", pick: "pick", same: true },
};

/** The rows whose label follows `tick`. */
const LIVE = [
  "reactive",
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
  expect(matrix.calls).toEqual({ one: 0, pick: 0 });
  for (const [row, expected] of Object.entries(ROWS)) {
    const seen = matrix.seen[row];
    expect(seen, row).toBeDefined();
    expect(typeof seen.one, `${row}: one`).toBe("function");
    expect(typeof seen.pick, `${row}: onPick`).toBe("function");
    expect(seen.again, `${row}: onPick read twice`).toBe(seen.pick);
    if (expected.same === true) {
      expect(seen.one, `${row}: the same callback`).toBe(matrix.one);
      expect(seen.pick, `${row}: the same handler`).toBe(matrix.pick);
    }
  }
  expect(matrix.calls).toEqual({ one: 0, pick: 0 });
  for (const [row, expected] of Object.entries(ROWS)) {
    const seen = matrix.seen[row];
    const before = { ...matrix.calls };
    expect((seen.one as (x: string) => unknown)("a"), `${row}: one("a")`).toBe(expected.one);
    expect((seen.pick as () => unknown)(), `${row}: onPick()`).toBe(expected.pick);
    expect(matrix.calls.one - before.one, `${row}: one ran once`).toBe(1);
    expect(matrix.calls.pick - before.pick, `${row}: onPick ran once`).toBe(1);
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

    matrix.reset();
    matrix.setTick(4);
    core.flush();
    expect(matrix.calls).toEqual({ one: 0, pick: 0 });
    for (const row of LIVE) {
      expect(page.querySelector(`[data-row="${row}"]`)?.textContent, row).toBe("4");
    }
    expect((matrix.seen.reactive.one as (x: string) => unknown)("a")).toBe("a4");
    const button = page.querySelector<HTMLButtonElement>('[data-row="button"]');
    expect(button?.title).toBe("4");
    matrix.reset();
    button?.click();
    expect(matrix.calls).toEqual({ one: 0, pick: 1 });
    matrix.setTick(0);
    core.flush();
  });

  test("reaches it uncalled when the server renders it", async () => {
    const matrix = await load("function-props-ssr", { ssr: true, hydratable: true });
    const markup = wire(matrix);
    expect(markup).toContain('data-row="inline"');
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
    client.reset();
    page.querySelector<HTMLButtonElement>('[data-row="button"]')?.click();
    expect(client.calls).toEqual({ one: 0, pick: 1 });
  });
});
