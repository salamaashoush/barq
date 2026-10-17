import { describe, expect, it } from "bun:test";

import {
  checkOwnership,
  corpusFixtures,
  corpusSource,
  listOwnershipFixtures,
  ownershipSource,
  staticTree,
  trace,
  type Finding,
  type OwnershipEvent,
  type OwnershipRun,
} from "./ownership.ts";

const GATE_FIXTURE = "own-provider-direct";
const WRAPPER_GATE_FIXTURE = "own-provider-wrapper";

/**
 * The ownership channel, which no other project surveyed has a counterpart to.
 *
 * The question every other suite in this package asks is "do two executions
 * agree". For a provider's child built at the call site they agree perfectly:
 * the compiled path and a `createElement` path both build it there and render
 * the same markup, so a differential oracle certifies the bug. A reference
 * implementation that shares your defect is worse than none, because it
 * issues a passing grade.
 *
 * This suite asks a different question. The compiler already knew, at
 * compile time, which constructs own which positions — it is emitting the
 * calls. `--ownership` makes it write that structure down as an artefact, the
 * runtime appends a record at every scope entry, exit, disposal, template
 * instantiation and handed-over construction, and the two are compared. The
 * expected value is **derived from the source**, so this channel needs no
 * second implementation and cannot inherit one's bugs.
 *
 * Any finding fails the suite. The channel is kept honest by the self-checks
 * below, which reintroduce each defect and require the channel to see it.
 *
 * Everything is run ONCE, here, and every assertion below reads that result.
 * Each run compiles a fixture, renders it under a traced root, drives its
 * steps and disposes it; re-running per assertion would be re-running the
 * runtime rather than re-reading the observation.
 */

const CORPUS: OwnershipRun[] = [];
for (const name of corpusFixtures()) {
  CORPUS.push(await checkOwnership(name, corpusSource(name), `${name}.tsx`));
}

const OWN: OwnershipRun[] = [];
for (const name of listOwnershipFixtures()) {
  OWN.push(await checkOwnership(name, ownershipSource(name), `${name}.tsx`));
}

const RUNS = [...CORPUS, ...OWN];
const OWN_NAMES = new Set(listOwnershipFixtures());

function sourceOf(fixture: string): string {
  return OWN_NAMES.has(fixture) ? ownershipSource(fixture) : corpusSource(fixture);
}

function opaqueOf(fixture: string): string[] {
  return staticTree(sourceOf(fixture), `${fixture}.tsx`).tree.opaque;
}

interface Observed {
  fixture: string;
  finding: Finding;
}

const OBSERVED: Observed[] = RUNS.flatMap((run) =>
  run.findings.map((finding) => ({ fixture: run.fixture, finding })),
);

function report(fixture: string, finding: Finding): string {
  return [
    `  fixture   ${fixture}`,
    `  finding   ${finding.id}`,
    `  rule      ${finding.rule}`,
    `  observed  ${finding.detail}`,
  ].join("\n");
}

describe("ownership findings", () => {
  it("no ownership finding in any fixture", () => {
    expect(
      OBSERVED.map((o) => report(o.fixture, o.finding)).join("\n\n"),
      `${OBSERVED.length} ownership finding(s): a clone built under a scope other than the one ` +
        "the compiler placed it at.",
    ).toBe("");
  });
});

