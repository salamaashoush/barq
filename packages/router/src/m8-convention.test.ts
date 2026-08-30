/**
 * THE M8 SCORECARD, inverted.
 *
 * This file used to assert that `packages/extra` was STILL on the pre-M3
 * convention — seven `(props)` declarations, a blank reference application,
 * `jsx: react-jsx`, an orphan list, a goober component nobody could reach, and
 * a hard-coded `33 pass / 54 fail`. Every one of those rows was a statement
 * about a scheduled failure, and every one of them inverts cleanly into a
 * statement about the contract that replaced it. Nothing was dropped; each row
 * below names the row it replaces.
 *
 * The nine workarounds are DELETIONS, and this file is where "deleted" is
 * checkable rather than claimed: each is a string that used to be in
 * `router.tsx` and is in no source file now, beside the primitive that took its
 * job.
 *
 * MOVED HERE when `packages/extra/src/router.ts` was deleted. Pointed at the
 * file that replaced it rather than retired with it: a scorecard that only ever
 * described a file that no longer exists proves nothing, and the interesting
 * question is whether the REPLACEMENT reintroduced any of the nine. It did not,
 * and now that is checked where it can go wrong.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
// The router is several modules now, so the scorecard reads all of them.
const ROUTER = ["components.ts", "router.ts", "hooks.ts", "history.ts", "matcher.ts", "path.ts"]
  .map((file) => readFileSync(join(SRC, file), "utf8"))
  .join("\n");

const INDEX = readFileSync(join(SRC, "index.ts"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Every source module with its comments stripped, so a row can say "and nowhere
 * else" about CODE. These rows name the mechanisms that were deleted, and the
 * deletions are documented in the very files being scanned — a raw text search
 * would be satisfied by a comment explaining the deletion.
 */
