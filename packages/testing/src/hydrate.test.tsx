/**
 * The helper has to distinguish a page that was CLAIMED from one that was
 * rebuilt, and those two produce identical markup. So every assertion here is
 * about node identity or about the walk's own report, and never about HTML.
 */

import { describe, expect, test } from "bun:test";

import { html as ssrHtml } from "@barqjs/server";
import { For, flush, createSignal, onCleanup, template } from "@barqjs/core";

import { renderAndHydrate } from "./hydrate.ts";
import { cleanup } from "./pure.ts";

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

/**
 * The list a server wrote, added to on the client.
 *
 * A hydrated row ADOPTS the server's nodes rather than creating any, so it used
 * to report an empty extent, and a row with no extent is one the reconciler
 * cannot insert beside: it looks for the first node of the row below, finds
 * none the whole way down, and falls back on the list's own end. Everything
 * added to a hydrated list therefore appeared at the bottom of it, wherever the
 * array said it belonged. Nothing about the array was wrong, which is what made
 * it hard to see.
 */
describe("a keyed list that the server wrote", () => {
  interface Row {
    readonly id: string;
  }

  const order = (container: HTMLElement): string =>
    [...container.querySelectorAll("[data-k]")]
      .map((node) => node.getAttribute("data-k"))
      .join(",");

  const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));

  test("takes a new row where the array puts it, not at the end", () => {
    const [list, setList] = createSignal<Row[]>(rows("a", "b", "c"));
    const result = renderAndHydrate({
      server: () =>
        ssrHtml(
          '<ul><!--[--><li data-k="a">a</li><li data-k="b">b</li><li data-k="c">c</li><!--]--></ul>',
        ),
      client: () => (
        <ul>
          <For each={() => list()} keyed={(row: Row) => row.id}>
            {(row: () => Row) => <li data-k={row().id}>{() => row().id}</li>}
          </For>
        </ul>
      ),
    });

    expect(result.recovered).toBe(false);
    expect(order(result.container)).toBe("a,b,c");

    setList(rows("a", "g", "b", "c"));
    flush();
    expect(order(result.container)).toBe("a,g,b,c");

    result.unmount();
  });

  test("reorders rows it adopted, which needs their extent as much", () => {
    const [list, setList] = createSignal<Row[]>(rows("a", "b", "c"));
    const result = renderAndHydrate({
      server: () =>
        ssrHtml(
          '<ul><!--[--><li data-k="a">a</li><li data-k="b">b</li><li data-k="c">c</li><!--]--></ul>',
        ),
      client: () => (
        <ul>
          <For each={() => list()} keyed={(row: Row) => row.id}>
            {(row: () => Row) => <li data-k={row().id}>{() => row().id}</li>}
          </For>
        </ul>
      ),
    });

    setList(rows("c", "a", "b"));
    flush();
    expect(order(result.container)).toBe("c,a,b");

    result.unmount();
  });
});

/**
 * A hydrated tree owns what a rendered one owns: document listeners, portalled
 * nodes, an overlay's place on the stack. Removing the container alone leaves
 * all of it behind for whatever test runs next.
 */
describe("unmounting a hydrated tree", () => {
  const boldTemplate = template("<b>hi</b>");

  function hydrateWithSideEffects(log: string[]): ReturnType<typeof renderAndHydrate> {
    return renderAndHydrate({
      server: () => ssrHtml("<b>hi</b>"),
      client: () => {
        const portalled = document.body.appendChild(document.createElement("aside"));
        portalled.setAttribute("data-portalled", "");
        const onPress = (): void => {
          log.push("press");
        };
        document.addEventListener("pointerdown", onPress, true);
        onCleanup(() => {
          log.push("cleanup");
          portalled.remove();
          document.removeEventListener("pointerdown", onPress, true);
        });
        return boldTemplate();
      },
    });
  }

  test("`unmount` disposes the root: cleanups run and what they own goes", () => {
    const log: string[] = [];
    const result = hydrateWithSideEffects(log);
    expect(result.recovered).toBe(false);
    expect(document.querySelectorAll("[data-portalled]").length).toBe(1);

    result.unmount();

    expect(log).toEqual(["cleanup"]);
    expect(document.querySelectorAll("[data-portalled]").length).toBe(0);
    expect(result.container.isConnected).toBe(false);

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(log).toEqual(["cleanup"]);
  });

  test("`unmount` twice disposes once", () => {
    const log: string[] = [];
    const result = hydrateWithSideEffects(log);
    result.unmount();
    result.unmount();
    expect(log).toEqual(["cleanup"]);
  });

  test("`cleanup` disposes a hydrated tree a test left mounted", () => {
    const log: string[] = [];
    const result = hydrateWithSideEffects(log);

    cleanup();

    expect(log).toEqual(["cleanup"]);
    expect(document.querySelectorAll("[data-portalled]").length).toBe(0);
    expect(result.container.isConnected).toBe(false);

    result.unmount();
    expect(log).toEqual(["cleanup"]);
  });
});