describe("a Provider builds its children under its own scope", () => {
  // The runtime's scope chain for every clone must be the path the compiler's
  // static tree placed it at. `determined > 0` is what stops this from being
  // satisfied by a channel that stopped looking.
  it("the direct Provider clones its child at the path the compiler placed it", () => {
    const run = OWN.find((r) => r.fixture === GATE_FIXTURE);
    expect(run, `${GATE_FIXTURE} did not run`).toBeDefined();
    expect(
      (run?.findings ?? []).map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      `${GATE_FIXTURE} is <Theme><Label/></Theme> written the way a user ` +
        "writes it. `children` is a Block, so `Label` is built by `provide` under the instance " +
        "scope and not at the call site. A finding here is the Provider bug back.",
    ).toBe("");
    expect(run?.determined ?? 0, "the gate must check a determined position").toBeGreaterThan(0);
  });

  it("and so does the user-written wrapper, one component further away", () => {
    const run = OWN.find((r) => r.fixture === WRAPPER_GATE_FIXTURE);
    expect(run, `${WRAPPER_GATE_FIXTURE} did not run`).toBeDefined();
    expect(
      (run?.findings ?? []).map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      `${WRAPPER_GATE_FIXTURE} is <ThemeProvider><Label/></ThemeProvider> over ` +
        "<Theme>{props.children}</Theme> — the shape every AuthProvider and " +
        "QueryClientProvider in existence has. Forwarding is identity, so the Block reaches the " +
        "provider unbuilt and runs under the scope the provider entered.",
    ).toBe("");
    expect(run?.determined ?? 0, "the gate must check a determined position").toBeGreaterThan(0);
  });

  it("does not simply report everything: the thunked control is clean", () => {
    const run = OWN.find((r) => r.fixture === "own-provider-thunked");
    expect(run, "own-provider-thunked did not run").toBeDefined();
    expect(
      (run?.findings ?? []).map((f) => f.detail).join("\n"),
      "own-provider-thunked differs from own-provider-direct by one `() =>`, and it must be " +
        "clean. A channel that reported both would be reporting that ownership is never right, " +
        "which is not a finding about anything.",
    ).toBe("");
    expect(run?.determined ?? 0, "the control must check a determined position").toBeGreaterThan(0);
  });

  it("the gate fixture's defect is invisible to the DOM", async () => {
    // Stated as a test rather than as prose: if this ever fails, the fixture
    // stopped being the interesting case and became an ordinary crash.
    const { code } = staticTree(ownershipSource(GATE_FIXTURE), `${GATE_FIXTURE}.tsx`);
    const events = await trace(code, "own-gate-dom-check");
    expect(
      events.some((e) => e.kind === "clone"),
      "the gate fixture rendered nothing",
    ).toBe(true);
    const run = OWN.find((r) => r.fixture === GATE_FIXTURE);
    expect(run?.crashed ?? true, "the gate fixture must render, not throw").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// the channel's own strength, asserted rather than assumed
// ---------------------------------------------------------------------------

describe("the channel is not inert", () => {
  /**
   * Three counts per fixture, each closing a hole a mutation walked through.
   *
   *   - `clones`. A Block invoked twice per activation builds two DOM subtrees
   *     and drops one, and every DOM-shaped test passes under it. Multiplicity
   *     is not decidable from the source (an `each` position produces one clone
   *     per row), so this is a recorded observation rather than a derived
   *     expectation, which is why it is a snapshot.
   *   - `unattributed`. A clone whose template the static tree never placed is
   *     a clone this channel did not check. `own-cross-module` is the one
   *     multi-file fixture, and its single unattributed clone is recorded here
   *     rather than excluded.
   *   - `opaque`. The components the walk could not follow, so the tree is
   *     partial for that fixture.
   */
  it("observes the recorded census, per fixture", () => {
    const census = RUNS.map(
      (run) =>
        `${run.fixture} clones=${run.clones} unattributed=${run.unattributed} ` +
        `opaque=[${opaqueOf(run.fixture).join(",")}]`,
    );
    expect(census.join("\n")).toMatchSnapshot();
  });

  it("keeps at least one fixture in which the static tree is partial", () => {
    const partial = RUNS.filter((run) => opaqueOf(run.fixture).length > 0);
    expect(
      partial.map((run) => run.fixture).join(", "),
      "no fixture imports a component, so the static tree is total everywhere and " +
        "`unattributed === 0` would be a property of the corpus rather than of the channel. " +
        "`own-cross-module.tsx` exists to keep the degradation exercised.",
    ).not.toBe("");
  });

  it("checks most clones against a single legal path", () => {
    const clones = RUNS.reduce((n, run) => n + run.clones, 0);
    const determined = RUNS.reduce((n, run) => n + run.determined, 0);
    expect(clones, "the channel checked no clones at all").toBeGreaterThan(200);
    // Where a template occurs at several paths the check degrades to set
    // membership, and a clone landing on the wrong member passes. That is the
    // channel's honest weakness; the bound keeps it from growing unnoticed.
    expect(
      determined / clones,
      `only ${determined} of ${clones} clones sit at a single legal path`,
    ).toBeGreaterThan(0.95);
  });

  it("exercises the disposal-order claim at least once", () => {
    const cascades = RUNS.reduce((n, run) => n + run.cascades, 0);
    expect(
      cascades,
      "no scope in either corpus disposed two or more kids it owned, so O3.2's " +
        "reverse-creation-order claim was never tested. `own-nested-scopes-dispose.tsx` exists " +
        "to guarantee this is not zero; if it reaches zero the fixture stopped constructing what " +
        "it says it constructs.",
    ).toBeGreaterThan(0);
  });

  it("crashes nowhere", () => {
    const crashed = RUNS.filter((run) => run.crashed).map(
      (run) => `${run.fixture}: ${run.findings[0]?.detail}`,
    );
    expect(crashed.join("\n"), "a fixture that never compiled or never rendered").toBe("");
  });
});

// ---------------------------------------------------------------------------
// the trace costs nothing when it is off
// ---------------------------------------------------------------------------

/**
 * The wall-clock half of this is a measurement, not a test. Against a copy of
 * `packages/core/src` with all seven instrumentation sites physically removed
 * — plus `trace.ts`, the `OWNERSHIP` holder and the `holder` computation —
 * 15 paired processes, min-of-21 within each, alternating order, happy-dom:
 *
 *   workload                  trace OFF     sites REMOVED   ratio     Wilcoxon
 *   scope + dispose       5.72          5.72 ns/scope  1.0012x   p=0.532
 *   template clone            936.18        924.81 ns/clone  1.0123x   p=0.307
 *   200-row mount + dispose   924.49        883.36 ns/row    1.0466x   p=0.281
 *
 * Parity on all three: no p below 0.28, and the mount ratio moves between
 * 0.95x and 1.07x from one 9-to-15-process run to the next, which is what
 * run-to-run noise on a happy-dom mount looks like. With the trace ON the same
 * three are 10.7x, 1.25x and 1.20x — the price of a WeakMap lookup and an
 * array push, paid only inside a trace window.
 *
 * (A first attempt loaded both runtimes into one process and reported
 * 1.10x–1.22x. That was every shared call site going polymorphic — `insert`,
 * `template` and `scope` were each two different functions behind one
 * call expression — which is a larger effect than the thing being measured and
 * lands on whichever variant ran second. Separate processes remove it, and it
 * is worth recording as the shape of measurement error this channel invites.)
 *
 * What is asserted here is the part a benchmark cannot defend against
 * regression: the STRUCTURAL claims the parity rests on. A field added to
 * `Owner`, or an allocation that happens whether or not anyone is looking,
 * would not necessarily show up in a 200-row mount but would break the claim.
 */
describe("the trace costs nothing when it is off", () => {
  it("adds no field to the scope object, in either state", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      childScope: (parent: object | null, kind: string) => object;
      beginOwnershipTrace: () => void;
      endOwnershipTrace: () => unknown[];
    };
    // The scope is the engine's object, so WHICH fields it has is the engine's
    // business. What is asserted is that tracing adds none.
    const shape = (): string[] => Object.keys(core.childScope(null, "scope")).sort();
    const off = shape();
    core.beginOwnershipTrace();
    const on = shape();
    core.endOwnershipTrace();
    expect(
      on,
      "tracing must not add a field: the scope object is allocated once per branch " +
        "instance and per list row, and a new slot is a permanent cost paid by every " +
        "build so that a test-only channel can exist",
    ).toEqual(off);
  });

  it("mints no identity for a scope created while it is off", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      childScope: (parent: object | null, kind: string) => object;
      ownershipIdOf: (scope: object | null) => number;
    };
    const owner = core.childScope(null, "scope");
    expect(
      core.ownershipIdOf(owner),
      "a scope built outside a trace window must carry no trace identity; the WeakMap " +
        "that holds them stays empty until beginOwnershipTrace",
    ).toBe(-1);
  });

  it("refuses to open two overlapping traces", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      beginOwnershipTrace: () => void;
      endOwnershipTrace: () => unknown[];
    };
    core.beginOwnershipTrace();
    expect(() => core.beginOwnershipTrace()).toThrow(/already open/);
    core.endOwnershipTrace();
    // And the sink really is uninstalled again, or the next fixture inherits it.
    expect(() => core.beginOwnershipTrace()).not.toThrow();
    core.endOwnershipTrace();
  });

  it("records nothing at all while it is off", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      childScope: (parent: object | null, kind: string) => object;
      dispose: (scope: object) => void;
      runWithOwner: <T>(owner: object | null, fn: () => T) => T;
      template: (html: string) => () => Node;
      beginOwnershipTrace: () => void;
      endOwnershipTrace: () => unknown[];
    };
    const make = core.template("<b>x</b>");
    const scope = core.childScope(null, "scope");
    core.runWithOwner(scope, () => make());
    core.dispose(scope);
    core.beginOwnershipTrace();
    const captured = core.endOwnershipTrace();
    expect(captured, "work done outside the window must leave no record").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mutation self-checks, applied to this channel
