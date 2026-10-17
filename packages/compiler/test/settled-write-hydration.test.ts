import { describe, expect, test } from "bun:test";

import { compileText, host, wire } from "./hydration.ts";

/**
 * The server runs no effects, so whatever an effect writes is a change the
 * browser makes after the page it was sent, built the way any later change is.
 */
const SHAPES: Record<string, string> = {
  "onSettled shows a condition": `
import { Show, createSignal, onSettled } from "@barqjs/core";
export default function Page() {
  const [on, setOn] = createSignal(false);
  onSettled(() => {
    setOn(true);
  });
  return <div><Show when={on()}><span>shown</span></Show><p>after</p></div>;
}`,
  "createEffect shows a condition": `
import { Show, createSignal, createEffect } from "@barqjs/core";
export default function Page() {
  const [on, setOn] = createSignal(false);
  createEffect(
    () => 0,
    () => {
      setOn(true);
    },
  );
  return <div><Show when={on()}><span>shown</span></Show><p>after</p></div>;
}`,
  "onSettled hides a condition": `
import { Show, createSignal, onSettled } from "@barqjs/core";
export default function Page() {
  const [on, setOn] = createSignal(true);
  onSettled(() => {
    setOn(false);
  });
  return <div><Show when={on()}><span>shown</span></Show><p>after</p></div>;
}`,
};

describe("a write from an effect while the page hydrates", () => {
  let index = 0;
  for (const [name, source] of Object.entries(SHAPES)) {
    const tag = `settled-write-${index++}`;

    test(`${name}: claims the server's page, then applies the write`, async () => {
      const core = await import("@barqjs/core");
      const web = await import("@barqjs/web");
      const compiled = await compileText(source, tag);
      const page = host(wire(compiled.ssr));
      const after = page.querySelector("p");
      const stop = web.hydrate(compiled.dom.default as never, page);
      core.flush();
      try {
        expect(web.hydrate.report.mismatches).toEqual([]);
        expect(web.hydrate.report.recovered).toBe(false);
        expect(page.querySelector("p")).toBe(after);
        const shown = name.includes("hides") ? 0 : 1;
        expect(page.querySelectorAll("span").length).toBe(shown);
      } finally {
        stop();
        page.remove();
      }
    });
  }
});

describe("a condition the server showed and the browser does not", () => {
  test("removes the server's arm, reports it, and builds the next arm cold", async () => {
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const compiled = await compileText(
      `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
export default function Page() {
  return <div><Show when={on()}><span>shown</span></Show><p>after</p></div>;
}`,
      "settled-write-diverged",
    );
    const page = host(wire(compiled.ssr));
    const dom = compiled.dom as unknown as { setOn: (value: boolean) => void };
    dom.setOn(false);
    core.flush();
    const stop = web.hydrate(compiled.dom.default as never, page);
    core.flush();
    try {
      expect(web.hydrate.report.recovered).toBe(false);
      expect(web.hydrate.report.mismatches.length).toBe(1);
      expect(page.querySelectorAll("span").length).toBe(0);
      dom.setOn(true);
      core.flush();
      expect(page.querySelectorAll("span").length).toBe(1);
      expect(page.querySelector("div")?.lastElementChild?.tagName).toBe("P");
    } finally {
      stop();
      page.remove();
    }
  });
});