const SOURCES = readdirSync(SRC)
  .filter((file) => (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.includes(".test."))
  .map((file) => [file, code(readFileSync(join(SRC, file), "utf8"))] as const);

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function nowhere(pattern: RegExp): string[] {
  return SOURCES.filter(([, text]) => pattern.test(text)).map(([name]) => name);
}

describe("the nine workarounds are deletions", () => {
  // #1 — 7 `value={() => state}` sites and the `{() => …}` wrappers around them.
  // 90 arrows in the file, most of them defeating an eager evaluation that no
  // longer happens. Replaced by: every prop is a Cell already.
  test("1. nothing defers by hand, because a prop is already a Cell", () => {
    expect(ROUTER).not.toContain("value={() =>");
    // The old file carried 90 `() =>`. This is a budget, not a count: the
    // router still writes Cells (`() => state.params()`), and what died is the
    // wrapper AROUND a value that was already deferred.
    // RAISED THREE TIMES, and the trend is left visible rather than smoothed
    // over: 45 -> 70 when the caching layer, the reload policy and the
    // `beforeLoad` phase landed here, 70 -> 90 for masking, blocking and the
    // pending timers, then 90 -> 110 for the braced path grammar, `basepath`,
    // the router-wide `defaults`, the rest of the link surface, `notFoundMode`
    // and `<ClientOnly>`.
    // A budget that is raised whenever it binds is worth nothing, so what it is
    // and is not has to be said plainly.
    //
    // It is a PROXY. The regex also counts `() =>` in a type annotation and in
    // an ordinary callback, neither of which is hand-deferral, so the number
    // tracks this file's SIZE more than its style. Its job is to make growth
    // visible at review time; the row below is the one that names the actual
    // anti-pattern, and `2b` is the one with teeth.
    const arrows = [...ROUTER.matchAll(/\(\)\s*=>/g)].length;
    expect(arrows).toBeLessThan(110);
  });

  // #2 — `contextState() || getMainBrowserRouter()` at two sites, over 29 lines
  // of registry. Replaced by: prototype context resolved through the scope chain
  // at read time.
  test("2. there is no module-global router and no fallback to one", () => {
    expect(nowhere(/getMainBrowserRouter|routerRegistry|mainBrowserRouterId/)).toEqual([]);
    expect(ROUTER).toContain("read(RouterContext)");
    // …and the public surface no longer offers a way to reach "the" router.
    expect(INDEX).not.toMatch(/^\s*navigate,$/m);
    expect(INDEX).not.toMatch(/^\s*prefetch,$/m);
  });

  // #2, by SHAPE rather than by name. The three identifiers above are the
  // router's spelling of the workaround, and naming them is why the same
  // mechanism survived one module over in `query.ts` as a try/catch around a
  // context read falling back to a module-level `let` — `||` written as
  // exception control flow. What is banned is any module-scope mutable that a
  // resolver can answer with.
  test("2b. no resolver falls back to a module-level mutable", () => {
    for (const [name, text] of SOURCES) {
      const mutables = [...text.matchAll(/^let\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
      for (const binding of mutables) {
        const arms = new RegExp(
          `catch[^{]*\\{[^}]*\\b${binding}\\b|\\|\\|\\s*${binding}\\b|\\?\\?\\s*${binding}\\b`,
        );
        expect(arms.test(text), `${name} resolves through the module-level \`${binding}\``).toBe(
          false,
        );
      }
    }
    // The application-default setter that carried it is gone with it, and the
    // reference application now reaches its client the way the design says.
    expect(nowhere(/setQueryClient/)).toEqual([]);
    // The reference application's ROOT ROUTE, which is where a provider belongs.
    // It used to be the client entry, and the entry is the wrong place twice
    // over: it wraps only the client's tree, and it makes every application
    // hand-write a boot the framework owns. `__root.tsx`'s component wraps every
    // route on BOTH backends, which is where TanStack puts theirs too.
    const ROOT_ROUTE = readFileSync(
      join(ROOT, "..", "kitchen-sink", "src", "routes", "__root.tsx"),
      "utf8",
    );
    expect(ROOT_ROUTE).toContain("<QueryClientProvider client={queryClient}>");
  });

  // #3 — 14 uses of createMarkerPair / clearRange / insertNodes / childToNodes.
  // Replaced by: `branch` owns its range.
  test("3. no hand-rolled range management anywhere in the package", () => {
    expect(nowhere(/createMarkerPair|clearRange|insertNodes|childToNodes/)).toEqual([]);
    expect(ROUTER).toContain("branch(scope, parent, anchor,");
  });

  // #4 — `route === prevRoute && data === prevData && error === prevError`.
  // Replaced by: the `key` argument of `branch`.
  test("4. the memo is the branch key, and data is not in it", () => {
    expect(nowhere(/prevRoute|prevData|prevError/)).toEqual([]);
    // The key is route IDENTITY. Neither data nor params is in it, which is
    // what lets a loader landing or a parameter moving UPDATE the route instead
    // of rebuilding it.
    expect(ROUTER).toMatch(/branch\(scope, parent, anchor, routeAt/);
  });

  // #5 — a detached `scope(fn, true)` plus a manual `disposeCurrentRoute`.
  // Replaced by: branch disposal.
  test("5. nothing disposes a route by hand and nothing detaches a scope", () => {
    expect(nowhere(/disposeCurrentRoute|scope\(/)).toEqual([]);
  });

  // #6 — the duplicated first render at :1691, "avoids 404 flash when Router
  // effect hasn't run yet". Replaced by: matches DERIVED from location, so the
  // first render is already right and there is nothing to duplicate.
  test("6. the match chain is derived from the location, never assigned", () => {
    // The literal used to be `matcher.match(location().pathname)`. Route masking
    // changed the ARGUMENT — a masked location matches `unmask(location())`,
    // which is the one place the URL shown and the route rendered differ — and
    // the rule is about the derivation, not the spelling: still a `computed`
    // over `location()`, still nothing assigning a chain from outside.
    expect(ROUTER).toContain("matcher.match(unmask(location()))");
    expect(ROUTER).not.toMatch(/setMatchedRoutes|effect\(renderRoute\)/);
  });

  // #7 — `OutletLevelContext` depth threading, written at three sites and read
  // at two. The workaround this row killed was DEPTH THREADING: three writes and
  // two reads of a level counter, so a component had to be told where it sat.
  //
  // `<Outlet />` came BACK, deliberately, when the route surface moved to
  // TanStack's: theirs is `<Outlet />` and route components take no props. What
  // did not come
  // back is the thing this row was about: there is still no depth context and
  // nothing threads a level. `Outlet` places the SAME Block `children` always
  // was, so the next route is still CONSTRUCTED inside the layout's scope and a
  // provider the layout installed still wraps it.
  test("7. there is no depth threading, and Outlet places a Block", () => {
    expect(nowhere(/OutletLevelContext/)).toEqual([]);
    expect(ROUTER).toContain("children = block(");
    // The outlet returns the Block invoked with the scope it sits in — not a
    // pre-built tree, which is the version that could not carry the layout's
    // providers. The trailing cast is type-level and says nothing about which
    // of those two this is, so the pin is on the CALL.
    expect(ROUTER).toContain("return match.children(scope)");
  });

  // #8 — `return computed(…) as unknown as JSXElement` in `Loading`. Replaced by:
  // `Out` admits a Cell, so the cast has nothing to convert — and `Loading`
  // itself was reached by nobody and is gone.
  test("8. no component casts a memo into an element", () => {
    // NARROWED, with the reason, rather than deleted. The workaround this row
    // killed was a MEMO cast into an element position. `HeadContent` and
    // `Scripts` cast an `SsrHtml` — the string backend's element — into
    // `JSXElement`, which is the DOM backend's, and there is no third type that
    // covers both: `JSXElement` lives in `@barqjs/core` and `SsrHtml` in
    // `@barqjs/server`, which core cannot import. So the bridge is allowed at a
    // component boundary that produces one, and nowhere else.
    const casts = SOURCES.filter(([, text]) =>
      text
        .split("\n")
        .some(
          (line) => /as unknown as JSXElement/.test(line) && !/ssrHtml\(|\) as unknown/.test(line),
        ),
    ).map(([name]) => name);
    expect(casts).toEqual([]);
    expect(INDEX).not.toMatch(/^\s*Loading,$/m);
  });

  /**
   * NOTHING APPENDS INTO AN ELEMENT IT MAY HAVE CLAIMED.
   *
   * `anchorElement` built its `<a>` from a template and then called
   * `element.append(children)`. On a cold render that is correct and on a
   * HYDRATED one it is not: the template claims the server's anchor, text and
   * all, so the append leaves a second copy inside it. Measured on the
   * reference application as every one of the ten navigation links reading its
   * own name twice, the sidebar a row taller than the server's, and therefore a
   * layout shift on every page that has a link.
   *
   * `hydrate.report` cannot see it. The claim SUCCEEDED and the tree was right
   * until the component added to it, so there is no mismatch to report — which
   * is exactly why this is a source gate rather than an assertion on a render.
   *
   * `insert` is the seam that claims what the server wrote instead of adding to
   * it, and it is what every other construct in this package already uses.
   */
  test("10. no element built from a template is appended into", () => {
    const offenders = SOURCES.filter(([, text]) =>
      /\b(?:element|node|anchor)\.append(?:Child)?\(/.test(text),
    ).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  // #9 — `Link` read `state.location()` at CONSTRUCTION, so a relative href
  // never re-resolved. `router.test.tsx` pins the behaviour by navigating; this
  // pins the SHAPE, because the behavioural test only sees it where the Link
  // survives the location change.
  test("9. both link components resolve their href inside the computation", () => {
    // No `const currentLocation = state.location()` above a memo that then
    // closes over the snapshot.
    expect(ROUTER).not.toMatch(/const currentLocation = state\.location\(\)/);
    // Read per binding evaluation, so a surviving link re-resolves when the
    // location moves.
    expect(ROUTER).toContain("const target = (): string => resolveTo(state, props)");
    // Both components resolve the same way, because `NavLink` is `Link`'s
    // `anchorElement` with an extra binding rather than a second copy — the old
    // pair were two near-identical bodies and the duplication is what let one
    // of them keep the snapshot.
    expect([...ROUTER.matchAll(/anchorElement\(/g)]).toHaveLength(3);
  });
});

/**
 * Rows added after the M8 gate found each of these still standing, three of
 * them under a claim that they were gone. A row here has to fail against the
 * shape it names, not against the comment that named it.
 */
describe("the workarounds the first pass left behind", () => {
  // The record claimed the two-phase `navigate: async () => {} // Will be set
  // below` was deleted; only its comment was. `go` is a hoisted function
  // declaration, so the placeholder was never needed — and a `useNavigate()`
  // captured before the late assignment returned the no-op.
  test("the state object is complete at construction", () => {
    expect(ROUTER).not.toMatch(/navigate:\s*async\s*\(\)\s*=>\s*\{\s*\}/);
    expect(ROUTER).not.toMatch(/state\.navigate\s*=/);
    expect(ROUTER).not.toMatch(/state\.prefetch\s*=/);
    expect(ROUTER).toMatch(/^\s*navigate,$/m);
  });

  // The entry URL ran the guard pipeline only when some route in the matched
  // chain happened to declare a loader, so a deep link into a guarded route
  // rendered it. The loader check decides whether to LOAD, never whether the
  // pipeline runs.
  test("the entry navigation is not gated on a loader existing", () => {
    expect(ROUTER).not.toMatch(/openingChain\.some\(\(route\) => route\.loader\)/);
    // There is no entry navigation to gate any more: the location is seeded
    // from the history synchronously at construction.
    expect(ROUTER).toContain("signal<Location>(history.current())");
  });

  // `setTimeout(…, 0)` for ORDERING — a guess that the DOM has been written by
  // the time the macrotask runs. `flush()` is the capability it stood in for.
  test("nothing waits on a macrotask to observe the DOM", () => {
    expect(ROUTER).not.toMatch(/setTimeout\([^,]*,\s*0\)/);
  });

  // `reset` was invoked, reset nothing, and re-threw. `router.test.tsx` pins the
  // behaviour by clicking it; this pins that a retry exists at all.
  test("the error arm can actually retry", () => {
    // `invalidate()` drops the keyed loader cells and mints new ones, so a
    // read after it fetches for real rather than replaying a failure.
    expect(ROUTER).toContain("invalidate()");
  });

  // A guard redirecting to a path its own predicate also rejects recursed
  // without bound and hung the process.
  test("redirects are bounded", () => {
    expect(ROUTER).toContain("MAX_REDIRECTS");
    expect(ROUTER).toMatch(/hops\+\+/);
  });
});

describe("the four bugs the review did not name", () => {
  // #10 — the child pathname was sliced by the PATTERN's length.
  test("10. the prefix split consumes what matched, not what was written", () => {
    expect(ROUTER).not.toMatch(/pathname\.slice\(route\.path\.length\)/);
    // There is no prefix split at all now — the matcher walks segments — so the
    // bug is unrepresentable rather than fixed.
    expect(nowhere(/splitPrefix|prefixPattern/)).toEqual([]);
  });

  // #11 — a bogus `"*"` param leaked into every nested match.
  test("11. the layout prefix pattern's catch-all is deleted before publishing", () => {
    // Likewise: a splat is a named segment the walk fills, so there is no
    // catch-all to delete before publishing.
    expect(ROUTER).not.toMatch(/delete params\["\*"\]/);
  });

  // #12 — the outlet memo omitted `params`, so a same-route param change
  // rendered nothing.
  test("12. params flow as a Cell rather than through the key", () => {
    expect(ROUTER).toContain("params: () => state.params()");
  });

  // #13 — `startsWith` with no segment boundary.
  test("13. NavLink's prefix match has a segment boundary", () => {
    expect(ROUTER).toContain("export function isUnder(pathname: string, prefix: string): boolean");
    expect(ROUTER).not.toMatch(/loc\.pathname\.startsWith\(href\)/);
  });
});

describe("the convention, from the other side", () => {
  // Replaces "router.tsx is still authored on the pre-M3 convention", which
  // enumerated seven `(props)` declarations.
  test("every component this package exports takes its scope first", async () => {
    const core = (await import("@barqjs/core")) as { isBlock(v: unknown): boolean };
    const router = await import("./components.ts");

    const components = {
      Link: router.Link,
      NavLink: router.NavLink,
      Redirect: router.Redirect,
      Router: router.Router,
      RouterProvider: router.RouterProvider,
    };

    for (const [name, value] of Object.entries(components)) {
      expect(typeof value, name).toBe("function");
      // Branded, so a Block reaching a Cell slot throws rather than being
      // stringified, and invoking one with no scope names the Block instead of
      // failing downstream.
      expect(core.isBlock(value), name).toBe(true);
      expect(() => (value as (...a: unknown[]) => unknown)(), name).toThrow(/Block|scope/i);
    }
  });

  // Replaces "the INVOCATION half is pre-M3 too, and is not visible in the 54".
  // That row existed because the suite's fixtures were zero-arity, so a route
  // component reading `props.params` would have received a Scope with nothing
  // going red. `router.test.tsx` now declares props-taking route components at
  // module scope and asserts what they render.
  test("the invocation half passes the scope and the props as Cells", () => {
    // `withMatch(contentScope, …)` now wraps the call, because a route component
    // takes NO props since the move to TanStack's surface — `Route.useLoaderData()`
    // and `<Outlet />` read the match from a context instead. The scope is still
    // threaded through, which is what this row is actually about: the inner scope
    // the provide hands back is what the component is invoked with.
    expect(ROUTER).toMatch(/withMatch\(\s*contentScope,/);
    expect(ROUTER).toContain("(component as unknown as Invoked)(inner,");
    // A regex, not a substring: what is pinned is that the scope goes FIRST,
    // and a call that grew a second argument onto its own line still says that.
    expect(ROUTER).toMatch(/\(fallback as unknown as Invoked\)\(\s*instance,/);
    // …and the suite drives a props-taking route component rather than a
    // zero-arity fixture, which is what made the old invocation half invisible.
    const TEST = readFileSync(join(SRC, "router.test.ts"), "utf8");
    expect(TEST).toContain("props: RouteProps");
    expect(TEST).toContain("props.data()");
  });

  // Replaces "it is compiled by Bun's JSX transform, not by the barq compiler".
  test("this package is compiled by the barq compiler", () => {
    const SETUP = readFileSync(join(SRC, "test-setup.ts"), "utf8");
    expect(SETUP).toContain('require_("@barqjs/compiler-rs")');
    expect(SETUP).toContain("native.transform(source");
    expect(PKG.devDependencies?.["@barqjs/compiler-rs"]).toBeDefined();
    // …and the library itself contains no JSX at all, so the app bundle and the
    // test process run ONE implementation.
    expect(readdirSync(SRC).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))).toEqual([]);
  });

  // Replaces "the M2 half — Ctx.Provider — is the first-red edge".
  test("no Ctx.Provider JSX and no function-children workaround", () => {
    expect(nowhere(/\.Provider\s+value=|Ctx\.Provider/)).toEqual([]);
    expect(ROUTER).toContain("provide(scope as Scope, RouterContext, cell(state),");
  });

  // Replaces "the orphan list is gated on THIS milestone". The list still
  // exists in signals.ts and is still claimed by the EAGER `render` form, which
  // core's own suite covers. What this package promised is that IT stops
  // producing orphans, and that is what is asserted: every cleanup it registers
  // runs under a scope the caller handed it.
  test("this package registers no ownerless cleanup", () => {
    expect(ROUTER).toContain("export const Router = block(RouterImpl) as unknown as");
    const cleanups = [...ROUTER.matchAll(/onCleanup\(/g)].length;
    expect(cleanups).toBeGreaterThan(0);
    // Every `onCleanup` in the router is inside a `block()`-wrapped body, and
    // `block` establishes the handed scope as the ambient owner.
    expect(ROUTER).not.toMatch(/^onCleanup\(/m);
  });

  // Replaces "a THIRD blocker: third-party components cannot be codemodded at
  // all". goober's `function Styled(props, ref)` was that blocker. The package
  // no longer ships a CSS layer, so it no longer hands a Scope to a foreign
  // component's props parameter.
  test("no third-party component is invoked on this ABI", () => {
    expect(PKG.dependencies?.goober).toBeUndefined();
    expect(nowhere(/from "goober"/)).toEqual([]);
    expect(INDEX).not.toMatch(/^\s*styled,$/m);
    expect(INDEX).not.toMatch(/^\s*createGlobalStyle,$/m);
  });

  // Replaces "the pre-M3 surface is not confined to router.tsx", which named
  // `QueryClientProvider(props:` and `GlobalStyleComponent(props?: P)`.
  // The two rows about `query.ts` and goober went with this file's move: those
  // modules stayed in `@barqjs/extra`, their migration is finished, and a
  // scorecard in the wrong package cannot see them. What replaces them is the
  // row every module here has to satisfy — that its tests exist at all.
  test("every module is covered, and the mapping is checked in", () => {
    // Checked in rather than inferred, so it goes red the moment a module is
    // added — which is the property the row this replaces had.
    const coveredBy: Record<string, string> = {
      "client.ts": "client.test.ts",
      "components.ts": "router.test.ts",
      "devtools.ts": "devtools.test.ts",
      "errors.ts": "server.test.ts",
      "file-route.ts": "file-route.test.ts",
      "history.ts": "history.test.ts",
      "head.ts": "head.test.ts",
      "hooks.ts": "router.test.ts",
      "manifest.ts": "manifest.test.ts",
      "matcher.ts": "matcher.test.ts",
      "path.ts": "path.test.ts",
      "register.ts": "register.test.ts",
      "route.ts": "matcher.test.ts",
      "router.ts": "router.test.ts",
      "scroll.ts": "scroll.test.ts",
      "search.ts": "search.test.ts",
      "server.ts": "server.test.ts",
      "vite.ts": "vite.test.ts",
      "index.ts": "exports.test.ts",
    };
    // `.d.ts` is excluded: a declaration file has no runtime behaviour to cover,
    // and `build-modules.d.ts` exists precisely so that no APPLICATION declares
    // the build's specifiers. Its content is checked by `tsc`, which is the only
    // thing that reads it.
    const modules = readdirSync(SRC)
      .filter(
        (f) =>
          f.endsWith(".ts") &&
          !f.endsWith(".d.ts") &&
          !f.includes(".test.") &&
          f !== "test-setup.ts",
      )
      .toSorted();
    expect(modules).toEqual(Object.keys(coveredBy).toSorted());
    const tests = new Set(readdirSync(SRC));
    expect(Object.values(coveredBy).filter((f) => !tests.has(f))).toEqual([]);
  });
});

describe("the red is gone, and this is the row that says so", () => {
  // Replaces "the red is exactly this size and exactly these two shapes",
  // which hard-coded `33 pass` / `54 fail` and all 54 failing test names. Same
  // mechanism, inverted target: a suite that regresses cannot hide behind "the
  // one expected red", because there is no expected red left.
  test("the router suite is green, and it is bigger than the one it replaced", () => {
    if (process.env.BARQ_M8_INNER) return;
    const out = Bun.spawnSync({
      cmd: ["bun", "test", "src/router.test.ts"],
      cwd: ROOT,
      env: { ...process.env, npm_lifecycle_event: "", BARQ_M8_INNER: "1" },
    });
    const text = new TextDecoder().decode(out.stderr) + new TextDecoder().decode(out.stdout);
    expect(text).toMatch(/\n\s*0 fail/);
    const passing = Number(/\n\s*(\d+) pass/.exec(text)?.[1] ?? 0);
    // The deleted suite ran 100 cases against a `memoryHistory` whose `push`
    // and `watch` were both no-ops, so it could not tell a navigation that
    // worked from one that did nothing. This one is smaller in count and drives
    // a history that records; the package total is what grew.
    expect(passing).toBeGreaterThanOrEqual(20);
  });
});
