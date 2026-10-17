import { createSignal, flush, Show } from "@barqjs/core";
import { render } from "@barqjs/web";
import { renderToString } from "@barqjs/server";
import { describe, expect, test } from "bun:test";

import { ClientOnly, useHydrated } from "./index.ts";

/**
 * `<ClientOnly>` and `useHydrated` are about the render that has to match the
 * server's. Every render after it, and a render with no server markup at all,
 * has nothing to match, so it shows the children from the start.
 */
describe("useHydrated", () => {
  test("is false while a server render runs", () => {
    const seen: boolean[] = [];
    function Probe() {
      const hydrated = useHydrated();
      seen.push(hydrated());
      return <p>{hydrated() ? "live" : "server"}</p>;
    }
    expect(renderToString(() => <Probe />)).toContain("server");
    expect(seen).toEqual([false]);
  });

  test("is true from the first read in a render with no server markup", () => {
    const first: boolean[] = [];
    function Probe() {
      const hydrated = useHydrated();
      first.push(hydrated());
      return <p>{hydrated() ? "live" : "waiting"}</p>;
    }
    const host = document.createElement("div");
    const stop = render(() => <Probe />, host);
    expect(first).toEqual([true]);
    expect(host.textContent).toBe("live");
    stop();
  });
});

describe("ClientOnly mounted after the page is live", () => {
  test("shows its children on the first render, never the fallback", () => {
    const [open, setOpen] = createSignal(false);
    const host = document.createElement("div");
    const stop = render(
      () => (
        <Show when={open()}>
          <ClientOnly fallback={<p>skeleton</p>}>
            <p>the chart</p>
          </ClientOnly>
        </Show>
      ),
      host,
    );
    const observer = new MutationObserver(() => {});
    observer.observe(host, { subtree: true, childList: true });
    setOpen(true);
    flush();
    expect(host.textContent).toBe("the chart");
    const added = observer.takeRecords().flatMap((record) => [...record.addedNodes]);
    observer.disconnect();
    expect(added.some((node) => node.textContent?.includes("skeleton"))).toBe(false);
    stop();
  });
});
