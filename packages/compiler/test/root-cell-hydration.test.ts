import { describe, expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";

/**
 * A root whose value is a Cell. The server writes a root's value straight into
 * the container, so the hole the client makes of it has no comments to claim
 * and takes the container's children instead. A component handed out through
 * `hot` is the case every development page hits: its result is always a Cell.
 */
const SOURCE = `
import { createSignal } from "@barqjs/core";
export const [count, setCount] = createSignal(1);
export default function Page() { return <main><h1>orders</h1><p>{count()}</p></main>; }
export function Edited() { return <main><h1>invoices</h1><p>{count()}</p></main>; }
`;

async function served(tag: string) {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const server = await import("@barqjs/server");
  const compiled = await compileText(SOURCE, tag);
  const rendered = await server.renderPage((() =>
    (compiled.ssr.default as unknown as () => unknown)()) as never);
  const page = host(rendered.html);
  core.resetChildIds();
  return {
    core,
    web,
    page,
    module: compiled.dom as unknown as {
      default: () => unknown;
      Edited: () => unknown;
      setCount: (next: number) => void;
    },
  };
}

describe("a root that is a Cell", () => {
  test("claims the server's markup instead of discarding it", async () => {
    const { core, web, page, module } = await served("root-cell-plain");
    const heading = page.querySelector("h1");
    const dispose = web.hydrate((() => () => module.default()) as never, page);
    core.flush();
    try {
      expect(web.hydrate.report.mismatches).toEqual([]);
      expect(web.hydrate.report.recovered).toBe(false);
      expect(page.querySelector("h1")).toBe(heading);
      module.setCount(2);
      core.flush();
      expect(page.querySelector("p")?.textContent).toBe("2");
    } finally {
      module.setCount(1);
      dispose();
      page.remove();
    }
  });

  test("a component handed out through hot hydrates, and is still replaced in place afterwards", async () => {
    const { core, web, page, module } = await served("root-cell-hot");
    const { hot } = await import("@barqjs/core/hot");
    const context = { data: {} };
    const heading = page.querySelector("h1");
    const Page = hot(context, "Page", module.default, "one");
    const dispose = web.hydrate((() => Page()) as never, page);
    core.flush();
    try {
      expect(web.hydrate.report.recovered).toBe(false);
      expect(page.querySelector("h1")).toBe(heading);
      hot(context, "Page", module.Edited, "two");
      expect(page.querySelector("h1")?.textContent).toBe("invoices");
      expect(page.querySelectorAll("main")).toHaveLength(1);
    } finally {
      dispose();
      page.remove();
    }
  });
});
