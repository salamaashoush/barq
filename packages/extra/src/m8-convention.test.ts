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
 * The nine workarounds `CODESIGN.md` §8 enumerates are DELETIONS, and this file
 * is where "deleted" is checkable rather than claimed: each is a string that
 * used to be in `router.tsx` and is in no source file now, beside the primitive
 * that took its job.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const ROUTER = readFileSync(join(SRC, "router.ts"), "utf8");
const QUERY = readFileSync(join(SRC, "query.ts"), "utf8");
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
    const arrows = [...ROUTER.matchAll(/\(\)\s*=>/g)].length;
    expect(arrows).toBeLessThan(45);
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
    const MAIN = readFileSync(join(ROOT, "..", "kitchen-sink", "src", "main.tsx"), "utf8");
    expect(MAIN).toContain("<QueryClientProvider client={queryClient}>");
  });

  // #3 — 14 uses of createMarkerPair / clearRange / insertNodes / childToNodes.
  // Replaced by: `branch` owns its range.
  test("3. no hand-rolled range management anywhere in the package", () => {
    expect(nowhere(/createMarkerPair|clearRange|insertNodes|childToNodes/)).toEqual([]);
    expect(ROUTER).toContain("branch(scope, parent, anchor, key, body)");
  });

  // #4 — `route === prevRoute && data === prevData && error === prevError`.
  // Replaced by: the `key` argument of `branch`.
  test("4. the memo is the branch key, and data is not in it", () => {
    expect(nowhere(/prevRoute|prevData|prevError/)).toEqual([]);
    expect(ROUTER).toContain("const key = (): unknown => errorAt() ?? routeAt();");
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
    expect(ROUTER).toContain("const matched = computed(() => matchRoutes(location().pathname");
    expect(ROUTER).not.toMatch(/setMatchedRoutes|effect\(renderRoute\)/);
  });

  // #7 — `OutletLevelContext` depth threading, written at three sites and read
  // at two. Replaced by: slot parameters — `children` is a Block taking a scope.
  test("7. there is no outlet and no depth context", () => {
    expect(nowhere(/OutletLevelContext/)).toEqual([]);
    expect(INDEX).not.toMatch(/^\s*Outlet,$/m);
    expect(ROUTER).toContain("children: block(");
  });

  // #8 — `return computed(…) as unknown as JSXElement` in `Loading`. Replaced by:
  // `Out` admits a Cell, so the cast has nothing to convert — and `Loading`
  // itself was reached by nobody and is gone.
  test("8. no component casts a memo into an element", () => {
    expect(nowhere(/as unknown as JSXElement/)).toEqual([]);
    expect(INDEX).not.toMatch(/^\s*Loading,$/m);
  });

  // #9 — `Link` read `state.location()` at CONSTRUCTION, so a relative href
  // never re-resolved. `router.test.tsx` pins the behaviour by navigating; this
  // pins the SHAPE, because the behavioural test only sees it where the Link
  // survives the location change.
  test("9. both link components resolve their href inside the computation", () => {
    // No `const currentLocation = state.location()` above a memo that then
    // closes over the snapshot.
    expect(ROUTER).not.toMatch(/const currentLocation = state\.location\(\)/);
    // Both components resolve the same way, inside a `computed`, reading the
    // location at the point of resolution.
    const resolutions = [
      ...ROUTER.matchAll(
        /const href = computed\(\(\) =>\s*\n?\s*resolvePath\(readSlot\(props\.href, "(?:Nav)?Link\.href"\) as string, state\.location\(\)\.pathname\),\s*\n?\s*\);/g,
      ),
    ];
    expect(resolutions).toHaveLength(2);
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
    expect(ROUTER).toContain("navigate: go,");
  });

  // The entry URL ran the guard pipeline only when some route in the matched
  // chain happened to declare a loader, so a deep link into a guarded route
  // rendered it. The loader check decides whether to LOAD, never whether the
  // pipeline runs.
  test("the entry navigation is not gated on a loader existing", () => {
    expect(ROUTER).not.toMatch(/openingChain\.some\(\(route\) => route\.loader\)/);
    expect(ROUTER).toContain("void go(opening.pathname + opening.search + opening.hash");
  });

  // `setTimeout(…, 0)` for ORDERING — a guess that the DOM has been written by
  // the time the macrotask runs. `flush()` is the capability it stood in for.
  test("nothing waits on a macrotask to observe the DOM", () => {
    expect(ROUTER).not.toMatch(/setTimeout\([^,]*,\s*0\)/);
    expect(ROUTER).toContain("flush();");
  });

  // `reset` was invoked, reset nothing, and re-threw. `router.test.tsx` pins the
  // behaviour by clicking it; this pins that a retry exists at all.
  test("the error arm can actually retry", () => {
    expect(ROUTER).toContain("async function reload()");
    expect(ROUTER).toContain("void state.reload();");
  });

  // A guard redirecting to a path its own predicate also rejects recursed
  // without bound and hung the process.
  test("redirects are bounded", () => {
    expect(ROUTER).toContain("MAX_REDIRECTS");
    expect(ROUTER).toMatch(/hops \+ 1/);
  });
});

