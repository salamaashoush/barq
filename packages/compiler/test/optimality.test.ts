import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  auditAnchors,
  auditCompiled,
  countMerges,
  renderViaCompiler,
  compileFixture,
  compileFixtureBody,
  compileSource,
  emittedCalls,
  fixtureOptimality,
  fixtureSource,
  formatDivergences,
  groupClones,
  groupTargets,
  listFixtures,
  loadModule,
  propCalls,
  bindEffectBodies,
  stripComments,
  stripLiterals,
  templateAnchors,
  templateHtml,
  type FixtureModule,
  type OptimalityExpectation,
} from "./harness.ts";
import { concatFixtures, TYPICAL_COMPONENT_FILE, typicalComponentFile } from "./measure.ts";
import { countAnchors } from "./normalize.ts";

/**
 * The optimisation targets, asserted on the emitted code.
 *
 * These assert on the emitted CODE, not on behaviour — oracle.test.ts already
 * proves behaviour. Every optimization target from the project brief has
 * exactly one block here, naming the fixture it runs against.
 *
 * THE TEST FOR WHETHER AN ASSERTION HERE IS EVIDENCE. Take the identity
 * round-trip — a "compiler" that emits its input back unchanged — and ask
 * whether the assertion still passes. If it does, it cannot distinguish this
 * compiler from a no-op and it is not proving a target; it is decoration. Upper
 * bounds (`<= 4 walks`), absences (`no "=>"`) and oracle-equality (`ok === true`)
 * all fail that test on their own, because uncompiled JSX contains no walks, no
 * emitted arrows, and is trivially equal to the oracle it IS. Every block below
 * therefore leads with a POSITIVE claim about what the compiler produced, and
 * uses the bound only to say the produced thing is also cheap.
 *
 * Run `bun test` against a stub `index.js` returning `{ code }` unchanged after
 * adding an assertion here.
 */

/**
 * Occurrences in CODE, never in a string a fixture happens to render. `=>` in a
 * doc comment and `.firstChild` in a rendered string both move an exact count,
 * and every count below is an equality — so this is `stripLiterals` for the same
 * reason `emittedCalls` and `templateAnchors` are.
 */
function count(code: string, pattern: RegExp): number {
  return countRaw(stripLiterals(code), pattern);
}

