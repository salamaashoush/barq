import { describe, expect, test } from "bun:test";

import { compileSource, fixtureSource, listFixtures, loadModule } from "./harness.ts";
import { beginTrace, endTrace, summarize } from "./tracer.ts";
import {
  HYDRATION_KNOWN,
  census,
  compileText,
  host,
  reuse,
  shape,
  wire,
  type Outcome,
} from "./hydration.ts";

/**
 * L5 — the hydration oracle.
 *
 * Three renderings of every fixture, and the suite is the comparison between
 * them: the string module's WIRE, the DOM module HYDRATED over it, and the DOM
 * module rendered COLD. The first comparison — hydrated against cold — is the
 * one every framework makes. The second is the one this milestone exists for:
 * node IDENTITY, because a replaced node and a claimed node serialise
 * identically and a markup diff cannot tell them apart. That is the shape of
 * silent failure detection was bought for.
 */

const FIXTURES = listFixtures();

interface Result extends Outcome {
  name: string;
}

async function hydrateFixture(name: string, dev = false): Promise<Result> {
  const compiled = await compileText(fixtureSource(name), dev ? `${name}-dev` : name, true, dev);
  const core = await import("@barqjs/core");
  const markup = wire(compiled.ssr);

  const container = host(markup);
  const before = census(container);
  let trace = beginTrace();
  let hydrated: () => void;
  try {
    hydrated = core.hydrate(compiled.dom.default as never, container);
  } finally {
    endTrace();
  }
  const claim = reuse(before, container);
  const hot = summarize(trace);
  const report = core.hydrate.report;
  const hydratedShape = shape(container);

  const cold = host("");
  trace = beginTrace();
  let rendered: () => void;
  try {
    rendered = core.render(compiled.dom.default as never, cold);
  } finally {
    endTrace();
  }
  const coldSummary = summarize(trace);
  const coldShape = shape(cold);

  hydrated();
  rendered();
  container.remove();
  cold.remove();

  return {
    name,
    markup,
    hydratedShape,
    coldShape,
    reuse: claim,
    recovered: report.recovered,
    mismatches: report.mismatches.map((m) => m.kind),
    effects: { hot: hot.created, cold: coldSummary.created },
  };
}

/**
 * One pass over the corpus, shared by every assertion below.
 *
 * Not one hydration per test: the tracer is a module global that refuses a
 * second open trace, and the stale-registration check has to see EVERY fixture's
 * result — a check that runs before four of them have finished is a check that
 * cannot fail, which is the shape of the silent success this suite exists to
 * refuse.
 */
const ALL: Promise<Map<string, Result>> = (async () => {
  const out = new Map<string, Result>();
  for (const name of FIXTURES) out.set(name, await hydrateFixture(name));
  return out;
})();

/**
 * The same pass over a DEVELOPMENT build — `dev` on top of `hydratable`.
 *
 * Detection is an emission axis, and an axis has two settings. Everything
 * above measures the PRODUCTION one; this measures the other, and the property
 * it exists for is the one a stronger checker fails first: turning detection ON
 * must not report a divergence that is not there. The subtree walk compares
 * static TEXT as well as node names now, and the whole corpus is where a
 * normalisation artefact — a `<pre>` newline the tokenizer ate, an entity one
 * side spelled differently — would surface as a mismatch nobody caused.
 */
const ALL_DEV: Promise<Map<string, Result>> = (async () => {
  await ALL;
  const out = new Map<string, Result>();
  for (const name of FIXTURES) out.set(name, await hydrateFixture(name, true));
  return out;
})();

