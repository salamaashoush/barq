/**
 * THE CONSUMER DECISION, registered.
 *
 * `CODESIGN.md` §8 schedules `packages/extra` and `packages/kitchen-sink` for
 * **M8**, on a single branch, with no compat shim. M3 changed the calling
 * convention, so from M3 until M8 this package's own suite is RED — 54 of its
 * 87 router tests, all 54 through `MemoryRouter`, in two shapes that differ
 * only by whether an owner was ambient at the JSX-argument site:
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
 * (`packages/core/src/dom.ts:339`) invokes ANY function tag as
 * `tag(getOwner(), finalProps)`, so the eager path Bun's transform emits
 * already passes a scope first, and a consumer-side `(props)` → `(_s$, props)`
 * would receive props today. The last two assertions below prove both halves.
 *
 * The blocker is one level up, in what that scope IS and in the props
 * SEMANTICS.
 *
 * The scope `createElement` passes is the AMBIENT owner at the instant the JSX
 * argument is evaluated, not the parent's scope at the point the parent renders
 * the child — because the un-compiled path builds children eagerly as
 * arguments. That is `null` at a bare `render(…)` and the enclosing scope under
 * `createScope`, which is exactly why 53 failures read `props.initialPath` and
 * the 54th reads `config.base`. Migrating only the signatures would make the
 * router RUN while its context reads resolve against whatever owner happened to
 * be current — the Provider defect M3 exists to remove, now invisible behind a
 * green suite.
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

const MILESTONE = "M8";

describe(`the M3 calling convention: this package is scheduled for ${MILESTONE}`, () => {
  test("router.tsx is still authored on the pre-M3 convention", () => {
    // A component declared `(props: …)` — the props in the position the scope
    // now occupies. When M8 migrates them this assertion goes red, which is
    // what stops the row outliving the defect.
    const preM3 = [...ROUTER.matchAll(/function ([A-Z][\w$]*)\(\s*props\b/g)].map((m) => m[1]);
    expect(preM3.length).toBeGreaterThan(0);
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