/** The same, on the module as written — for a claim ABOUT a literal's contents. */
function countRaw(code: string, pattern: RegExp): number {
  return (
    code.match(
      new RegExp(pattern, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`),
    )?.length ?? 0
  );
}

/**
 * How many times `needle` occurs AS ITSELF — never as the tail of a longer
 * identifier.
 *
 * `expect(code).toContain("ErrorBoundary(")` was green on a module that emits no
 * `ErrorBoundary` call at all, because the fixture's own default export is named
 * `ControlFlowErrorBoundary` and a substring search cannot tell a call from the
 * back half of a declaration. Every fixture in the corpus is named after the
 * construct it exercises, so that hole is not one fixture's accident — it is
 * available to every control-flow declaration here, on both sides: an `emits`
 * satisfied by a definition asserts nothing, and an `absent` that a definition
 * would satisfy could never be written at all.
 *
 * `$` is deliberately NOT an identifier character for this purpose. A
 * declaration may not name a compiler uid (see the test below), so a needle
 * naming a runtime helper is written `branch(` and has to match `_$branch(` —
 * the `_$` prefix is the emitter's, not the fixture's.
 */
function occurrences(code: string, needle: string): number {
  const anchored = /^[A-Za-z_]/.test(needle);
  let found = 0;
  for (let at = code.indexOf(needle); at !== -1; at = code.indexOf(needle, at + 1)) {
    if (!anchored || at === 0 || !/[A-Za-z0-9_]/.test(code[at - 1]!)) found++;
  }
  return found;
}

/** The runtime helpers the emitted module imports, by their exported names. */
function runtimeImports(code: string): string[] {
  const line = code.match(/^import \{([^}]*)\} from "@barqjs\/core";/m);
  return (line?.[1] ?? "")
    .split(",")
    .map((entry) => entry.trim().split(" as ")[0].trim())
    .filter((name) => name.length > 0)
    .sort();
}

const declarations = await Promise.all(
  listFixtures().map(async (name) => [name, await fixtureOptimality(name)] as const),
);

describe("declared optimality", () => {
  // Each fixture states what the compiler must make of it, next to the JSX that
  // is the claim. These run the declaration; the blocks below are the targets
  // whose claim needs more than a declaration can say.

  function assertDeclared(name: string, decl: OptimalityExpectation, module: string): void {
    // A declaration is a claim about EMITTED CODE, and a fixture's own prose is
    // not code — it reaches the module verbatim. `switch-match-component-bodies`
    // explains in a doc comment what the DOM target once emitted, spelling
    // `Switch({ children: [...] })` inside it, which is enough to falsify an
    // `absent: ["Switch("]` that is otherwise true of every line the compiler
    // wrote. Literals stay: half the declarations here are claims about the
    // markup inside a `template()` call.
    const code = stripComments(module);
    if (decl.templates !== undefined)
      expect(emittedCalls(code, "template"), "templates").toBe(decl.templates);
    if (decl.patchCalls !== undefined) {
      // Every call the module makes after the clone: holes, prop channels, and
      // the element channels channel resolution/the event channel gave their own entry points.
      const patches =
        emittedCalls(code, "insert") +
        propCalls(code) +
        emittedCalls(code, "ref") +
        emittedCalls(code, "listen") +
        emittedCalls(code, "bindEvent") +
        emittedCalls(code, "bindValue");
      expect(patches, "patch calls").toBe(decl.patchCalls);
    }
    for (const needle of decl.emits ?? []) {
      expect(
        occurrences(code, needle),
        `${name} must emit ${JSON.stringify(needle)}`,
      ).toBeGreaterThan(0);
    }
    for (const needle of decl.absent ?? []) {
      expect(occurrences(code, needle), `${name} must not emit ${JSON.stringify(needle)}`).toBe(0);
    }
    for (const [first, second] of decl.ordered ?? []) {
      const at = code.indexOf(first);
      const then = code.indexOf(second);
      expect(at, `${name}: ${JSON.stringify(first)} is missing`).toBeGreaterThan(-1);
      expect(then, `${name}: ${JSON.stringify(second)} is missing`).toBeGreaterThan(-1);
      expect(at, `${name}: ${JSON.stringify(first)} must come first`).toBeLessThan(then);
    }
  }

  /**
   * The other half of the matcher above, said out loud: a needle that occurs in
   * the module ONLY as the tail of a longer identifier is a needle whose
   * declaration is being satisfied by a name the fixture chose for itself.
   *
   * `assertDeclared` already refuses to count such an occurrence, so a needle
   * like that fails there — but it fails with "must emit", which reads as a
   * compiler regression and sends the next reader into `flow.rs`. This names it
   * for what it is instead: a needle like `ErrorBoundary(` would be satisfied by
   * nothing but the fixture's default export once the construct it names is
   * lowered onto `boundary`.
   */
  it("no emits needle is satisfied only by a longer identifier", () => {
    const shadowed: string[] = [];
    for (const [name, decl] of declarations) {
      if (!decl) continue;
      const code = stripComments(compileFixtureBody(name));
      for (const needle of decl.emits ?? []) {
        if (code.includes(needle) && occurrences(code, needle) === 0) {
          shadowed.push(`${name}: ${JSON.stringify(needle)}`);
        }
      }
    }
    expect(shadowed).toEqual([]);
  }, 120_000);

  it("no declaration names a compiler-generated identifier", () => {
    // A fixture that mentions `_$`, `_el$` or `_p$` — even inside a string in
    // its own optimality block — owns those names as far as the compiler is
    // concerned, so UID hygiene shifts every emitted uid to `_$$`. The
    // declaration still passes (it is asserted against the body with the block
    // stripped) while every module-wide scan in the harness quietly stops
    // matching: `patchedAttributeNames` sees no props, the attribute-order
    // corruption becomes a no-op. Keep needles uid-free; assert uid shapes from
    // the test file, where they run against the stripped body.
    const offenders = listFixtures().filter((name) => {
      const declaration = fixtureSource(name).match(/export const optimality = \{[\s\S]*?\n\}/);
      // `_s$` is on the list because the scope parameter is a compiler uid like
      // any other, and a fixture that names it in its own declaration block
      // shifts EVERY emitted uid to `_$$` — while the declaration itself keeps
      // passing, because it is asserted against the body with the block
      // stripped. That is the exact silent hole this test exists for, and the
      // C1 call shape is asserted from here instead (`the call shape is C1's`).
      return (
        declaration !== null && /_\$|_el\$|_p\$|_v\$|_o\$|_tmpl\$|_s\$|_k\$/.test(declaration[0])
      );
    });
    expect(offenders).toEqual([]);
  });

  /**
   * C1, stated once for the whole corpus instead of 38 times in fixture
   * strings. Ownership is AMBIENT: a component is invoked with its props and
   * nothing else, and a Block takes only the arguments its construct hands it.
   * So a call that still threads a scope, or a Block that still declares one,
   * fails here whatever any individual declaration happens to spell.
   *
   * The uid `_s$` is the witness. It named the threaded scope and the emitter
   * has no other use for it, so its total absence from the corpus is the
   * strongest single statement that the channel is gone — one grep standing in
   * for every call site the change had to reach.
   *
   * It lives in the test file because a fixture may not name a compiler uid:
   * see the test above for what happens when one does.
   */
  it("the call shape is C1's: props first, and no scope threaded anywhere", () => {
    let calls = 0;
    let blocks = 0;
    const threaded = new Map<string, string[]>();
    for (const name of listFixtures()) {
      const code = stripLiterals(compileFixtureBody(name));
      // Anything still spelling the scope uid, wherever it appears: a call
      // argument, a Block parameter, or a module-level `const _s$ = null`.
      const lost = [...code.matchAll(/[\w$]*\(?\s*(_s\$)[,)\s]/g)].map((m) => m[1]!);
      if (lost.length > 0) threaded.set(name, [...new Set(lost)]);
      // The two shapes the compiler emits for a component call, and the props
      // are the first argument of both.
      calls += [...code.matchAll(/(?<![\w$.])[A-Z][\w$]*\(\s*(\{|_\$props\()/g)].length;
      // A Block is BRANDED at its definition site. The brand is what lets a
      // consumer test kind instead of guessing it from arity — which matters
      // more now, not less, because a zero-arity Block and a Cell are the same
      // shape and only the brand tells them apart.
      //
      // A body is not always a NAMED slot: the flow pass hands
      // `branch`/`each`/`boundary`/`portal` their bodies positionally, so the
      // brand is what identifies one and there is no prop name to anchor on.
      blocks += [...code.matchAll(/[\w$]*block\(\(/g)].length;
    }
    expect(
      [...threaded].map(([name, uids]) => `${name}: ${uids.join(", ")}`),
      "the scope uid survives somewhere, so the threading channel is not gone",
    ).toEqual([]);
    // A floor that says the sweep really looked, not a ratchet on the count.
    // It was 40 while `Comp(_s$` matched every call including the ones whose
    // props are a bare identifier; props-first matches the object and source
    // list shapes only, and the corpus has 31 of those.
    expect(calls, "the sweep found no component calls at all").toBeGreaterThan(25);
    expect(blocks, "the sweep found no Blocks at all").toBeGreaterThan(30);
  }, 120_000);

  /**
   * A fixture without an `optimality` block contributes nothing to the
   * definition-of-done loop — `assertDeclared` skips it silently. That is a
   * decision for a few fixtures and an omission for none of them, so each one
   * names the channel that carries its claim instead — and the channel is
   * CHECKED.
   *
   * Every entry below is a predicate over the fixture and its emitted module,
   * because a reason cannot rot silently when the suite runs it: an excuse that
   * stopped being true fails here rather than sitting in a comment.
   */
  interface Excuse {
    why: string;
    holds: (subject: { name: string; source: string; code: string; mod: FixtureModule }) => boolean;
  }

  /**
   * The fixture's name appears as a literal in a test file that asserts on it —
   * with THIS table cut out first, so an excuse cannot vouch for itself.
   */
  const namedIn = (file: string) => (subject: { name: string }) => {
    const text = readFileSync(join(import.meta.dir, file), "utf8");
    const needle = JSON.stringify(subject.name);
    const occurrences = text.split(needle).length - 1;
    // COUNTED, not sliced: slicing the table out depends on where the
    // formatter puts a closing brace, so reformatting the file would silently
    // change the answer. When the file being searched is the one holding the
    // table, the fixture's own row is one occurrence and the CLAIM has to be a
    // second.
    return occurrences > (file === import.meta.file ? 1 : 0);
  };

  /** Every frame the fixture drives is recorded in the rendered-DOM golden. */
  const recordedIn = (file: string) => (subject: { name: string }) => {
    const text = readFileSync(join(import.meta.dir, "__snapshots__", file), "utf8");
    return text.includes(`exports[\`rendered DOM golden ${subject.name}: rendered DOM 1\`]`);
  };

  const NO_DECLARATION: Record<string, Excuse> = {
    // Both are behavioural, and the per-fixture rendered-DOM golden records
    // every frame either fixture drives.
    "conditional-children": {
      why: "behavioural: every frame is recorded in the rendered-DOM golden",
      holds: recordedIn("oracle.test.ts.snap"),
    },
    "array-hole": {
      why: "an insert() receiving an Array; behavioural, in the rendered-DOM golden",
      holds: recordedIn("oracle.test.ts.snap"),
    },
    "arrow-body-component": {
      why: "the ArrowBody splice site, pinned by the emitted-code snapshot",
      holds: ({ name }) =>
        readFileSync(
          join(import.meta.dir, "__snapshots__", "roundtrip.test.ts.snap"),
          "utf8",
        ).includes(name),
    },
    "delegated-handler-tuple": {
      why: "asserted by name in the target 7 block",
      holds: namedIn("optimality.test.ts"),
    },
    "hygiene-shifted-uids": {
      why: "asserted by name in the target 9 block",
      holds: namedIn("optimality.test.ts"),
    },
    "unicode-long-template": {
      why: "a sourcemap hazard; the claim is asserted by name in roundtrip.test.ts",
      holds: namedIn("roundtrip.test.ts"),
    },
    "svg-dynamic-class": {
      why: "O5; the claim is asserted by name in the real-browser SVG check",
      holds: namedIn("browser-svg-class-check.ts"),
    },
    "property-attrs": {
      why: "the DOM_PROPS channel, pinned by tables.test.ts against dom.ts",
      holds: ({ code }) =>
        emittedCalls(code, "setDomProp") > 0 && templateHtml(code).join("").includes("<input"),
    },
    "style-object": {
      // The DOM target hands the object to the runtime WHOLE, which is what
      // `tables.test.ts` pins; the px rule only becomes the compiler's decision
      // on the SSR target, where `ssr.test.ts` folds the same object into a
      // `style="…"` chunk and compares the unit against dom.ts's own table. So
      // the excuse names two channels and this predicate holds the DOM half of
      // it: the object reaches the `style` channel unopened, no `px` anywhere.
      why: "the style channel: whole-object on DOM (tables.test.ts), folded with the px rule on SSR (ssr.test.ts)",
      holds: ({ code }) =>
        propCalls(code) > 0 &&
        !stripLiterals(code).includes("px") &&
        templateHtml(code).join("").includes("style=") === false,
    },
    "dangerously-set-inner-html": {
      // `code.includes("dangerouslySetInnerHTML")` alone is satisfied by
      // un-compiled source. What the fixture is about is that the markup was
      // NOT baked into the template and reaches the runtime as a property
      // write, so the element the parser builds is the one the oracle builds.
      why: "raw HTML the compiler must refuse to bake; checked by the parse conformance pass",
      holds: ({ code }) =>
        templateHtml(code).length > 0 &&
        propCalls(code) > 0 &&
        !templateHtml(code).join("").includes("<b>"),
    },
    mathml: {
      why:
        "namespace handling: `<math>` switches the parser into foreign content, so the whole " +
        "subtree bakes into ONE template and the clone carries the MathML namespace with it — " +
        "the parse conformance pass is what reads those bytes back",
      holds: ({ code }) => {
        const html = templateHtml(code).join("");
        return (
          templateHtml(code).length === 1 &&
          html.includes('<math display="block"><mrow>') &&
          !code.includes("createElement")
        );
      },
    },
    svg: {
      why:
        "namespace handling: `setElementAttr` kebab-cases every SVG attribute EXCEPT class and " +
        "viewBox, and the folded bytes are what the parse conformance pass reads back",
      holds: ({ code }) => {
        const html = templateHtml(code).join("");
        return html.includes('viewBox="0 0 24 24"') && html.includes("stroke-width=");
      },
    },
    "pre-whitespace": {
      why: "whitespace preservation; the exact template bytes are asserted in the O9 block",
      holds: namedIn("optimality.test.ts"),
    },
    "text-gt-hole": {
      why: "a parser-divergence hazard; the claim is the escaped byte, and it is in the template",
      holds: ({ code }) => templateHtml(code).join("").includes("&gt;"),
    },
  };

  it("every fixture either declares an optimality or says why it does not", () => {
    const undeclared = declarations.filter(([, d]) => !d).map(([name]) => name);
    expect(
      undeclared.filter((name) => !NO_DECLARATION[name]),
      "undeclared and unexplained",
    ).toEqual([]);
    expect(
      Object.keys(NO_DECLARATION).filter((name) => !undeclared.includes(name)),
      "stale entry: this fixture declares an optimality now, or is gone",
    ).toEqual([]);
  });

  it("every excuse for not declaring one is still TRUE", async () => {
    // Each `NO_DECLARATION` entry is a predicate, and this runs it, so an
    // excuse that stopped being true is a failure rather than an explanation.
    const rotted: string[] = [];
    for (const [name, excuse] of Object.entries(NO_DECLARATION)) {
      const source = fixtureSource(name);
      const mod = await loadModule(compileFixture(name), `excuse-${name}`);
      if (!excuse.holds({ name, source, code: compileFixtureBody(name), mod })) {
        rotted.push(`${name}: ${excuse.why}`);
      }
    }
    expect(rotted, "the channel this fixture's claim was handed to no longer carries it").toEqual(
      [],
    );
  }, 120_000);

  for (const [name, decl] of declarations) {
    if (!decl) continue;
    it(`${name} — target ${decl.target}`, async () => {
      assertDeclared(name, decl, compileFixtureBody(name));
      if (decl.effects === undefined) return;
      const render = await renderViaCompiler(name);
      expect(render.trace.created, `${name} effects`).toBe(decl.effects);
    });
  }
});

describe("target 1 — semantic reactivity (never name regexes)", () => {
  it("static-only: a provably-static tree emits no thunk and no effect", () => {
    const code = compileFixtureBody("static-only");
    // The positive half. Both clauses below are satisfied by JSX that was never
    // compiled at all, so on their own they assert nothing.
    expect(templateHtml(code)[0]).toStartWith('<section class="card"');
    expect(code).toMatch(/return _tmpl\$\d+\(\)/);

    expect(count(code, /=>/)).toBe(0);
    expect(count(code, /renderEffect|bindEffect|_\$effect/)).toBe(0);
  });

  it("control-flow-show-keyed: one body is handed each key's value, not an accessor", () => {
    // A uid shape, so it is asserted here rather than as a needle in the
    // fixture's declaration, where naming `_v$` would shift every emitted uid.
    const code = compileFixtureBody("control-flow-show-keyed");
    expect(code).toMatch(
      /const (_v\$\d*) = value\(\);\s*return \1 \? _\$block\(\(v\) => \{[\s\S]*?\}\)\(\1\)/,
    );
  });

  it("handler-no-closure: a handler closing over nothing is not re-created per instance", () => {
    const code = compileFixtureBody("handler-no-closure");
    // Hoisted to module scope: the arrow appears above the component, not inside
    // it. The needle is the fixture's own handler body, so it matches only what
    // the fixture really contains.
    const handlerAt = code.indexOf('setAttribute("data-clicked"');
    const componentAt = code.indexOf("function HandlerNoClosure");
    expect(handlerAt).toBeGreaterThan(-1);
    expect(handlerAt).toBeLessThan(componentAt);
  });

  it("handler-closure: a handler closing over a signal stays inside the component", () => {
    const code = compileFixtureBody("handler-closure");
    // Positive first: the handler still has to become an expando write, or
    // "it is not hoisted" is satisfied by output that binds nothing at all.
    expect(code).toMatch(/_el\$\d+\.__bq_click = \(\) => setN\(/);
    expect(code, "no module-scope handler constant for a closure").not.toMatch(/^const _h\$/m);

    const handlerAt = code.indexOf("setN(");
    const componentAt = code.indexOf("function HandlerClosure");
    expect(handlerAt).toBeGreaterThan(componentAt);
  });
});

describe("target 2 — fully-static subtree costs one clone and nothing else", () => {
  it("static-only: exactly one template() and zero patch calls", () => {
    const code = compileFixtureBody("static-only");
    expect(emittedCalls(code, "template")).toBe(1);
    // The same union the declared path uses, so the two cannot drift apart.
    // `spread` is not in it: the only helper spelt that way is SSR's
    // `spreadAttrs`, and `_$spread(` needs the paren.
    expect(
      emittedCalls(code, "insert") +
        propCalls(code) +
        emittedCalls(code, "ref") +
        emittedCalls(code, "listen") +
        emittedCalls(code, "bindEvent") +
        emittedCalls(code, "bindValue"),
    ).toBe(0);
  });

  it("static-only: creates zero effects at runtime", async () => {
    const render = await renderViaCompiler("static-only");
    // Zero effects is a property of un-compiled static JSX too, so the count on
    // its own says nothing. What says something is WHICH runtime surface the
    // module touched: one `template` import and no other helper at all means the
    // whole subtree became a clone, and there is nothing left that could create
    // an effect later.
    expect(runtimeImports(render.code ?? "")).toEqual(["template"]);
    expect(render.code).toMatch(/return _tmpl\$\d+\(\)/);
    expect(render.html.length, "and it still rendered something").toBeGreaterThan(0);
    expect(render.trace.created).toBe(0);
  });

  it("dedup-identical-markup: zero patch calls across both components", () => {
    const code = compileFixtureBody("dedup-identical-markup");
    // The two inserts the module does make are the grid placing Left and Right,
    // so each component's own body is measured rather than the module.
    for (const name of ["Left", "Right"]) {
      const start = code.indexOf(`function ${name}()`);
      const body = code.slice(start, code.indexOf("\n}", start));
      expect(body, name).toMatch(/return _tmpl\$\d+\(\);$/);
      expect(emittedCalls(body, "insert") + propCalls(body), name).toBe(0);
    }
  });
});

describe("target 3 — constant folding into the template string", () => {
  it("literal-class-style: a literal class concat is baked into the HTML", () => {
    const code = compileFixtureBody("literal-class-style");
    expect(templateHtml(code).join("\n")).toContain('class="btn btn--primary"');
    expect(code).not.toContain("`${base}");
  });

  it("literal-class-style: a literal ternary class is baked in, no channel write", () => {
    const code = compileFixtureBody("literal-class-style");
    expect(templateHtml(code).join("\n")).toContain('class="on"');
    expect(propCalls(code)).toBe(0);
  });

  it("literal-class-style: a literal style string is baked into the HTML", () => {
    const code = compileFixtureBody("literal-class-style");
    // Inside the TEMPLATE's own bytes. The fixture writes that exact string
    // itself, so a search of the whole module is satisfied by output that was
    // never compiled.
    expect(templateHtml(code).join("\n")).toContain('style="color: red; font-weight: bold"');
    expect(templateHtml(code), "one template, everything folded into it").toHaveLength(1);
  });
});

describe("target 4 — one effect per template, not one per prop", () => {
  it("multi-prop-one-element: three dynamic props share a single effect", async () => {
    // The claim is stated off the module: ONE bindEffect that covers two or
    // more channel writes, and one effect at run time. The
    // module half is the stronger of the two, because the count alone is also
    // what a compiler that dropped two props produces.
    const code = compileFixtureBody("multi-prop-one-element");
    expect(countMerges(code), "one effect covering more than one prop").toBe(1);
    expect(bindEffectBodies(code), "and no second effect beside it").toHaveLength(1);
    const render = await renderViaCompiler("multi-prop-one-element");
    expect(render.trace.created).toBe(1);
  });

  it("class-with-live-siblings: class is a FIELD of the one effect, not an exception to it", async () => {
    // B1/B2. `class` can share the group: the record guards `class` on its own
    // field, and the channel emits only the tokens it applied, so an unrelated
    // prop firing the shared effect does not re-write the attribute and the
    // element really does cost ONE effect.
    const code = compileFixtureBody("class-with-live-siblings");
    expect(bindEffectBodies(code), "one effect for class+title+id").toHaveLength(1);
    expect(code).toContain('_v$.a = _$setClass(_el$1, "class", _v$.a, _p$.a);');
    expect(code, "no name is left for the runtime to classify").not.toContain("_$bindProp(");
    // The wipe, as an ABSENCE: no statement writes the class channel on any
    // other field's account. A differential cannot see this — both paths share
    // `setClass` — so it is asserted against the emitted code directly.
    for (const line of code.split("\n")) {
      if (line.includes('"title"') || line.includes('"id"')) {
        expect(line, "an unrelated prop must not reach the class channel").not.toContain(
          "_$setClass",
        );
      }
    }

    const result = await auditCompiled("class-with-live-siblings");
    expect(result.ok, formatDivergences("class-with-live-siblings", result.divergences)).toBe(true);
    expect(result.render.trace.created, "one fused record for the element").toBe(1);
    expect(countMerges(code), "and it covers class, title and id together").toBe(1);
  });

  it("reactive-attribute: href and class are two fields of one record", async () => {
    const code = compileFixtureBody("reactive-attribute");
    // Both live props on the element are fields of the same compute. `class`
    // threads its APPLIED value through its own slot, so it needs no separate
    // runtime-owned effect.
    expect(code).toContain('if (_v$.a !== _p$.a) _$setAttr(_el$1, "href", _v$.a);');
    expect(code).toContain('_v$.b = _$setClass(_el$1, "class", _v$.b, _p$.b);');
    expect(code).not.toContain("_$bindProp(");
    expect(templateHtml(code), "only the static attribute is baked").toEqual([
      '<a data-static="keep">go</a>',
    ]);
    expect(bindEffectBodies(code)).toHaveLength(1);

    // One effect, not one for `href` and another the runtime opens for `class`.
    expect(countMerges(code), "href and class in one effect").toBe(1);
    const render = await renderViaCompiler("reactive-attribute");
    expect(render.trace.created).toBe(1);
  });

  /**
   * B1/B2's PROOF, and the reason it is here rather than in `oracle.test.ts`:
   * the differential is structurally blind to it. Both paths call the same
   * `setClass`, so when the class channel owned the whole attribute they wiped
   * the ref's token together, agreed perfectly, and the oracle certified the
   * bug. Nothing but an absolute assertion can see this.
   */
  it("class-owns-only-its-tokens: nothing another channel wrote is ever wiped", async () => {
    const run = await renderViaCompiler("class-owns-only-its-tokens");
    const classes = (html: string): string[] =>
      (html.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean).sort();

    const frames = [run.html, ...run.frames];
    expect(frames, "the mount plus one frame per step").toHaveLength(3);

    // The precondition: both channels really did write. Without it a fixture
    // whose ref stopped adding its token at all would pass every claim below by
    // producing an absence.
    expect(classes(run.html).sort(), "mount: every channel's tokens are present").toEqual([
      "pinned",
      "red",
      "ref-added",
    ]);

    // Frame 0 changes `title` only. `class` shares the effect with it AND
    // leaves the attribute alone.
    expect(classes(frames[1]!), "an unrelated prop change must not touch class").toEqual([
      "pinned",
      "red",
      "ref-added",
    ]);

    // Frame 1 changes `class` itself. The old channel assigned the whole
    // attribute, so this erased `ref-added` even with the exclusion in place.
    // The channel now emits only the tokens it applied.
    expect(classes(frames[2]!), "a real class change must remove only its own token").toEqual([
      "blue",
      "pinned",
      "ref-added",
    ]);
  }, 30_000);

  it("equal-liveness: B1 — three names written the same way move together", async () => {
    const code = compileFixtureBody("equal-liveness");
    // Emitted-code half: one record, three fields, `class` among them.
    expect(bindEffectBodies(code), "one effect for the element").toHaveLength(1);
    expect(code).toContain('_v$.a = _$setClass(_el$1, "class", _v$.a, _p$.a);');
    expect(code).toContain('if (_v$.b !== _p$.b) _$setAttr(_el$1, "id", _v$.b);');
    expect(code).toContain('if (_v$.c !== _p$.c) _$setAttr(_el$1, "title", _v$.c);');

    // Behavioural half: the rule's own falsification procedure.
    const run = await renderViaCompiler("equal-liveness");
    const attrs = (html: string): string[] =>
      [...html.matchAll(/(class|id|title)="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`).sort();
    expect(attrs(run.html)).toEqual(["class=red", "id=red", "title=red"]);
    for (const [at, want] of [
      [0, "blue"],
      [1, "green"],
    ] as const) {
      expect(attrs(run.frames[at]!), `step ${at}: all three or none`).toEqual([
        `class=${want}`,
        `id=${want}`,
        `title=${want}`,
      ]);
    }
  }, 30_000);

  it("no template opens two effects and no effect spans two templates, across the corpus", () => {
    // P5 fuses every live binding of ONE template into one record. Splitting it
    // again, or merging two templates' bindings, still produces identical DOM,
    // so a rendered comparison cannot see either. `effect-counts.test.ts` makes the
    // count an equality and would move, but the number alone does not say WHICH
    // clone a group serves. `passes::group::tests` pins the pass itself; this
    // pins what codegen actually emitted.
    let groups = 0;
    let across = 0;
    for (const name of listFixtures()) {
      const code = compileFixtureBody(name);
      const bodies = bindEffectBodies(code);
      // A scan anchored on indentation would report ZERO groups on a nested
      // emit, indistinguishable from a module that has none. Balanced parens
      // cannot miss one, and this says so.
      expect(bodies, `${name}: every bindEffect must be scanned`).toHaveLength(
        emittedCalls(code, "bindEffect"),
      );
      const seen = new Set<string>();
      for (const clones of groupClones(code)) {
        expect(clones, `${name}: one effect must serve one template`).toHaveLength(1);
        expect(seen.has(clones[0]), `${name}: ${clones[0]} opens two effects`).toBe(false);
        seen.add(clones[0]);
        groups++;
      }
      across += groupTargets(code).filter((targets) => targets.length > 1).length;
    }
    expect(groups, "the scan has to be finding real groups").toBeGreaterThan(0);
    expect(across, "and some of them have to span elements").toBeGreaterThan(0);
  });

  it("the one-template rule goes red on a deliberate split", () => {
    // The proof that the assertion above is a detector and not a description.
    // Moving one element's write into an effect of its own is exactly what a
    // P5 that stopped at the element would emit: identical DOM, one more
    // effect, and nothing else in the suite can see it.
    const code = compileFixtureBody("sibling-live-props");
    expect(groupClones(code)).toEqual([["_el$1"]]);
    expect(groupTargets(code)[0]).toHaveLength(2);

    const split = code.replace(
      "  _$bindEffect(",
      '  _$bindEffect(() => 0, (_v$) => { _$setAttr(_el$3, "lang", _v$); });\n  _$bindEffect(',
    );
    expect(split, "the mutation is stale").not.toBe(code);
    expect(groupClones(split)).toEqual([["_el$1"], ["_el$1"]]);
  });
});

describe("target 5 — walk elision", () => {
  /**
   * A hop count is not evidence: a module that addresses nothing has zero hops
   * and satisfies every upper bound in sight. So each of these names the ROUTE
   * the compiler took and checks it is the cheapest one available for that
   * shape, with the hole still patched at the end of it.
   */
  function walks(code: string): Array<{ name: string; from: string; route: string }> {
    return [...code.matchAll(/const (_el\$+\d+) = (_el\$+\d+)((?:\.\w+)+);/g)].map((m) => ({
      name: m[1],
      from: m[2],
      route: m[3],
    }));
  }

  /** The named walks, with a missing one reported as such rather than as `undefined`. */
  function names(...walks: Array<{ name: string } | undefined>): string[] {
    return walks.map((walk, index) => {
      if (!walk) throw new Error(`walk ${index} was not emitted at all`);
      return walk.name;
    });
  }

  function holes(code: string): string[] {
    return [...code.matchAll(/_\$+insert\(\s*(_el\$+\d+)/g)].map((m) => m[1]);
  }

  it("deep-walk: five nested single-child divs cost exactly five hops and nothing else", () => {
    const code = compileFixtureBody("deep-walk");
    // The span sits five levels down a chain of single-child divs, so five
    // `firstChild` hops IS the cheapest route and `lastChild` buys nothing.
    // What target #5 is worth here is everything that is NOT spent: no hop to
    // the <p> that follows, and no sixth hop to an anchor, because target #9
    // removed the anchor.
    expect(emittedCalls(code, "insert"), "the hole is still patched").toBe(1);
    expect(count(code, /\.firstChild/)).toBe(5);
    expect(count(code, /\.nextSibling|\.lastChild|\.previousSibling/)).toBe(0);
    expect(templateAnchors(code)).toBe(0);
    expect(holes(code), "and the insert lands on the span, not on the root").toEqual(["_el$6"]);
  });

  it("walk-from-the-back: the last two cells are reached from the end, not the front", () => {
    const code = compileFixtureBody("walk-from-the-back");
    // Seven children, holes in the last two. Forward costs 6 + 5 hops; from the
    // back it is 1 + 2, and the second is reached from the first.
    expect(emittedCalls(code, "insert"), "both holes are still patched").toBe(2);
    const [last, penultimate] = [
      walks(code).find((w) => w.route === ".lastChild"),
      walks(code).find((w) => w.route === ".previousSibling"),
    ];
    expect(last?.from, "one hop from the root").toBeDefined();
    expect(penultimate?.from, "and one more from there").toBe(last?.name);
    expect(count(code, /\.nextSibling|\.firstChild/), "nothing walks forward").toBe(0);
    expect(new Set(holes(code))).toEqual(new Set(names(last, penultimate)));
  });

  it("sibling-walk: the second hole walks from the first, not from the root", () => {
    const code = compileFixtureBody("sibling-walk");
    // Five children, holes at index 2 and 4. Forward from the root costs
    // 2 + 4 hops; from the back it is 1 + 2, chained.
    const named = walks(code);
    const patched = holes(code);
    expect(patched, "both holes are still patched").toHaveLength(2);

    const fromRoot = named.find((w) => w.route === ".lastChild");
    const chained = named.find((w) => w.route === ".previousSibling.previousSibling");
    expect(fromRoot, "the far hole is one hop from the end").toBeDefined();
    expect(chained?.from, "and the near one walks from it").toBe(fromRoot?.name);
    expect(new Set(patched)).toEqual(new Set(names(fromRoot, chained)));
    expect(count(code, /\.nextSibling|\.firstChild/), "nothing walks forward").toBe(0);
  });
});

describe("target 6 — template dedup by content hash", () => {
  it("dedup-identical-markup: two identical subtrees yield one template()", () => {
    const code = compileFixtureBody("dedup-identical-markup");
    // <div class="grid"> plus one shared <div class="cell"> template.
    expect(emittedCalls(code, "template")).toBe(2);
    expect(new Set(templateHtml(code)).size, "and no two of them are the same bytes").toBe(2);
  });
});

describe("target 7 — delegated events as expando writes", () => {
  it("delegated-event: onClick emits a __bq_click assignment, never addEventListener", () => {
    const code = compileFixtureBody("delegated-event");
    expect(code).toMatch(/__bq_click\s*=/);
    expect(code).not.toContain("addEventListener");
  });

  it("non-delegated-event: onMouseEnter/onFocus are bound directly, never as an expando", () => {
    const code = compileFixtureBody("non-delegated-event");
    // A root's listener for a non-bubbling type can never fire from a
    // descendant, so the expando would be silently dead. The positive clauses
    // are what make this more than "the compiler emitted nothing".
    // B4: the listener is registered THROUGH the scope, so it dies with the
    // position. `addEventListener` with no cleanup is what leaked.
    expect(code).toMatch(/_\$listen\(_el\$\d+, "mouseenter"/);
    expect(code).toMatch(/_\$listen\(_el\$\d+, "focus"/);
    expect(code, "never a bare addEventListener").not.toContain("addEventListener");
    expect(code, "no module-wide registration for a type that does not bubble").not.toContain(
      "delegateEvents",
    );

    expect(code).not.toMatch(/__bq_mouseenter/);
    expect(code).not.toMatch(/__bq_focus\b/);
  });

  it("handler-by-reference: a handler bound to a name is an expando write at either scope", () => {
    // The commonest shape in real code: `const h = () => …; <button
    // onClick={h}/>` must get the expando, not fall all the way back to
    // setProp.
    const code = compileFixtureBody("handler-by-reference");
    expect(code).toMatch(/_el\$\d+\.__bq_click = bump/);
    expect(code).toMatch(/_el\$\d+\.__bq_click = reset/);
    expect(code, "no runtime isEventHandlerValue check for either").not.toContain('"onClick"');

    // The module-scope one stays at module scope and the component-scope one
    // stays inside the component — the compiler moves neither.
    expect(code.indexOf("const bump =")).toBeLessThan(code.indexOf("function HandlerByReference"));
    expect(code.indexOf("const reset =")).toBeGreaterThan(
      code.indexOf("function HandlerByReference"),
    );
  });

  it("delegated-handler-tuple: the [handler, data] form is one expando write, not a closure per row", () => {
    // This claim had an EXCUSE saying it was "asserted by name in the target 7
    // block" and no such assertion existed — `namedIn` sliced the registry out
    // by a formatting-dependent offset, so the row found its own key and passed.
    // The assertion the excuse always described:
    const code = compileFixtureBody("delegated-handler-tuple");
    // The tuple itself is the expando value. One shared `pick`, and no arrow
    // allocated per row to close over the label — which is the whole point of
    // the `[handler, data]` form.
    expect(code).toMatch(/_el\$\d+\.__bq_click = \[pick, "a"\]/);
    expect(code).toMatch(/_el\$\d+\.__bq_click = \[pick, "b"\]/);
    expect(code, "no per-row closure").not.toMatch(/__bq_click = \(\) =>/);
    expect(code, "never a bare addEventListener").not.toContain("addEventListener");
    // One registration for the module, not one per row.
    expect(count(code, /delegateEvents\(/)).toBe(1);
  });

  it("delegated-event: the delegated set is registered exactly once per module", () => {
    const code = compileFixtureBody("delegated-event");
    expect(count(code, /delegateEvents\(/)).toBe(1);
  });

  it("delegated-two-types: the scope expando is written once per ELEMENT, not once per type", () => {
    const code = compileFixtureBody("delegated-two-types");
    // Two delegated types on one element. The `__bqs` write is idempotent, so a
    // duplicate is invisible at runtime and only this counts it.
    expect(count(code, /__bq_click\s*=/), "the click expando").toBe(1);
    expect(count(code, /__bq_input\s*=/), "the input expando").toBe(1);
    expect(count(code, /__bqs\s*=/), "one scope expando for the element").toBe(1);
  });

  it("every element in the corpus writes its scope expando at most once", () => {
    // The claim as a property of the whole corpus rather than of one fixture:
    // for every emitted element, the number of `__bqs` writes is 1 when it
    // carries a delegated handler and 0 when it does not.
    const offenders: string[] = [];
    let elementsSeen = 0;
    let multiType = 0;
    for (const name of listFixtures()) {
      const code = stripComments(compileFixtureBody(name));
      const writes = new Map<string, string[]>();
      for (const match of code.matchAll(/(_el\$\d+)\.__bq(s|_[A-Za-z]+)\s*=/g)) {
        const list = writes.get(match[1]!) ?? [];
        list.push(match[2]!);
        writes.set(match[1]!, list);
      }
      for (const [element, types] of writes) {
        const scopes = types.filter((type) => type === "s").length;
        const delegated = types.length - scopes;
        elementsSeen++;
        if (delegated > 1) multiType++;
        if (scopes !== (delegated > 0 ? 1 : 0)) {
          offenders.push(
            `${name}: ${element} has ${delegated} delegated type(s) and ${scopes} __bqs write(s)`,
          );
        }
      }
    }
    // An empty offender list is only evidence if the scanner had subjects, and
    // the shape this pins — two types on one element — has to be one of them.
    expect(elementsSeen, "the expando scanner found no delegated element at all").toBeGreaterThan(
      0,
    );
    expect(multiType, "no fixture carries two delegated types on one element").toBeGreaterThan(0);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

/**
 * The flow pass's lowering, stated once for the whole corpus. A construct the flow
 * pass understands CEASES TO EXIST as a component: no props object, no adapter
 * frame, and `(parent, anchor)` taken from the template walk instead of
 * re-derived. The list below is therefore not a tolerance — it is the complete
 * set of REFUSALS, and each one has a reason in `passes/flow.rs`.
 */
describe("the flow constructs lower onto the four primitives", () => {
  const LOWERED = [
    "Show",
    "Switch",
    "Match",
    "For",
    "Repeat",
    "Loading",
    "Suspense",
    "Errored",
    "ErrorBoundary",
    "Portal",
    // `Await` is two boundaries, `Reveal` a `reveal` call: a provide scope with
    // no component around it.
    "Await",
    "Reveal",
  ];

  it("no construct the pass understands survives as a call", () => {
    const survivors: string[] = [];
    for (const name of listFixtures()) {
      const code = stripLiterals(compileFixtureBody(name));
      for (const construct of LOWERED) {
        // A CALL, never a declaration: a fixture's default export is named
        // after its file and can end in one of these words.
        if (new RegExp(`(?<![\\w$])${construct}\\(_s\\$`).test(code)) {
          survivors.push(`${name}: ${construct}`);
        }
      }
    }
    // `control-flow-for-keyed-spread` lowers even though a spread is a runtime
    // source list (C9): `keyed` is a runtime argument `each` dispatches on, and
    // the row Block's parameter list does not change with it. The other three
    // constructs a spread reaches (`Show`, `Match`, `Switch`) refuse, each for a
    // reason stated in `passes::flow::admits_spread`, and none of them is in
    // `LOWERED` with a spread fixture behind it.
    expect(survivors).toEqual([]);
  });

  it("Await and Reveal lower onto a boundary and a reveal call", () => {
    // `Dynamic` is no construct: Solid 2.0 replaced it with the `dynamic`
    // factory, which BARQ025 names.
    //
    //  - `Await`'s three states are what READING a resource does — throw
    //    `NotReady`, throw the error, return the value — so it is a loading
    //    boundary around an error boundary.
    //  - `Reveal` is a provide scope rather than a range, and is lowered to the
    //    CALL that says so, not onto `branch`, which would put a context
    //    binding where a conditional belongs.
    const bodies = listFixtures().map((name) => [name, compileFixtureBody(name)] as const);
    for (const [name, code] of bodies) {
      for (const construct of ["Await", "Reveal"]) {
        expect(
          new RegExp(`(?<![\\w$])${construct}\\(_s\\$`).test(stripLiterals(code)),
          `${name}: ${construct} still reaches its adapter`,
        ).toBe(false);
      }
    }
    // And the primitives they reach instead really are emitted.
    const all = bodies.map(([, code]) => code).join("\n");
    for (const primitive of ["_$reveal(", "_$boundary("]) {
      expect(all, `${primitive} is emitted by no fixture`).toContain(primitive);
    }
  });

  /**
   * WHAT MAKES A DECLARATION EVIDENCE FOR A LOWERED CONSTRUCT, machine-checked.
   *
   * The file header states the criterion — take a "compiler" that returns its
   * input unchanged and ask whether the assertion survives — and for lowering there
   * is a sharper reference available than the identity transform, because the
   * project already builds one: `-O0`, which shares the front end, the IR, the
   * ABI and the ownership model, and differs from `-Ox` here in exactly one
   * decision. A construct compiled at `-O0` reaches its adapter with a props
   * object and an `insert`; at `-Ox` it IS a primitive call taking the pair the
   * walk computed.
   *
   * So a fixture whose construct lowers has to say BOTH halves, and each half
   * is checked against the build that would falsify it:
   *
   *  - at least one `emits` needle that `-O0` does not satisfy. Without this a
   *    declaration can be green on a build where nothing was lowered at all.
   *  - at least one `absent` needle that `-O0` DOES emit. This is the half that
   *    is easy to fake and worthless when faked: an `absent` needle naming a
   *    call shape no build emits asserts the absence of something that could
   *    not have been present. Requiring the needle to be a fact about `-O0`
   *    makes "the adapter frame it replaced" a difference between two programs
   *    instead of a sentence.
   *
   * A fixture whose construct does not lower emits the same code at both
   * levels, so it has no difference to name and is skipped.
   */
  it("every lowered region names its primitive and the frame it replaced", () => {
    const PRIMITIVES = ["branch", "each", "boundary", "portal"];
    const silent: string[] = [];
    let lowered = 0;

    for (const [name, decl] of declarations) {
      const optimised = stripComments(compileFixtureBody(name));
      const reference = stripComments(compileFixtureBody(name, { optimize: 0 }));
      const blanked = stripLiterals(optimised);
      const referenceBlanked = stripLiterals(reference);
      const lowers = PRIMITIVES.some(
        (primitive) =>
          blanked.includes(`_$${primitive}(`) && !referenceBlanked.includes(`_$${primitive}(`),
      );
      if (!lowers) continue;
      lowered++;

      if (!decl) {
        silent.push(`${name}: lowers a construct and declares no optimality at all`);
        continue;
      }
      const distinguishing = (decl.emits ?? []).filter((n) => occurrences(reference, n) === 0);
      const replaced = (decl.absent ?? []).filter((n) => occurrences(reference, n) > 0);
      if (distinguishing.length === 0) {
        silent.push(`${name}: every emits needle is satisfied by the -O0 build too`);
      }
      if (replaced.length === 0) {
        silent.push(`${name}: no absent needle names anything -O0 actually emits`);
      }
    }

    expect(silent).toEqual([]);
    // The gate is only worth what its population is: a run where the flow pass
    // lowered nothing would satisfy every clause above by having nothing to
    // check, which is the same fail-open shape the differential's third
    // detection value exists to prevent.
    expect(lowered, "no fixture in the corpus lowers a construct at all").toBeGreaterThan(24);
  }, 180_000);
});

describe("target 8 — thunk elision for static control-flow bodies", () => {
  it("control-flow-show-eager-static-body: the body is one clone, handed straight in", async () => {
    // No props object and no variadic call: the flow pass lowers the construct
    // onto `branch`, and the body is a subtree that produced no patch.
    const code = compileFixtureBody("control-flow-show-eager-static-body");
    // `branch` receives the `(parent, anchor)` pair the walk computed — here
    // `(null, null)`, because the construct IS the component's whole body.
    expect(code).toMatch(/[\w$]*branch\(null, null, /);
    // O2/O2.1 SUPERSEDE target #8's eager arm, and this is where that is said.
    // A child may not be an ARGUMENT, because an argument is evaluated at the
    // call site — before the receiving scope exists — so "the clone itself,
    // handed straight in" is unrepresentable. What survives of
    // the elision is the IIFE and the element binding, both still absent.
    expect(code).toMatch(/[\w$]*block\(\(\)\s*=>\s*_tmpl\$\d+\(\)\)/);
    // …and the flag the compiler PROVED about it: nothing in the body registers
    // anything disposable, so `NO_SCOPE` is shipped and the activation
    // allocates no `Scope`.
    // A non-keyed `Show`, the default, ends in the two-row body
    // TABLE rather than in the keyed shape's single Block, so the flag sits
    // after a `]` instead of a `})`.
    expect(code, "the proven flags integer").toMatch(/\], 2\)/);
    expect(code, "and nothing to bind it to").not.toMatch(/const _el\$/);
    // `setProp` is split into named channels, so a `setProp` needle cannot
    // match; `propCalls` scans the channels that exist.
    expect(emittedCalls(code, "insert") + propCalls(code)).toBe(0);

    // The observable consequence of the change, measured rather than asserted:
    // with the Block, each toggle REBUILDS the body, where an eager argument
    // would hand the same node back every time.
    const rendered = await renderViaCompiler("control-flow-show-eager-static-body");
    const identities = rendered.channels.map((frame) => frame.identity.join(","));
    expect(new Set(identities).size, "the toggle rebuilt the body").toBeGreaterThan(1);
  });

  it("control-flow-show-static-body: an AUTHOR-written thunk survives, however static the body", async () => {
    // The boundary, and it is behavioural, not cosmetic. Unwrapping the arrow
    // builds the subtree at call time even when the branch is never taken, and
    // reuses one node across every re-mount where the oracle calls the arrow
    // again. `node-identity` in normalize.ts is the only channel that sees the
    // second half — html, markers, attributes and anchors are all identical.
    const code = compileFixtureBody("control-flow-show-static-body");
    expect(code).toMatch(/[\w$]*branch\(null, null, /);
    // C6: the child is a Block, so the arrow declares the scope it runs under.
    expect(code).toMatch(/[\w$]*block\(\(\)\s*=>\s*_tmpl\$\d+\(\)\)/);
    // The key is the author's own `when` read, emitted as plain JavaScript
    // (K5). Non-keyed is the default, so what it carries is the
    // TRUTHINESS — one index for every falsy value, which is what keeps a
    // fallback in place across `0`, `""` and `null`, and what lets the content
    // survive a change from one truthy value to another.
    expect(code).toMatch(/\(\) => on\(\) \? 1 : 0/);

    const result = await auditCompiled("control-flow-show-static-body");
    expect(result.ok, formatDivergences("control-flow-show-static-body", result.divergences)).toBe(
      true,
    );
    // The fixture toggles off and back on, and C6 says a branch that comes back
    // is REBUILT: the Block runs again under a fresh scope, so the second
    // `.panel` is a different node.
    const identities = result.render.channels.map((frame) => frame.identity.join(","));
    expect(new Set(identities).size, "the toggle rebuilt the body").toBeGreaterThan(1);
  });

  it("control-flow-for-static-body: a ROW body keeps its thunk however static it is", () => {
    // The boundary, and the one that has to hold: `For` calls `children(item,
    // index)` per row, so handing it a node is a TypeError — and where it is not,
    // a single node shared by every row would collapse the list to one element.
    // Elision is a fact about the component's children contract, never about the
    // body alone.
    const code = compileFixtureBody("control-flow-for-static-body");
    expect(code).toMatch(/[\w$]*each\(_el\$1, null, rows, null, /);
    expect(code).toMatch(/[\w$]*block\(\(\)\s*=>\s*_tmpl\$\d+\(\)\)/);
  });

  it("control-flow-show: a body with a hole in it also keeps its thunk", async () => {
    // control-flow-nested is a Show whose body builds a <ul> and patches a For
    // into it. That body is not static, so the arrow stays and the DOM is only
    // built when `when` is first true.
    const code = compileFixtureBody("control-flow-nested");
    expect(code).toMatch(/[\w$]*block\(\(\)\s*=>\s*\{/);
    // …and no flag: the body builds a list, so it registers something
    // disposable and the activation still gets a `Scope`.
    expect(code, "an unprovable body ships no flag").not.toMatch(/\}\), \d\)/);

    // What is asserted here is the half this test is about — the body really is
    // built, and only when `when` is first true. The rendered DOM is held to
    // the fixture's rendered-DOM golden like every other.
    const rendered = await renderViaCompiler("control-flow-nested");
    expect(rendered.html, "the body was built").toContain("<li>");
  });
});

describe("target 9 — marker elision", () => {
  it("text-hole-trailing: a hole with nothing after it emits an anchorless insert", () => {
    const code = compileFixtureBody("text-hole-trailing");
    expect(templateAnchors(code)).toBe(0);
    expect(emittedCalls(code, "insert"), "the hole is still patched").toBe(1);
    expect(code).toMatch(/_\$insert\([^,]+,[^,]+,[^,)]+\)/);
  });

  it("text-hole-followed: a following ELEMENT is the anchor, so no comment is baked", () => {
    // The stronger form of elision, and the one a hole-counting bound cannot
    // state: something does follow the hole, and it still costs no marker,
    // because the <span> that follows is itself a stable node to insert before.
    const code = compileFixtureBody("text-hole-followed");
    expect(templateAnchors(code)).toBe(0);
    expect(templateHtml(code)).toEqual(['<div><span class="suffix">items</span></div>']);
    expect(code).toMatch(/_\$insert\(_el\$1, \(\) => count\(\), _el\$2\)/);
    expect(code, "and the anchor it uses is the span itself").toMatch(
      /const _el\$2 = _el\$1\.firstChild;/,
    );
  });

  it("text-hole-fused: adjacent literal text runs fuse, so the hole still needs a marker", () => {
    // The case elision cannot remove. The text either side would parse into ONE
    // node, so there is no existing node to insert before and a comment is the
    // only stable position — which is why the anchor count is not simply zero.
    const code = compileFixtureBody("text-hole-fused");
    expect(templateHtml(code)).toEqual(["<p>Total: <!----> clicks</p>"]);
    expect(templateAnchors(code)).toBe(1);
    expect(code).toMatch(/_\$insert\([^,]+,[^,]+,[^,]+,[^,)]+\)/);
  });

  it("the anchor bound counts nodes, not the characters that spell one", async () => {
    // marker-literal-text writes `<!---->` into a static attribute value, into
    // the text a hole renders, and writes `_$insert(` into a string. All three
    // reach the emitted module verbatim, and all three move a substring count.
    //
    // This is the shape that matters most now that elision has landed: the
    // module bakes NO anchor, so the harness's "templates carry none, so the
    // DOM must carry none" branch has to run. A substring count says there IS
    // one, skips that branch, and the check silently stops existing.
    const code = compileFixtureBody("marker-literal-text");
    const html = templateHtml(code).join("");

    expect(html).toContain('data-note="<!---->"');
    expect(countRaw(html, /<!---->/), "the substring count this replaced").toBe(1);
    expect(templateAnchors(code), "and the exact one: no anchor at all").toBe(0);

    expect(code).toContain("_$insert( is not a call site here");
    expect(countRaw(code, /_\$+insert\(/), "the substring count this replaced").toBeGreaterThan(1);
    expect(emittedCalls(code, "insert"), "one call site").toBe(1);

    const result = await auditCompiled("marker-literal-text");
    expect(result.ok, formatDivergences("marker-literal-text", result.divergences)).toBe(true);
    expect(result.render.channels[0].anchors, "no anchor reached the DOM").toBe(0);
    expect(
      countAnchors(result.render.channels[0].markers),
      "and the marker channel agrees, because it escapes the text a hole renders",
    ).toBe(0);
  });

  it("the exact bound still catches a spurious anchor on that same fixture", async () => {
    const result = await auditCompiled("marker-literal-text", {
      emitted: (code) => code.replace("<span>end</span>", "<span>end</span><!---->"),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toEqual(["marker-count"]);
  });

  it("no fixture in the corpus bakes an anchor that nothing inserts before", () => {
    // The invariant target #9 actually states, corpus-wide. `auditAnchors`
    // resolves each emitted walk against the parsed template, so an anchor is
    // "used" only when an `_$insert` really names the node it resolves to.
    let baked = 0;
    for (const name of listFixtures()) {
      const audit = auditAnchors(compileFixtureBody(name));
      expect(audit.unused, `${name} bakes an anchor nothing uses`).toBe(0);
      expect(audit.unresolved, `${name}: the walk resolver has gone blind`).toBe(0);
      baked += audit.baked;
    }
    expect(baked, "some fixture still needs an anchor, or this proves nothing").toBeGreaterThan(0);
  });

  it("the audit still resolves a module whose uids were hygiene-shifted", () => {
    // The failure this pins is silent by construction: a scanner matching
    // single-`$` names finds no root, no walk and no insert on a module like
    // this, so every field comes back zero and `unused === 0` above passes over
    // a module nobody read. The audit now refuses to answer instead.
    const code = compileFixtureBody("hygiene-shifted-uids");
    expect(code, "the fixture has to actually shift the uids").toContain("_tmpl$$");
    expect(code).toContain("_el$$");

    const audit = auditAnchors(code);
    expect(audit.baked, "the hole sits between two text runs, so it costs one").toBe(1);
    expect(audit.used, "and the audit resolved the walk that names it").toBe(1);
    expect(audit.unused).toBe(0);
    expect(audit.unresolved).toBe(0);
  });

  it("a module the audit cannot read is a failure, not a clean bill", () => {
    const code = compileFixtureBody("text-hole-fused");
    expect(templateHtml(code).length, "the module has templates to read").toBeGreaterThan(0);
    // Rename every root binding out from under the scanner: the templates are
    // still there, so silence would be a lie.
    expect(() => auditAnchors(code.replace(/_tmpl\$+\d+/g, "_renamed"))).toThrow(/gone blind/);
  });
});

/**
 * Target 10 is asserted in `ssr.test.ts` (`SSR emit shape`), not here: a
 * second copy of a claim is worse than none.
 */

describe("target 11 — compile throughput", () => {
  // Time is the target, and a clock is the one thing this suite does not read:
  // `test/throughput.bench.ts` holds the 1ms budget, and `tests/compile_work.rs`
  // counts the allocations behind it, which no machine can move. What is left
  // here is the claim both of them stand on, that what they measure is a real
  // compile, and the one cost the emitted module itself shows.
  it("the corpus is really compiled, and the module grows only with the input", () => {
    const names = listFixtures();
    // A compiler that emits its input back is instantaneous, so the budget on
    // its own measures nothing. What is being timed has to be a real compile —
    // this was one of the six.
    const emitted = names.map((name) => compileFixture(name));
    expect(
      emitted.filter((code, i) => code === fixtureSource(names[i])),
      "a fixture that came back unchanged was not compiled",
    ).toEqual([]);
    expect(
      emitted.filter((code) => emittedCalls(code, "template") > 0).length,
      "and most of the corpus reached a template",
    ).toBeGreaterThanOrEqual(40);

    // Eight copies of a typical file emit at most eight times one copy, and
    // the same template table: an emitter whose output grows faster than the
    // source is a codegen cost every compile pays.
    const once = compileSource(typicalComponentFile(fixtureSource), "typical.tsx");
    const eight = compileSource(
      concatFixtures(Array.from({ length: 8 }, () => TYPICAL_COMPONENT_FILE).flat(), fixtureSource),
      "typical-x8.tsx",
    );
    expect(emittedCalls(once, "template"), "one copy reached a template").toBeGreaterThan(0);
    expect(emittedCalls(eight, "template")).toBe(emittedCalls(once, "template"));
    expect(eight.length).toBeLessThanOrEqual(8 * once.length);
  });
});

describe("open questions the harness must be able to state", () => {
  // Not targets: decisions that change what "correct" means. Written down here
  // so they are visible in the suite instead of living only in a design doc.

  it("O4: a bare tracked read is auto-thunked, and the corpus reaches that path", async () => {
    // `<div>{count()}</div>` is a dead read under an un-compiled runtime and a
    // live binding once auto-thunking is on. Without a fixture holding the
    // shape, the arrow-construction path in `codegen::dom::thunk` has no
    // coverage. `effect-counts.test.ts` makes the count absolute: the number
    // for a fixture holding a bare read simply IS one higher, and a hole that
    // stopped going live moves that number and fails there.
    //
    // What remains here is the half a count cannot state — that the shape is
    // REACHED and that it really is bound rather than read once.
    // `(?<!$)` because `${a()}` inside a template literal is an interpolation,
    // not a JSX hole; `[=>]{` because the attribute form has to start at an
    // attribute (`x={`) or at a hole (`>{`), not mid-expression.
    const bare = listFixtures().filter((name) =>
      /(?<!\$)\{\s*[A-Za-z_$][\w.$]*\(\)\s*\}|[=>]\{`[^`]*\$\{[^}]*\(\)[^}]*\}/.test(
        fixtureSource(name),
      ),
    );
    expect(bare, "the fixture that reaches the compiler-built thunk").toContain(
      "auto-thunked-read",
    );
    expect(bare.length, "the shape is reached by more than one fixture").toBeGreaterThanOrEqual(2);

    // Every one of them binds: a bare read reaches the runtime as an accessor or
    // inside a thunk, never as an already-evaluated value. A compiler that
    // stopped auto-thunking emits the read at the call site and this goes red.
    for (const name of bare) {
      const audit = await auditCompiled(name);
      expect(audit.ok, formatDivergences(name, audit.divergences)).toBe(true);
      expect(
        audit.render.trace.created,
        `${name} holds a bare tracked read and must bind it`,
      ).toBeGreaterThan(0);
    }
  });

  it("O4: the compiler-built thunk is a plain arrow, and it is actually reached", async () => {
    // The exact bug this pins: oxc's `new_arrow_function_expression` takes
    // `r#async` as its second argument, so passing `true` there emits
    // `async () => …` and every one of these holes becomes a Promise. No
    // explicit-thunk fixture can catch it, because their arrows come from the
    // author's own source.
    // The ref NUMBERS are P6's to choose — it renumbers whenever a cheaper
    // route is found — so the shapes are pinned and the numbering is not.
    const code = compileFixtureBody("auto-thunked-read");
    // The attribute hole is a fused effect of ONE, so the compiler-built thunk
    // is the compute itself rather than a `const` inside a block body.
    expect(code).toMatch(/_\$bindEffect\(\(\) => `count: \$\{count\(\)\}`, /);
    expect(code).toMatch(/_\$insert\(_el\$\d+, \(\) => `n=\$\{count\(\)\}`\)/);
    expect(code, "a bare read still η-reduces to the accessor itself").toMatch(
      /_\$insert\(_el\$\d+, count\)/,
    );
    expect(code, "an async arrow would make every hole a Promise").not.toMatch(
      /async\s*\(\s*\)\s*=>/,
    );

    const result = await auditCompiled("auto-thunked-read");
    expect(result.ok, formatDivergences("auto-thunked-read", result.divergences)).toBe(true);
    expect(result.render.trace.created, "three live holes, three effects").toBe(3);
    // And they are LIVE, which is the whole claim: the fixture's steps write
    // the signal and every frame moves. Under an un-compiled runtime each hole
    // is read once at construction and the frames are identical.
    expect(result.render.frames.length, "the fixture drives a step").toBeGreaterThan(0);
    for (const frame of result.render.frames) {
      expect(frame, "a live hole updates").not.toBe(result.render.html);
    }
  });

  it("spread: the element keeps its template and the attribute list is applied in source order", () => {
    // A spread does not take the element off the template path: it takes its
    // ATTRIBUTES off it, because the parser applies baked bytes before any
    // patch runs and duplicate attributes in markup collapse the opposite way
    // from a props object. What is left is one clone and the list in the order
    // the author wrote it: a name before the spread is a key of the object the
    // spread reads, ahead of what is spread into it, and a name after it is a
    // call of its own.
    const code = compileFixtureBody("spread-static-mix");
    expect(templateHtml(code)).toEqual(["<div>spread</div>"]);
    const order = ["_$spread(_el$1,", '"id": "fixed"', "...extra()", '_$setClass(_el$1, "class"'];
    let cursor = -1;
    for (const needle of order) {
      const at = code.indexOf(needle);
      expect(at, `${needle} is emitted`).toBeGreaterThan(-1);
      expect(at, `${needle} is in source order`).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(code, "the un-compiled builder is gone").not.toContain("createElement");
  });

  it("pre/textarea: the oracle applies ordinary JSX text cleaning, with no whitespace exemption", async () => {
    // The dead Babel plugin preserved raw text inside <pre>/<textarea>. The
    // JSX runtime does not — the transpiler cleans it like any other JSX text.
    // Matching the oracle means NOT special-casing those tags.
    //
    // Agreeing with the oracle is what an un-compiled module does by
    // definition — this was one of the six. The positive half names the exact
    // bytes the template has to bake, which is where a whitespace exemption
    // would show up.
    const code = compileFixtureBody("pre-whitespace");
    expect(templateHtml(code)).toEqual([
      "<div><pre>  indented lines  kept</pre><textarea>raw   text</textarea></div>",
    ]);

    const result = await auditCompiled("pre-whitespace");
    expect(result.divergences).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("output stays readable: no single-letter identifiers in emitted code", () => {
    const code = compileFixtureBody("control-flow-for");
    // Uncompiled JSX also contains no `const x =`, so the negative alone says
    // nothing. Require the compiled shapes whose names are the ones at risk.
    expect(code).toMatch(/const _tmpl\$\d+ = /);
    expect(code).toMatch(/const _el\$\d+ = /);
    expect(code).not.toMatch(/\bconst [a-z] =/);
  });
});
