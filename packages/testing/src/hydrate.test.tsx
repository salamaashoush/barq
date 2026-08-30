/**
 * The helper has to distinguish a page that was CLAIMED from one that was
 * rebuilt, and those two produce identical markup. So every assertion here is
 * about node identity or about the walk's own report, and never about HTML.
 */

import { describe, expect, test } from "bun:test";

import { html as ssrHtml } from "@barqjs/server";
import { template } from "@barqjs/core";

import { renderAndHydrate } from "./hydrate.ts";

describe("renderAndHydrate", () => {
  test("a page the server wrote is CLAIMED, and its nodes are the same objects", () => {
    const boldTemplate = template("<b>hi</b>");
    const result = renderAndHydrate({
      server: () => ssrHtml("<b>hi</b>"),
      client: () => boldTemplate(),
    });

    const bold = result.container.querySelector("b");
    expect(bold?.textContent).toBe("hi");
    expect(result.recovered).toBe(false);
    expect(result.mismatches).toEqual([]);
    // Non-zero, so this cannot pass by the walk having done NOTHING — which
    // would also leave every server node in place.
    expect(result.claimed).toBeGreaterThan(0);
    // THE ASSERTION THAT MATTERS. A rebuild produces byte-identical markup, so
    // only identity tells the two apart.
    expect(result.kept).toBe(result.total);
    expect(result.reuse).toBe(1);
    result.unmount();
  });

  /**
   * The failure mode the `kept` count exists for.
   *
   * Replacing the container's content produces exactly the markup the server
   * sent and keeps none of its nodes. An HTML comparison passes; `reuse` does
   * not.
   */
  test("a client half that REBUILDS keeps nothing, even though the markup matches", () => {
    const result = renderAndHydrate({
      server: () => ssrHtml("<b>hi</b>"),
      client: (_scope: unknown) => {
        // Not a claim: a fresh node, which is what a cold `lazy()` boundary
        // does after it parks and re-enters.
        const fresh = document.createElement("b");
        fresh.textContent = "hi";
        return fresh;
      },
    });

    // Byte-identical to the claiming case above, which is the whole trap.
    expect(result.container.innerHTML).toBe("<b>hi</b>");
    expect(result.kept).toBe(0);
    expect(result.reuse).toBe(0);
    // And the walk says so, in the report a test can assert on.
    expect(result.claimed).toBe(0);
    expect(result.mismatches.map((one) => one.kind)).toEqual(["not-hydratable"]);
    result.unmount();
  });

  test("`total` counts what the SERVER wrote, not what is there afterwards", () => {
    const result = renderAndHydrate({
      server: () => ssrHtml("<div><span>a</span><span>b</span></div>"),
      client: (_scope: unknown) => document.createElement("p"),
    });
    // Three elements went in; the baseline is taken before the walk, so a walk
    // that removed all of them still reports three.
    expect(result.total).toBe(3);
    expect(result.kept).toBe(0);
    result.unmount();
  });

  test("the markup is available before the walk touched it", () => {
    const result = renderAndHydrate({
      server: () => ssrHtml("<b>hi</b>"),
      client: (_scope: unknown) => document.createElement("i"),
    });
    expect(result.html).toBe("<b>hi</b>");
    result.unmount();
  });
});