describe("the four bugs the review did not name", () => {
  // #10 — the child pathname was sliced by the PATTERN's length.
  test("10. the prefix split consumes what matched, not what was written", () => {
    expect(ROUTER).not.toMatch(/pathname\.slice\(route\.path\.length\)/);
    expect(ROUTER).toContain('const rest = matched["*"] ?? "";');
  });

  // #11 — a bogus `"*"` param leaked into every nested match.
  test("11. the layout prefix pattern's catch-all is deleted before publishing", () => {
    expect(ROUTER).toContain('delete params["*"];');
  });

  // #12 — the outlet memo omitted `params`, so a same-route param change
  // rendered nothing.
  test("12. params flow as a Cell rather than through the key", () => {
    expect(ROUTER).toContain("params: () => state.params()");
  });

  // #13 — `startsWith` with no segment boundary.
  test("13. NavLink's prefix match has a segment boundary", () => {
    expect(ROUTER).toContain("function isUnder(pathname: string, prefix: string): boolean");
    expect(ROUTER).not.toMatch(/loc\.pathname\.startsWith\(href\)/);
  });
});

describe("the convention, from the other side", () => {
  // Replaces "router.tsx is still authored on the pre-M3 convention", which
  // enumerated seven `(props)` declarations.
  test("every component this package exports takes its scope first", async () => {
    const core = (await import("@barqjs/core")) as { isBlock(v: unknown): boolean };
    const router = await import("./router.ts");
    const query = await import("./query.ts");

    const components = {
      Link: router.Link,
      NavLink: router.NavLink,
      Redirect: router.Redirect,
      Router: router.Router,
      MemoryRouter: router.MemoryRouter,
      QueryClientProvider: query.QueryClientProvider,
    };

    for (const [name, value] of Object.entries(components)) {
      expect(typeof value, name).toBe("function");
      // C1 plus §3.0 rule 3: branded, so a Block reaching a Cell slot throws
      // rather than being stringified, and invoking one with no scope names the
      // Block instead of failing downstream.
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
    expect(ROUTER).toContain("(route.component as unknown as Invoked)(contentScope,");
    expect(ROUTER).toContain("(fallback as unknown as Invoked)(instance,");
    expect(ROUTER).toContain("recover(fallbackScope, {");
    const TEST = readFileSync(join(SRC, "router.test.tsx"), "utf8");
    expect(TEST).toContain("props: { data: Cell<{ message?: string } | undefined> }");
    expect(TEST).toContain("props.data()?.message");
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
    expect(QUERY).toContain("provide(scope as Scope, QueryClientContext, cell(client),");
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
  test("the two untested public components are migrated and now tested", () => {
    expect(QUERY).not.toMatch(/export function QueryClientProvider\(\s*props:/);
    expect(nowhere(/GlobalStyleComponent/)).toEqual([]);
    const tests = readdirSync(SRC).filter((f) => f.includes(".test."));
    expect(tests).toContain("query.test.tsx");
    expect(tests).toContain("hooks.test.ts");
  });
});

describe("the red is gone, and this is the row that says so", () => {
  // Replaces "the red is exactly this size and exactly these two shapes",
  // which hard-coded `33 pass` / `54 fail` and all 54 failing test names. Same
  // mechanism, inverted target: a suite that regresses cannot hide behind "the
  // one expected red", because there is no expected red left.
  test("router.test.tsx is green, and it is bigger than it was", () => {
    if (process.env.BARQ_M8_INNER) return;
    const out = Bun.spawnSync({
      cmd: ["bun", "test", "src/router.test.tsx"],
      cwd: ROOT,
      env: { ...process.env, npm_lifecycle_event: "", BARQ_M8_INNER: "1" },
    });
    const text = new TextDecoder().decode(out.stderr) + new TextDecoder().decode(out.stdout);
    expect(text).toMatch(/\n\s*0 fail/);
    const passing = Number(/\n\s*(\d+) pass/.exec(text)?.[1] ?? 0);
    // 87 before the redesign, plus the four bug pins this milestone added.
    expect(passing).toBeGreaterThanOrEqual(91);
  });
});
