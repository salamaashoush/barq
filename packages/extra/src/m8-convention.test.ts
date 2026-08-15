/**
 * THE CONSUMER DECISION, registered.
 *
 * `CODESIGN.md` §8 schedules `packages/extra` and `packages/kitchen-sink` for
 * **M8**, on a single branch, with no compat shim. M2 changed the convention
 * for `Ctx.Provider` and M3 changed it for every component, so from **M2**
 * until M8 this package's own suite is RED — 54 of its 87 router tests.
 *
 * Bisected, each commit run against ITS OWN `packages/core` in a detached
 * worktree — the naive worktree resolves `@barqjs/core` back to the working
 * tree, which makes the comparison vacuous, so the resolution was checked with
 * `Bun.resolveSync` before each run:
 *
 *     213df34 (M1)  87 pass   0 fail
 *     04c20fd (M2)  33 pass  54 fail  54x props.value @ signals.ts Provider
 *     62b172c (M3)  33 pass  54 fail  53x props.initialPath + 1x config.base
 *
 * The count is identical across M2 and M3 because M3 moved the throw earlier in
 * the same stack, not because M3 caused it — which is why reading the tree
 * without bisecting attributes all 54 to M3. M2's brief said the calling
 * convention was not to change until M3; its diff changed it for `Ctx.Provider`
 * anyway. The type level agrees: `bun run typecheck` here gives exactly 9
 * errors, 7 at `<Ctx.Provider>` sites (router.tsx:1630,1655,1657,1768,1770,
 * 1841,1843) and 2 at `<Fragment>` sites (:1771,:1844), and NONE at
 * `MemoryRouter`. An M8 pass that migrated only the M3 half would satisfy every
 * other assertion in this file and leave the M2 half red, so it has a row.
 *
 * At M3 the 54 take two shapes, differing only by whether an owner was ambient
 * at the JSX-argument site:
 *
 *     53x TypeError: null is not an object (evaluating 'props.initialPath')
 *         — `render(<MemoryRouter …/>, host)` at test top level, `getOwner()`
 *           null, so `props` binds null. e.g. `Edge Cases > handles base path
 *           configuration`, router.test.tsx:1313, throwing at router.tsx:1806.
 *
 *      1x TypeError: undefined is not an object (evaluating 'config.base')
 *         — `Memory & Cleanup > cleans up router on unmount`,
 *           router.test.tsx:1361, whose `render` runs inside `createScope`, so
 *           `getOwner()` returns a Scope: `props.initialPath` is undefined and
 *           falls through `|| "/"`, and `props.config` — undefined for the same
 *           reason — reaches `initMemoryRouter` and throws at router.tsx:1111.
 *
 * That is not a mystery and it is not a regression to hunt. It is one fact:
 * a component's first parameter is now the SCOPE (C1), `router.tsx` declares
 * its components as `(props) => …`, so `props` binds the scope.
 *
 * ## Why the codemod was NOT run here
 *
 * Not because the scope is unreachable here. `createElement`
 * (`packages/core/src/dom.ts`, the `typeof tag === "function"` branch of
 * `createElement`) invokes ANY function tag as
 * `tag(getOwner(), finalProps)`, so the eager path Bun's transform emits
 * already passes a scope first, and a consumer-side `(props)` → `(_s$, props)`
 * would receive props today. The last two assertions below prove both halves.
 *
 * The blocker is not that the scope is unreachable, and it is not that context
 * would then resolve against the wrong owner. Measured, on a byte-identical
 * copy of router.tsx with ONLY six declarations given a leading scope parameter
 * and the UNMODIFIED router.test.tsx redirected at it: **87 pass / 0 fail**.
 * Context survives that edit because every Provider site in this file already
 * carries the function-children workaround (see the NOTE at :1838), so
 * `Ctx.Provider` `enter`s its instance and only then invokes
 * `props.children(instance)` — `useContext` at :1245/:1542/:1551 resolves
 * through that instance, never through whatever was ambient outside it.
 *
 * That probe touched FIVE real declarations — :1402 Link, :1458 NavLink,
 * :1736 Router, :1805 MemoryRouter, :1923 Redirect — plus :1534 Outlet, which
 * is zero-arity (`export function Outlet(): JSXElement`) and whose edit was
 * therefore a no-op. :1947 `Loading` was NOT in the probe: `<Loading` appears
 * zero times in router.test.tsx, so it is unreached by the 54 and the 87/0
 * would have been green with it unmigrated. Counting the probe as "six
 * migratable declarations" over-reports the evidence in one direction and
 * under-reports the surface in the other, so the first test below enumerates
 * all seven exactly rather than asserting a non-empty count.
 *
 * The three blockers that survive that probe are:
 *
 *   (a) the transform — see the next paragraph;
 *   (b) the INVOCATION half. router.tsx:1607/1631/1659 hand USER-supplied
 *       components props in the scope's slot, which this suite's zero-arity
 *       fixtures hide. Signatures alone therefore convert 54 loud failures
 *       into a silent hole, which is the failure mode to avoid.
 *   (c) THIRD-PARTY components. `goober/src/styled.js:26` is
 *       `function Styled(props, ref)`; `styled` is re-exported at index.ts:10.
 *       `barq migrate` runs over packages/extra/src and cannot reach
 *       node_modules, so M8 must either wrap every foreign component at the
 *       boundary or stop passing the scope positionally to functions the
 *       compiler did not emit. Unlike (a) and (b) this one is not a codemod
 *       target at all, and unlike the 54 it is SILENT — see the test below.
 *
 * All three land in one pass or none do.
 *
 * And this package is compiled by **Bun's `react-jsx` transform** into
 * `@barqjs/core/jsx-runtime` (see `tsconfig.json`) — the un-compiled authoring
 * path §11 Q2 deletes outright — so its props arrive as eager plain values, not
 * Cells. §8's `barq migrate` pass (`props.x` → `props.x()`) would therefore call
 * values, and `_$props` source lists cannot be emitted for this package at all.
 *
 * Running the codemod now would therefore produce a package that is migrated
 * and still cannot execute, and would destroy the evidence M8 needs: §8 makes
 * the router the acceptance test for the whole design and requires its nine
 * enumerated workarounds to become DELETIONS. A mechanical `props.x()` pass
 * preserves all nine. The scope has to come from the barq compiler, and wiring
 * that into `bun test` for this package is infrastructure M8 owns.
 *
 * ## What this file is
 *
 * The registry row, with the same four properties `known-failures.ts` has:
 * it names the cause, it fails if the cause stops being true (so a migrated
 * package cannot leave a stale row behind), it names the milestone, and it is
 * a diff a reviewer sees. Without it the red suite is 54 anonymous
 * TypeErrors, which is the one outcome the milestone brief rules out.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ROUTER = readFileSync(join(ROOT, "src", "router.tsx"), "utf8");
const TSCONFIG = readFileSync(join(ROOT, "tsconfig.json"), "utf8");
const SIGNALS = readFileSync(join(ROOT, "..", "core", "src", "signals.ts"), "utf8");

const MILESTONE = "M8";

describe(`the M2/M3 calling convention: this package is scheduled for ${MILESTONE}`, () => {
  test("router.tsx is still authored on the pre-M3 convention", () => {
    // A component declared `(props: …)` — the props in the position the scope
    // now occupies. Enumerated, not counted: `toBeGreaterThan(0)` only goes red
    // when the LAST pre-M3 declaration is migrated, so a pass that does the six
    // the 87/0 probe exercised and forgets :1947 `Loading` — which no test in
    // router.test.tsx reaches — leaves this row green over a half-migrated file.
    // The `\)\s*:` alternative exists for :1534 `Outlet`, whose zero-parameter
    // form is invisible to a `props`-anchored pattern and which still needs the
    // leading scope parameter.
    const preM3 = [...ROUTER.matchAll(/function ([A-Z][\w$]*)\(\s*(?:props\b|\)\s*:)/g)].map(
      (m) => m[1],
    );
    expect(preM3.toSorted()).toEqual([
      "Link",
      "Loading",
      "MemoryRouter",
      "NavLink",
      "Outlet",
      "Redirect",
      "Router",
    ]);
  });

  test("the reference application is BLANK until this milestone, for this exact reason", () => {
    // CODESIGN §8 records that packages/kitchen-sink renders an empty
    // `<div id="app">` from M3 to M8. The mechanism is one line, and it is
    // pinned here so "blank page" cannot quietly come to mean something new:
    // `Router` takes props in the scope's position, so `props.config` is the
    // Scope, `state.config.routes` is undefined, and `precompileRoutes`
    // iterates it. The Provider defect the redesign exists to remove is FIXED;
    // this is a different, scheduled failure that happens to look the same
    // from the browser.
    expect(ROUTER).toMatch(/export function Router\(\s*props: RouterProps\s*\)/);
    expect(ROUTER).toContain("initBrowserRouter(props.config)");
    // …and the thing that then iterates it, so the stack in the console has a
    // named source rather than a minified frame.
    expect(ROUTER).toMatch(/for \(const route of routes\)|routes\.forEach|\.\.\.routes/);
  });

  test("it is compiled by Bun's JSX transform, not by the barq compiler", () => {
    // Props therefore arrive as eager plain values, not Cells, which is what
    // makes `barq migrate` insufficient here and what M8 has to change first.
    expect(TSCONFIG).toContain('"jsx": "react-jsx"');
    expect(TSCONFIG).toContain('"jsxImportSource": "@barqjs/core"');
  });

  test("the INVOCATION half is pre-M3 too, and is not visible in the 54", () => {
    // The row above pins the declarations. There is a second half, and it is
    // latent rather than red: `Outlet` invokes USER-supplied components on the
    // one-argument convention, so a route component that reads `props.params`
    // or an errorElement that reads `props.error` would receive a Scope. The
    // slice's own fixtures use zero-arity components (`() => <div>Home</div>`),
    // which is the only reason these sites are not among the 54 — so migrating
    // signatures alone leaves them, and this assertion is what stops that.
    expect(ROUTER).toMatch(/\bErrorComp\(\{/);
    expect(ROUTER).toMatch(/\bRouteComp\(\{/);
    expect(ROUTER).toContain("state.config.fallback()");
    // …and the type that propagates the shape, so the fix is a retype and not
    // five call-site edits.
    expect(ROUTER).toContain("route.component as (props: RouteComponentProps) => Child");
    expect(ROUTER).toMatch(/errorElement\?: \(props: ErrorBoundaryProps\) => Child/);
  });

  test("the M2 half — Ctx.Provider — is the first-red edge and is still unmigrated", () => {
    // The six declarations above are the M3 half. This is the M2 half, and it
    // is the one a signature-only pass leaves behind: `Ctx.Provider` took the
    // scope one milestone earlier, which is why 04c20fd is already 33/54.
    expect(SIGNALS).toContain('requireScope(s, "Ctx.Provider")');
    expect(SIGNALS).toMatch(
      /Provider: \(s: Scope, props: \{ value: MaybeAccessor<T>; children: unknown \}\) => JSXElement/,
    );
    expect(ROUTER).toContain("<RouterContext.Provider value={() => state}>");
    expect(ROUTER).toContain("<OutletLevelContext.Provider value={() => 0}>");
  });

  test("the orphan list is gated on THIS milestone, not on M3 as its comment claimed", () => {
    // signals.ts promised to delete `orphans`/`orphanCleanups` at M3. It did
    // not, and it could not: this package is un-compiled, so `onCleanup` at
    // router.tsx:1812 runs with no owner, lands in `orphanCleanups`, and is
    // claimed by `enterRoot`. Deleting the list before this package is compiled
    // takes these 54 failures to a larger number. Red the moment M8 deletes it,
    // which is the first point at which deleting it is safe.
    expect(SIGNALS).toContain("const orphanCleanups: (() => void)[] = [];");
    expect(SIGNALS).toContain("adoptOrphanCleanups(scope);");
  });

  test("the runtime it is written against has already moved", () => {
    // Not a claim about this package: a claim about the ABI it is red against,
    // asserted from the runtime itself so the row cannot be about a version
    // skew nobody checked.
    const core = require("@barqjs/core") as Record<string, unknown>;
    expect(typeof core.props).toBe("function");
    expect(typeof core.cell).toBe("function");
    expect(typeof core.requireScope).toBe("function");
  });

  test("the eager path already passes a scope first — the signature is the consumer's to change", () => {
    const { createElement } = require("@barqjs/core") as {
      createElement: (t: unknown, p: unknown) => unknown;
    };
    const preM3 = (props: { msg?: string }) => String(props?.msg);
    const postM3 = (_s: unknown, props: { msg?: string }) => String(props?.msg);
    expect(createElement(preM3, { msg: "hi" })).toBe("undefined");
    expect(createElement(postM3, { msg: "hi" })).toBe("hi");
  });

  test("a THIRD blocker: third-party components cannot be codemodded at all", () => {
    // (a) and (b) are edits to files under packages/extra/src. This one is not:
    // goober's `function Styled(props, ref)` lives in node_modules and is a hard
    // dependency, and `styled` is re-exported publicly at index.ts:10. So the
    // Scope lands in `props`, the user's props land in `ref`, and line 28's
    // `Object.assign({}, props)` copies the SCOPE. No error is raised either
    // way — at top level the props vanish, inside a scope the runtime's own
    // fields (including the stringified disposer) are serialised into DOM
    // attributes. css.ts has no test file, so nothing else observes this.
    const { createElement, createScope } = require("@barqjs/core") as Record<string, Function>;
    const { styled } = require("./css.ts") as {
      styled: (t: string) => (s: TemplateStringsArray) => Function;
    };
    const Btn = styled("button")`color: red;`;
    const top = createElement(Btn, { className: "mine", id: "b1" }) as Element;
    expect(top.getAttribute("id")).toBeNull();
    expect(top.className).not.toContain("mine");
    createScope(() => {
      const inner = createElement(Btn, { className: "mine", id: "b2" }) as Element;
      expect(inner.getAttribute("id")).toBeNull();
      expect(inner.hasAttribute("gen")).toBe(true);
      expect(inner.getAttribute("dispose")).toContain("disposeScope");
    });
  });

  test("the pre-M3 surface is not confined to router.tsx", () => {
    // The row above is written entirely about router.tsx because router.tsx is
    // the only module with a suite. Two further public components are declared
    // on the pre-M3 convention in files with no tests at all, so no count
    // anywhere moves when they break: query.ts:109 reads `props.client` one
    // line later, and css.ts:225 hands `props || {}` to every interpolation
    // function. M8 has to name both.
    const QUERY = readFileSync(join(ROOT, "src", "query.ts"), "utf8");
    const CSS = readFileSync(join(ROOT, "src", "css.ts"), "utf8");
    expect(QUERY).toMatch(/export function QueryClientProvider\(\s*props:/);
    expect(CSS).toContain("return function GlobalStyleComponent(props?: P): null {");
    const INDEX = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    for (const n of ["QueryClientProvider", "createGlobalStyle", "styled", "Loading"])
      expect(INDEX).toContain(n);
  });

  test("the red is exactly this size and exactly these two shapes", () => {
    // packages/compiler-rs gets four bidirectional assertions from
    // test/known-failures.ts. This package gets none of them: every other test
    // in this file passes identically whether router.test.tsx is 33/54 or
    // 20/67, so a NEW failure from any later milestone is absorbed into "the
    // one expected red" and reports green. This is the count and the shape set.
    if (process.env.BARQ_M8_INNER) return;
    const out = Bun.spawnSync({
      cmd: ["bun", "test", "src/router.test.tsx"],
      cwd: ROOT,
      env: { ...process.env, npm_lifecycle_event: "", BARQ_M8_INNER: "1" },
    });
    const text = new TextDecoder().decode(out.stderr) + new TextDecoder().decode(out.stdout);
    expect(text).toMatch(/\n\s*33 pass/);
    expect(text).toMatch(/\n\s*54 fail/);
    const shapes = [...text.matchAll(/^(TypeError:.*)$/gm)].map((m) => m[1]);
    const distinct = [...new Set(shapes)].toSorted();
    expect(distinct).toEqual([
      "TypeError: null is not an object (evaluating 'props.initialPath')",
      "TypeError: undefined is not an object (evaluating 'config.base')",
    ]);

    // The count and the shape set are both insensitive to MEMBERSHIP: a later
    // milestone that fixes one of the 54 and breaks a different router test
    // keeps them green. These are the names.
    const failed = [...text.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+ms\])?$/gm)]
      .map((m) => m[1])
      .toSorted();
    expect(failed).toEqual([
      "Edge Cases > handles base path configuration",
      "Edge Cases > handles deeply nested routes",
      "Edge Cases > handles empty routes array",
      "Edge Cases > handles hash-only navigation",
      "Edge Cases > handles rapid navigation",
      "Edge Cases > handles route with trailing slash",
      "Edge Cases > handles special characters in params",
      "Edge Cases > handles unicode paths",
      "Edge Cases > multiple MemoryRouters work independently",
      "Hooks > useIsLoading > returns loading state signal",
      "Hooks > useLocation > returns current location",
      "Hooks > useLocation > updates on navigation",
      "Hooks > useMatchedRoutes > returns matched route chain",
      "Hooks > useNavigate > returns navigate function",
      "Hooks > useNavigate > supports replace option",
      "Hooks > useParams > returns route params",
      "Hooks > useParams > updates on param change",
      "Hooks > useSearchParams > returns search params",
      "Hooks > useSearchParams > setSearchParams filters empty values",
      "Hooks > useSearchParams > setSearchParams updates URL",
      "Loaders > executes loader on route match",
      "Loaders > executes loaders in parallel for nested routes",
      "Loaders > handles loader errors",
      "Loaders > passes params to loader",
      "Loaders > passes searchParams to loader",
      "Loaders > provides abort signal to loader",
      "Loaders > route errorElement catches loader errors",
      "Memory & Cleanup > cleans up router on unmount",
      "Memory & Cleanup > clears cache entries on TTL expiration",
      "New Features > Cache Configuration > custom TTL is respected",
      "New Features > Debug Mode > setRouterDebugMode enables debug logging",
      "New Features > Loading States > useIsLoading returns true during loader execution",
      "New Features > Relative Navigation > Link resolves relative href",
      "New Features > Relative Navigation > navigate supports relative paths",
      "New Features > Route Guards > afterEach hook is called after navigation",
      "New Features > Route Guards > beforeEach guard can block navigation",
      "New Features > Route Guards > beforeEach guard can redirect",
      "New Features > Route Guards > route-level beforeEnter guard",
      "Router Components > Link > navigates on click",
      "Router Components > Link > renders anchor element",
      "Router Components > Link > skips navigation with modifier keys",
      "Router Components > Link > supports replace option",
      "Router Components > MemoryRouter > navigates between routes",
      "Router Components > MemoryRouter > renders with initial path",
      "Router Components > MemoryRouter > shows default 404 without fallback",
      "Router Components > MemoryRouter > shows fallback for 404",
      "Router Components > MemoryRouter > supports custom initial path",
      "Router Components > NavLink > adds active class when route matches",
      "Router Components > NavLink > deprecated exact prop works same as end",
      "Router Components > NavLink > supports end prop for exact matching",
      "Router Components > NavLink > uses prefix matching by default",
      "Router Components > Outlet > renders child routes",
      "Router Components > Outlet > renders nested outlets",
      "Router Components > Redirect > redirects on render",
    ]);
  });

  test("the scope it passes is the AMBIENT owner, not the parent's scope", () => {
    // The reason a signature-only migration is not enough: this argument is
    // whatever `getOwner()` returns where the JSX was BUILT.
    const { createElement, createScope } = require("@barqjs/core") as Record<string, Function>;
    const seen: unknown[][] = [];
    const Probe = (...args: unknown[]) => {
      seen.push(args);
      return null;
    };
    createElement(Probe, { a: 1 });
    expect(seen[0]).toHaveLength(2);
    expect(seen[0][0]).toBeNull();
    expect(seen[0][1]).toEqual({ a: 1 });
    createScope(() => {
      createElement(Probe, { a: 2 });
    });
    expect(seen[1][0]).not.toBeNull();
    expect(typeof seen[1][0]).toBe("object");
  });
});