describe("L5 hydration conformance", () => {
  for (const name of FIXTURES) {
    test(`${name} hydrates over its own server render`, async () => {
      const result = (await ALL).get(name) as Result;
      const known = HYDRATION_KNOWN[name];

      // H1: the DOM the client ends up with is the DOM it would have built.
      // This is the comparison a markup diff can make, and on its own it is not
      // enough — a full replace passes it.
      if (known?.shape != null) {
        // A registered SHAPE difference is asserted exactly, in both directions:
        // it must be the recorded string, and it must still differ from the cold
        // one. A row that started matching is stale and says so.
        expect(result.hydratedShape).toBe(known.shape);
        expect(result.hydratedShape).not.toBe(result.coldShape);
      } else {
        expect(result.hydratedShape).toBe(result.coldShape);
      }

      if (known === undefined) {
        // H1's falsification clause, verbatim: "node-reuse percentage on a
        // matching render MUST be 100%". Measured today: 0%.
        expect({ name, percent: result.reuse.percent, lost: result.reuse.firstLost }).toEqual({
          name,
          percent: 100,
          lost: null,
        });
        // H4 and the silent-success guard: a fixture that claims everything has
        // nothing to report, and a fixture that reports nothing must have
        // claimed everything. Both directions, so "green" cannot mean "the
        // detector is asleep".
        expect({ name, recovered: result.recovered, mismatches: result.mismatches }).toEqual({
          name,
          recovered: false,
          mismatches: [],
        });
        // Hydration must not re-run the work the server already did: it opens
        // the same effects a cold render opens, and not one more. A page that
        // rendered twice would pass every markup comparison above.
        expect({ name, ...result.effects }).toEqual({
          name,
          hot: result.effects.cold,
          cold: result.effects.cold,
        });
        return;
      }

      // A registered row is a DECLARED divergence and is held to its own
      // description — the kinds it reports, whether it recovered, and the exact
      // reuse it still achieves. An EQUALITY, not a floor: a row that starts
      // claiming more is as much a stale registration as one that starts
      // claiming everything, and both have to be re-read rather than absorbed.
      expect({
        name,
        recovered: result.recovered,
        kinds: [...new Set(result.mismatches)].toSorted(),
        reuse: Math.round(result.reuse.percent),
      }).toEqual({
        name,
        recovered: known.recovered,
        kinds: known.kinds,
        reuse: known.reuse,
      });
    });
  }

  test("every registered row is still failing, and nothing else is", async () => {
    const results = [...(await ALL).values()];
    expect(results.length).toBe(FIXTURES.length);
    const registered = new Set(Object.keys(HYDRATION_KNOWN));
    for (const name of registered) {
      expect(FIXTURES).toContain(name);
    }
    const stale = results.filter(
      (r) =>
        registered.has(r.name) &&
        !r.recovered &&
        r.mismatches.length === 0 &&
        r.reuse.percent === 100 &&
        HYDRATION_KNOWN[r.name].shape === null,
    );
    expect(stale.map((r) => r.name)).toEqual([]);
    // Every row states WHY, in prose a reader can check against the fixture.
    for (const [name, row] of Object.entries(HYDRATION_KNOWN)) {
      expect({ name, why: row.why.length > 40 }).toEqual({ name, why: true });
    }

    const claimed = results.filter(
      (r) => !registered.has(r.name) && r.reuse.percent === 100,
    ).length;
    console.log(
      `L5 hydration: ${results.length} fixtures — ${claimed} claim every node, ` +
        `${registered.size} registered divergence(s)`,
    );
  });
});

// ---------------------------------------------------------------------------
// H3 — the logical index costs nothing on the client-render path
// ---------------------------------------------------------------------------