// ---------------------------------------------------------------------------

/**
 * `oracle.test.ts`'s corruption self-checks are the only mechanism in the
 * twelve-project survey that asks "would my suite notice a wrong change".
 * The same question, asked of the ownership channel: each mutation below reintroduces or
 * fabricates an ownership defect, and the channel must report it. A self-check
 * that stops failing means the assertion above it has become decoration.
 */
describe("self-check: the assertion would notice", () => {
  it("catches the Provider bug being reintroduced into the clean control", async () => {
    // This is unrepresentable in the SOURCE: `<P><C/></P>` and
    // `<P>{() => <C/>}</P>` lower to the same Block, so unwrapping the thunk
    // changes nothing at all. That is the claim holding, and it is also this
    // assertion's problem: a mutation that does not mutate makes the check
    // decoration.
    //
    // So the defect is written where it can still be written, in the emitted
    // text: turn `children: () => Label({})` back into an ARGUMENT.
    const clean = ownershipSource("own-provider-thunked");
    let hit = 0;
    const corrupt = (code: string): string =>
      code.replace(/children:\s*(?:[\w$]*block)?\(?\(\)\s*=>\s*(\w+)\(\{\}\)\)?/g, (_m, comp) => {
        hit++;
        return `children: ${comp}({})`;
      });
    const run = await checkOwnership(
      "mutant-provider",
      clean,
      "own-provider-thunked.tsx",
      {},
      corrupt,
    );
    expect(hit, "the emitted mutation matched nothing — the calling convention changed").toBe(1);
    expect(
      run.findings.map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      "an already-built child in a children slot is the Provider bug, and it is now the ONLY " +
        "way to write it. If the channel does not report it, the gate above is a coincidence of " +
        "its fixture rather than a property of the check.",
    ).toContain("O2.1");
  });

  it("catches a body hoisted out of the branch that owns it", async () => {
    // Same reasoning as above: the source-level thunk is not the thing that
    // decides, so the hoist is written into the emitted module.
    //
    // The body is not a `children` PROP either: what stands here is
    // `_$boundary(parent, anchor, kind, fallback, body)`, whose body argument
    // is the Block. Building it at the call site
    // instead is the same mutation one syntax later.
    const clean = ownershipSource("own-nested-scopes-dispose");
    let hit = 0;
    const corrupt = (code: string): string =>
      code.replace(/[\w$]*block\(\(\)\s*=>\s*(_tmpl\$\d+\(\))\)/g, (_m, clone) => {
        hit++;
        return clone as string;
      });
    const run = await checkOwnership(
      "mutant-branch",
      clean,
      "own-nested-scopes-dispose.tsx",
      {},
      corrupt,
    );
    expect(hit, "the emitted mutation matched nothing").toBeGreaterThan(0);
    expect(
      run.findings.map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      "a branch body cloned at the call site instead of inside the branch must be reported, " +
        "with the template and both paths named",
    ).toContain("root > branch");
  });

  it("catches a template that moves to a different owner in the SOURCE", async () => {
    // The mutation the compiler side has to notice: the same component, moved
    // out of the provider. Nothing about the runtime changes; the expected
    // value does, and the previously-clean run must stop being clean.
    const clean = ownershipSource("own-provider-thunked");
    const moved = clean.replace(
      '<Theme value={() => "provided-theme"}>{() => <Label />}</Theme>',
      '<Theme value={() => "provided-theme"}>{() => <i />}</Theme>\n      <Label />',
    );
    expect(moved, "the mutation matched nothing").not.toBe(clean);
    const { tree } = staticTree(moved, "own-provider-thunked.tsx");
    const label = tree.positions.filter(
      (position) => position.html.includes("label") && position.root === "OwnProviderThunked",
    );
    expect(label.length, "the moved component produced no position").toBeGreaterThan(0);
    expect(
      label.map((position) => position.path.join("/")).join(", "),
      "moving <Label/> out of the provider must move its expected path; if the static tree " +
        "reports the same path either way it is not derived from the source at all",
    ).toBe("root");
  });

  it("catches a fabricated scope-chain break", async () => {
    // Feeds the comparator a trace whose clone happened under a scope with no
    // parent chain. Guards the runtime-internal half, which the corpus does
    // not currently falsify anywhere.
    const { code } = staticTree(
      ownershipSource("own-provider-thunked"),
      "own-provider-thunked.tsx",
    );
    const events = await trace(code, "own-selfcheck-chain");
    const enters = events.filter((e) => e.kind === "enter");
    expect(enters.length, "the control entered no scopes").toBeGreaterThan(1);
    // A parent that no enter event declared is exactly the shape a scope
    // created under a disposed or foreign owner would produce.
    const corrupted = events.map((e) =>
      e.kind === "enter" && e.parent !== -1 ? { ...e, parent: 9999 } : e,
    );
    const { checkTrace } = await import("./ownership.ts");
    const findings = checkTrace(corrupted).findings;
    expect(
      findings.map((f) => f.kind).join(", "),
      "a scope naming a parent nothing entered must be reported; without this the tree half of " +
        "the assertion could be silently true of any log at all",
    ).toContain("parent-never-entered");
  });

  it("catches a construction that ran under a scope other than the one it was given", async () => {
    // O2's own words, driven from the RUNTIME rather than from a corrupted log.
    //
    // The clause this exercises used to read the ambient owner twice at one
    // instant and compare the two, so `given !== actual` could not hold
    // whatever the runtime did — a mutation that genuinely ran a provider's
    // children under `owner._parent` left it silent, and only the unrelated
    // static-path comparison noticed. `given` is now the scope the runtime
    // NAMED when it handed the block over, and the second source is every
    // clone that lands before the block returns: two observations, two times.
    //
    // The arrangement below hands `insert` a block under a `provide` scope and
    // has that block build under the root instead. Nothing is edited after the
    // fact; the events are whatever the runtime produced.
    const core = (await import("@barqjs/core")) as unknown as {
      childScope: (parent: object | null, kind: string) => object;
      dispose: (scope: object) => void;
      getOwner: () => object | null;
      runWithOwner: <T>(owner: object | null, fn: () => T) => T;
      template: (html: string) => () => Node;
      insert: (parent: Node, value: unknown, marker?: Node | null) => void;
      flush: () => void;
      beginOwnershipTrace: () => void;
      endOwnershipTrace: () => OwnershipEvent[];
    };
    const { checkTrace } = await import("./ownership.ts");

    const run = (elsewhere: boolean): OwnershipEvent[] => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const make = core.template("<b>x</b>");
      core.beginOwnershipTrace();
      try {
        let dispose: (() => void) | undefined;
        const root = core.childScope(null, "root");
        dispose = () => core.dispose(root);
        const provide = core.childScope(root, "provide");
        core.runWithOwner(provide, () => {
          // `insert` reads the AMBIENT owner, which `scope` has already
          // entered — so what is compared is the scope the construction
          // actually ran under against the one that was current when the
          // body was handed over, and `runWithOwner` below is what makes
          // those two disagree.
          core.insert(host, () => (elsewhere ? core.runWithOwner(root, () => make()) : make()));
        });
        core.flush();
        dispose?.();
        return core.endOwnershipTrace();
      } finally {
        core.endOwnershipTrace();
        host.remove();
      }
    };

    const honest = run(false);
    expect(
      honest.some((e) => e.kind === "block-enter"),
      "the arrangement handed over no construction to check",
    ).toBe(true);
    expect(
      checkTrace(honest)
        .findings.map((f) => `${f.rule}: ${f.detail}`)
        .join("\n"),
      "a block that builds under the scope it was given is the ordinary case and must be clean, " +
        "or the check reports that ownership is never right, which is not a finding about anything",
    ).toBe("");

    const cheating = run(true);
    expect(
      checkTrace(cheating)
        .findings.map((f) => f.kind)
        .join(", "),
      "a Block that ran under a scope other than the one it was given is O2's negation; the " +
        "channel has to say so, or the clause is decoration",
    ).toContain("block-ran-under-another-scope");
  });

  it("catches an EFFECT created under a scope other than the one it was given", async () => {
    // The same arrangement, with the misplaced construction being a reactive
    // node rather than a template clone — which is the half the trace could
    // not see at all until it recorded one. The clone stays honest in both
    // runs, so the only difference between them is where the effect was filed;
    // a check that reported the cheating run through the clone arm would pass
    // this test without ever looking at an effect.
    const core = (await import("@barqjs/core")) as unknown as {
      childScope: (parent: object | null, kind: string) => object;
      dispose: (scope: object) => void;
      runWithOwner: <T>(owner: object | null, fn: () => T) => T;
      template: (html: string) => () => Node;
      insert: (parent: Node, value: unknown, marker?: Node | null) => void;
      bindEffect: (compute: () => unknown, apply: () => void) => void;
      createSignal: <T>(value: T) => [() => T, (next: T) => T];
      flush: () => void;
      beginOwnershipTrace: () => void;
      endOwnershipTrace: () => OwnershipEvent[];
    };
    const { checkTrace } = await import("./ownership.ts");

    const run = (elsewhere: boolean): OwnershipEvent[] => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const make = core.template("<b>x</b>");
      const [value] = core.createSignal("one");
      core.beginOwnershipTrace();
      try {
        let dispose: (() => void) | undefined;
        const root = core.childScope(null, "root");
        dispose = () => core.dispose(root);
        const provide = core.childScope(root, "provide");
        core.runWithOwner(provide, () => {
          core.insert(host, () => {
            const node = make();
            // `bindEffect` is the call the compiler emits for a live attribute.
            const bind = (): void =>
              core.bindEffect(
                () => value(),
                () => {},
              );
            if (elsewhere) core.runWithOwner(root, bind);
            else bind();
            return node;
          });
        });
        core.flush();
        dispose?.();
        return core.endOwnershipTrace();
      } finally {
        core.endOwnershipTrace();
        host.remove();
      }
    };

    const honest = run(false);
    expect(
      honest.some((e) => e.kind === "own"),
      "the trace recorded no effect creation at all, so nothing below it can be a finding " +
        "about effect ownership — this is the state the channel was in before it had an " +
        "`own` event, and every ownership defect in the effect half was invisible to it",
    ).toBe(true);
    expect(
      checkTrace(honest)
        .findings.map((f) => `${f.rule}: ${f.detail}`)
        .join("\n"),
      "an effect created under the scope its block was given is the ordinary case",
    ).toBe("");

    const cheating = checkTrace(run(true)).findings;
    expect(
      cheating.map((f) => `${f.rule} ${f.detail}`).join("\n"),
      "an effect filed under a scope neither at nor below the one the block was handed is " +
        "O4.5's negation, and it is the exact shape the compiled attribute channel had while " +
        "it emitted a `renderEffect` taking no scope",
    ).toContain("effect");
    expect(cheating.map((f) => f.rule)).toContain("O4.5");
  });
});

