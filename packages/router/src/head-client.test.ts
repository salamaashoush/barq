/**
 * The client's copy of the framework's inline sheet.
 *
 * `<HeadContent />` claims the server's `<style id="barq-css">` with the text
 * it is given. A module evaluated after the router was imported (a route chunk
 * whose compiled CSS registers in dev) has already painted its rules into that
 * element by the time the head hydrates, and claiming it with the import-time
 * text wrote those rules back out: a scene label in packages/three-demo
 * rendered unstyled with its class in the markup.
 */

import { afterEach, expect, spyOn, test } from "bun:test";
import { createRoot, flush } from "@barqjs/core";

import { clientHeadAssets } from "./components.ts";
import { memoryHistory } from "./history.ts";
import { type RouterState, createRouter } from "./router.ts";

const state = {
  match: () => undefined,
  chain: () => [],
  location: () => ({ pathname: "/" }),
  contexts: () => ({}),
} as unknown as RouterState;

afterEach(() => {
  document.getElementById("barq-css")?.remove();
});

test("is the text the document holds when the head renders, not when the router loaded", () => {
  const style = document.createElement("style");
  style.id = "barq-css";
  style.textContent = ".page_a1{display:grid}";
  document.head.append(style);
  createRoot((dispose) => {
    const assets = clientHeadAssets(state);
    style.textContent += ".label_b2{color:red}";
    expect(assets.inlineCss).toBe(".page_a1{display:grid}.label_b2{color:red}");
    dispose();
  });
});

test("an explicit sheet still wins over the document's", () => {
  const style = document.createElement("style");
  style.id = "barq-css";
  style.textContent = ".page_a1{display:grid}";
  document.head.append(style);
  createRoot((dispose) => {
    expect(clientHeadAssets(state, { inlineCss: ".given{color:blue}" }).inlineCss).toBe(
      ".given{color:blue}",
    );
    dispose();
  });
});

/**
 * The head follows a navigation, and reads the match where it subscribes to it.
 * Read in the effect's apply half instead, every client navigation logged two
 * STRICT_READ_UNTRACKED warnings under the development build.
 */
test("a navigation resolves the next route's head without an untracked read", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const router = createRouter({
    routeTree: [
      { path: "/", component: () => null, head: { meta: [{ title: "Orrery" }] } },
      { path: "/catalogue", component: () => null, head: { meta: [{ title: "Catalogue" }] } },
    ],
    history: memoryHistory({ initial: ["/"] }),
  });
  try {
    await router.navigate({ to: "/" });
    let assets: ReturnType<typeof clientHeadAssets> | undefined;
    const dispose = createRoot((disposeRoot) => {
      assets = clientHeadAssets(router);
      return disposeRoot;
    });
    flush();
    await router.navigate({ to: "/catalogue" });
    flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
    expect(assets!.matches.flatMap((match) => match.meta ?? [])).toContainEqual({
      title: "Catalogue",
    });
    const untracked = warn.mock.calls.filter((call) =>
      String(call[0]).includes("STRICT_READ_UNTRACKED"),
    );
    expect(untracked).toEqual([]);
    dispose();
  } finally {
    router.dispose();
    warn.mockRestore();
  }
});