describe("H3 the hydration index is free when nothing hydrates", () => {
  /**
   * The rule's own falsification procedure: "compare emitted client-render code
   * with and without `hydratable`; the non-hydratable walk must carry no index
   * argument." Run over the whole corpus, in both directions — a build that
   * emitted `child(` unconditionally and a build that emitted it never would
   * both be caught, and the second is the one a green suite hides.
   */
  test("no fixture's ordinary emission mentions the walk helpers", () => {
    const offenders: string[] = [];
    for (const name of FIXTURES) {
      const plain = compileSource(fixtureSource(name), `${name}.tsx`);
      if (/\bchild as |\bsib as |_\$+child\(|_\$+sib\(/.test(plain)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  test("and some fixture's hydratable emission does", () => {
    const users = FIXTURES.filter((name) =>
      /_\$+child\(|_\$+sib\(/.test(
        compileSource(fixtureSource(name), `${name}.tsx`, {
          hydratable: true,
        }),
      ),
    );
    expect(users.length).toBeGreaterThan(0);
  });

  test("and the wire bytes are the difference, not a normalisation", () => {
    const offenders: string[] = [];
    for (const name of FIXTURES) {
      const plain = compileSource(fixtureSource(name), `${name}.tsx`, { ssr: true });
      if (plain.includes("<!--[-->") || plain.includes("<!--]-->")) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the other setting of the axis
// ---------------------------------------------------------------------------

/**
 * The one fixture whose two columns are allowed to differ, and why.
 *
 * `escaping-adversarial` puts a hole inside a `<textarea>`. The server writes a
 * compensating U+000A there because a conforming parser eats one; happy-dom eats
 * neither that one nor the one in the client's own template parse, so the
 * claimed text is a newline longer than the value. Production SEES that as a
 * text drift and carries on — the DOM it ends up with is the cold one, node for
 * node. Development takes the structural route the detection axis exists for and
 * REBUILDS the range, which is the same tree by a more expensive path.
 *
 * It is a property of the fake DOM, not of the emission: `browser-parse-check.ts`
 * measures the same bytes in Chrome, where both newlines are eaten and neither
 * column reports anything. Named here rather than absorbed, so a SECOND fixture
 * arriving in this state is a failure that has to be read.
 */
const DEV_DIVERGES = new Set(["escaping-adversarial"]);

describe("L5 hydration conformance, with detection on", () => {
  for (const name of FIXTURES) {
    test(`${name} hydrates the same way under \`dev\``, async () => {
      const production = (await ALL).get(name) as Result;
      const development = (await ALL_DEV).get(name) as Result;
      // Same tree, same report. Detection may only make the client SEE a
      // divergence, never make one — and the corpus has none, so a dev build
      // that reports anything production does not has found a false positive in
      // the detector rather than a bug in the corpus.
      //
      // The tree is compared for every fixture; the REPORT is what a registered
      // row above may differ on, because detection is what decides whether a
      // drift it can see is recovered from or lived with.
      expect({ name, cold: development.coldShape, shape: development.hydratedShape }).toEqual({
        name,
        cold: production.coldShape,
        shape: production.hydratedShape,
      });
      if (DEV_DIVERGES.has(name)) return;
      expect({
        name,
        kinds: [...new Set(development.mismatches)].toSorted(),
        recovered: development.recovered,
      }).toEqual({
        name,
        kinds: [...new Set(production.mismatches)].toSorted(),
        recovered: production.recovered,
      });
    });
  }
});

// ---------------------------------------------------------------------------
// the payload, measured
// ---------------------------------------------------------------------------

/** One wire, measured raw and gzipped. */
interface Bytes {
  raw: number;
  gz: number;
}

function bytes(markup: string): Bytes {
  return { raw: markup.length, gz: Bun.gzipSync(new TextEncoder().encode(markup)).length };
}

function delta(before: Bytes, after: Bytes): string {
  const pct = (a: number, b: number): string =>
    b === a ? "+0.0" : `+${(((b - a) / a) * 100).toFixed(1)}`;
  return (
    `${String(before.raw).padStart(6)} → ${String(after.raw).padStart(6)} raw ` +
    `(${pct(before.raw, after.raw)}%), ` +
    `${String(before.gz).padStart(5)} → ${String(after.gz).padStart(5)} gzipped ` +
    `(${pct(before.gz, after.gz)}%)`
  );
}

describe("the claim payload", () => {
  /**
   * "Revisit if the measured byte cost is material on a real page."
   * it was — 55.7% raw and 7.3% gzipped on the 100-row page — and the
   * decision reversed. THE WIRE CARRIES WHAT RECOVERY NEEDS, AND DETECTION IS
   * AN EMISSION AXIS.
   *
   * So the payload is measured on four wires rather than two: the corpus and
   * the 100-row page, each compiled for production and for development. The
   * numbers are printed rather than asserted at a threshold nobody agreed to,
   * with three assertions that ARE agreed — the bytes are comments, so the two
   * markups differ by comments alone; the production page costs ZERO, which is
   * the acceptance criterion; and development costs MORE than production,
   * because a detection axis nobody can measure is not an axis.
   */
  test("costs what it costs, on the corpus and on a real page, in both builds", async () => {
    let plain = 0;
    let production = 0;
    let development = 0;
    for (const name of FIXTURES) {
      const before = wire(
        await loadModule(
          compileSource(fixtureSource(name), `${name}.tsx`, { ssr: true }),
          `pay-plain-${name}`,
        ),
      );
      plain += before.length;
      for (const dev of [false, true]) {
        const after = wire(
          await loadModule(
            compileSource(fixtureSource(name), `${name}.tsx`, { ssr: true, hydratable: true, dev }),
            `pay-hy-${dev ? "dev" : "prod"}-${name}`,
          ),
        );
        if (dev) development += after.length;
        else production += after.length;
        // The ONLY difference is the claim scaffolding. Anything else in this
        // delta would be markup the two backends disagree about, which is a
        // different bug and belongs to a different suite. Both sides are
        // stripped because a fixture may legitimately CONTAIN a `<!---->` in its
        // prose — `marker-literal-text` does — and removing it from one side
        // only would read that as a byte the flag added.
        expect(strip(after)).toBe(strip(before));
      }
    }

    const page = await realPage(PAGE, "sole");
    const mixed = await realPage(MIXED_PAGE, "mixed");
    console.log(
      "the claim payload, after §12's split:\n" +
        `  corpus       production  ${plain} → ${production} bytes\n` +
        `  corpus       development ${plain} → ${development} bytes\n` +
        `  100-row page, every hole the SOLE OCCUPANT of its element:\n` +
        `    production  ${delta(page.plain, page.production)}\n` +
        `    development ${delta(page.plain, page.development)}\n` +
        `  100-row page, holes with STATIC SIBLINGS and a per-row <Show>:\n` +
        `    production  ${delta(mixed.plain, mixed.production)}\n` +
        `    development ${delta(mixed.plain, mixed.development)}`,
    );

    // The acceptance criterion: the production number should go to roughly
    // zero, and if it does not the split did not land. On THIS page it is
    // zero EXACTLY — every hole owns the element it sits in, every row is
    // claimed from one cursor, and the list owns the `<tbody>` — so this is an
    // equality rather than a tolerance, and one byte creeping back fails it.
    expect(page.production).toEqual(page.plain);
    // And zero is a property of that SHAPE, not of the split. The moment a hole
    // shares its parent with anything static, the OPEN stops the parser fusing
    // the two text runs and the CLOSE is the anchor every later write uses, so
    // production pays — which is asserted here rather than left as a headline
    // the sole-occupant page alone would support. H2 carries the number.
    expect(mixed.production.raw).toBeGreaterThan(mixed.plain.raw);
    expect(mixed.production.gz).toBeGreaterThan(mixed.plain.gz);
    // Development pays, and it is supposed to: that is where the detection is.
    // An axis that costs the same in both builds is not an axis.
    expect(development).toBeGreaterThan(production);
    expect(page.development.raw).toBeGreaterThan(page.production.raw);
    expect(mixed.development.raw).toBeGreaterThan(mixed.production.raw);
  });
});

/** Remove the claim scaffolding from a markup string. */
function strip(markup: string): string {
  return markup
    .replaceAll(/<!--\[[^]*?-->/g, "")
    .replaceAll("<!--]-->", "")
    .replaceAll("<!---->", "");
}

const PAGE = `
import { For, signal } from "@barqjs/core";
const rows = signal(
  Array.from({ length: 100 }, (_, i) => ({ id: i, label: "row " + i, tag: i % 7 })),
);
export default function Page() {
  return (
    <table class="rows">
      <tbody>
        <For each={rows()}>
          {(row) => (
            <tr class={"r" + row.tag}>
              <td class="id">{row.id}</td>
              <td class="label"><a href={"/row/" + row.id}>{row.label}</a></td>
              <td class="tag">{row.tag}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
`;

/**
 * The same 100 rows, but shaped like an ordinary page instead of like
 * js-framework-benchmark's table: every dynamic value has a static neighbour,
 * and each row carries a `<Show>` whose range does too. `PAGE` is the shape the
 * production number is zero on, and it is zero BECAUSE of the shape — this is
 * the page that says what the split costs everywhere else.
 */
const MIXED_PAGE = `
import { For, Show, signal } from "@barqjs/core";
const rows = signal(
  Array.from({ length: 100 }, (_, i) => ({ id: i, label: "row " + i, tag: i % 7 })),
);
export default function Page() {
  return (
    <table class="rows">
      <tbody>
        <For each={rows()}>
          {(row) => (
            <tr class={"r" + row.tag}>
              <td class="id">#{row.id}.</td>
              <td class="label">name: <a href={"/row/" + row.id}>{row.label}</a> ({row.tag})</td>
              <td class="tag">tag <Show when={row.tag > 3}>hot</Show> end</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
`;

async function realPage(
  source: string,
  slug: string,
): Promise<{ plain: Bytes; production: Bytes; development: Bytes }> {
  const one = async (tag: string, options: Record<string, unknown>): Promise<Bytes> =>
    bytes(wire(await loadModule(compileSource(source, "page.tsx", options), tag)));
  return {
    plain: await one(`payload-page-${slug}-plain`, { ssr: true }),
    production: await one(`payload-page-${slug}-prod`, { ssr: true, hydratable: true }),
    development: await one(`payload-page-${slug}-dev`, {
      ssr: true,
      hydratable: true,
      dev: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// H6 — interactive state survives hydration
// ---------------------------------------------------------------------------

const FORM = `
import { signal } from "@barqjs/core";
export const seen = signal(0);
export default function Form() {
  return (
    <form class="f">
      <input class="name" type="text" value="" onInput={() => seen.set(seen() + 1)} />
      <button type="submit">go</button>
    </form>
  );
}
`;

describe("H6 focus and typed input survive hydration", () => {
  /**
   * The rule's own falsification procedure: "focus an input and type before
   * hydration completes; after hydration, `document.activeElement` and the
   * input's value must be unchanged."
   *
   * The replace-based path measured `focusKept: false` and
   * `inputValueKept: ""` at EVERY page size on the replace-based path, and
   * `server.ts` conceded the cause in a comment: capture was coordinate-based
   * "(as coordinates — the nodes get replaced)" and keyboard events could not be
   * replayed at all. Both halves are asserted here — the node is the same object
   * AND the state on it is the user's.
   */
  test("the input is the server's node, still focused, with the text still in it", async () => {
    const compiled = await compileText(FORM, "h6-form");
    const core = await import("@barqjs/core");
    const container = host(wire(compiled.ssr));

    const input = container.querySelector("input") as HTMLInputElement;
    const before = input;
    // What a user did before the bundle arrived. The capture snippet records
    // exactly this shape; driving the queue directly is what makes the test
    // about HYDRATION rather than about happy-dom's event plumbing.
    input.focus();
    input.value = "half a word";
    const path: number[] = [];
    for (let node: Node | null = input; node !== null && node !== document.body;) {
      let index = 0;
      for (let back = node.previousSibling; back !== null; back = back.previousSibling) index++;
      path.unshift(index);
      node = node.parentNode;
    }
    const globals = globalThis as {
      __BARQ_EVTS__?: unknown[];
      __BARQ_EVTS_STOP__?: () => void;
    };
    globals.__BARQ_EVTS__ = [
      {
        type: "@state",
        path,
        value: "half a word",
        start: 11,
        end: 11,
        focus: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      },
      {
        type: "keydown",
        path,
        key: "d",
        code: "KeyD",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      },
    ];
    globals.__BARQ_EVTS_STOP__ = (): void => {};

    const dispose = core.hydrate(compiled.dom.default as never, container);
    const after = container.querySelector("input") as HTMLInputElement;

    // H1 first: without the node, none of the rest is even a question.
    expect(after).toBe(before);
    // H6, both halves.
    expect(after.value).toBe("half a word");
    expect(document.activeElement).toBe(after);
    expect(core.hydrate.report.recovered).toBe(false);

    dispose();
    container.remove();
  });

  /**
   * The other half of the claim, and the one the old design could not make at
   * all: a KEYBOARD event lands on the element the user was typing into.
   * `server.ts` said why it could not — "keyboard/input events can't be replayed
   * faithfully across node replacement" — so this is a capability test, not a
   * regression test.
   */
  test("a keystroke captured before hydration replays against that same node", async () => {
    const compiled = await compileText(FORM, "h6-keys");
    const core = await import("@barqjs/core");
    const container = host(wire(compiled.ssr));
    const input = container.querySelector("input") as HTMLInputElement;

    let saw: EventTarget | null = null;
    input.addEventListener("keydown", (event) => {
      saw = event.target;
    });

    const path: number[] = [];
    for (let node: Node | null = input; node !== null && node !== document.body;) {
      let index = 0;
      for (let back = node.previousSibling; back !== null; back = back.previousSibling) index++;
      path.unshift(index);
      node = node.parentNode;
    }
    const globals = globalThis as { __BARQ_EVTS__?: unknown[]; __BARQ_EVTS_STOP__?: () => void };
    globals.__BARQ_EVTS__ = [
      {
        type: "keydown",
        path,
        key: "x",
        code: "KeyX",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      },
    ];
    globals.__BARQ_EVTS_STOP__ = (): void => {};

    const dispose = core.hydrate(compiled.dom.default as never, container);
    expect(saw).toBe(input);
    dispose();
    container.remove();
  });
});

// ---------------------------------------------------------------------------
// what claiming costs against what replacing costs
// ---------------------------------------------------------------------------

describe("claim against replace", () => {
  /**
   * The replace path was measured losing focus and discarding
   * typed input at EVERY page size, and put the layout cost past a 60Hz frame at
   * about 3500 nodes. The first half is asserted by H6 above. This is the
   * second, on the same page at four sizes: the claim path against the path a
   * page that was NOT compiled hydratable takes, which is the same full client
   * render `hydrate` degrades to and therefore exactly today's behaviour.
   *
   * happy-dom does no layout, so this is a NODE-WORK number and not a frame
   * budget — the frame claim needs a real browser and belongs with the Chrome
   * differential. What it does measure honestly is how much of the page each
   * strategy has to construct, which is the input to that cost.
   */
  test("costs what it costs, at four page sizes", async () => {
    const core = await import("@barqjs/core");
    const rows: string[] = [];
    for (const size of [10, 100, 400, 1000]) {
      const source = ROWS(size);
      const claiming = await compileText(source, `perf-claim-${size}`);
      const replacing = await compileText(source, `perf-replace-${size}`, false);
      const markup = wire(claiming.ssr);
      const plain = wire(replacing.ssr);

      const hot = time(() => {
        const container = host(markup);
        core.hydrate(claiming.dom.default as never, container)();
        container.remove();
      });
      const cold = time(() => {
        const container = host(plain);
        core.hydrate(replacing.dom.default as never, container)();
        container.remove();
      });
      rows.push(
        `  ${String(size).padStart(4)} rows  claim ${hot.toFixed(0).padStart(5)} µs   ` +
          `replace ${cold.toFixed(0).padStart(5)} µs   ${(cold / hot).toFixed(2)}x`,
      );
    }
    console.log(`hydration, claim against replace (median of 21):\n${rows.join("\n")}`);
    // Deliberately no threshold. The number that MATTERS is H6's, and a wall
    // clock in a fake DOM is not the place to assert a speedup nobody agreed to.
    expect(rows.length).toBe(4);
  });
});

function ROWS(n: number): string {
  return `
import { For, signal } from "@barqjs/core";
export const rows = signal(Array.from({ length: ${n} }, (_, i) => ({ id: i, label: "row " + i })));
export default function Page() {
  return (
    <table class="rows"><tbody>
      <For each={rows()}>
        {(row) => <tr class="r"><td class="id">{row.id}</td><td class="label">{row.label}</td></tr>}
      </For>
    </tbody></table>
  );
}
`;
}

function time(run: () => void): number {
  for (let i = 0; i < 3; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < 21; i++) {
    const started = Bun.nanoseconds();
    run();
    samples.push((Bun.nanoseconds() - started) / 1000);
  }
  return samples.toSorted((a, b) => a - b)[10];
}