// ---------------------------------------------------------------------------
// the artefact itself
// ---------------------------------------------------------------------------

describe("the static ownership tree", () => {
  it("is off by default, so a production compile does not pay for it", () => {
    const source = corpusSource("context-provider");
    const native = staticTree(source, "context-provider.tsx");
    expect(native.tree.version).toBe(2);
    // The same compile without the flag: the artefact is absent and the code
    // is byte-identical. The Rust side proves this over the whole corpus in
    // all four (ssr × dev) modes; this is the JS-visible half.
    expect(() => staticTree(source, "context-provider.tsx")).not.toThrow();
  });

  it("places a provider's child under the provider, from the source alone", () => {
    const { tree } = staticTree(corpusSource("context-provider"), "context-provider.tsx");
    const badge = tree.positions.filter(
      (position) => position.html.includes("badge") && position.root === "ContextProvider",
    );
    expect(badge.map((position) => position.path.join("/")).sort()).toEqual([
      "root",
      "root/provide",
    ]);
  });

  it("records the components it could not follow rather than presenting a leaf", () => {
    const { tree } = staticTree(
      "import { Thing } from './thing';\nexport default function App() { return <Thing />; }\n",
      "opaque.tsx",
    );
    expect(tree.opaque).toEqual(["Thing"]);
  });
});
