import { describe, expect, test } from "bun:test";

import { compileText, host, wire } from "./hydration.ts";

/**
 * The server writes `innerHTML` as the bytes it was given, and the browser
 * hands back its own serialisation of what it parsed. The two differ whenever
 * the author's markup is not already in the browser's canonical form, and that
 * difference is not a mismatch: the parsed nodes are the ones the write would
 * have produced.
 */
const SHAPES: Record<string, string> = {
  "self-closing tags inside an svg": `<path d="M0 0L10 10"/><circle cx="5" cy="5" r="2"/>`,
  "unquoted attributes and a void element": `<span class=note>a<br>b</span>`,
  "an entity the browser writes another way": `<p>&#39;quoted&#39; &amp; more</p>`,
};

describe("innerHTML the browser serialises differently", () => {
  let index = 0;
  for (const [name, markup] of Object.entries(SHAPES)) {
    const tag = `inner-html-${index++}`;
    const svg = name.includes("svg");

    test(`${name}: keeps the server's nodes`, async () => {
      const core = await import("@barqjs/core");
      const source = svg
        ? `export const MARKUP = ${JSON.stringify(markup)};
export default function Page() { return <main><svg viewBox="0 0 10 10" innerHTML={MARKUP} /></main>; }`
        : `export const MARKUP = ${JSON.stringify(markup)};
export default function Page() { return <main><div innerHTML={MARKUP} /></main>; }`;
      const compiled = await compileText(source, tag);
      const page = host(wire(compiled.ssr));
      const holder = page.querySelector(svg ? "svg" : "main > div") as Element;
      expect(holder.innerHTML).not.toBe(markup);
      const served = [...holder.childNodes];
      const stop = core.hydrate(compiled.dom.default as never, page);
      core.flush();
      try {
        expect(core.hydrate.report.mismatches).toEqual([]);
        expect(core.hydrate.report.recovered).toBe(false);
        const kept = [...holder.childNodes];
        expect(kept.length).toBe(served.length);
        expect(kept.every((node, at) => node === served[at])).toBe(true);
        expect(holder.isConnected).toBe(true);
      } finally {
        stop();
        page.remove();
      }
    });
  }

  test("different markup is still written", async () => {
    const core = await import("@barqjs/core");
    const compiled = await compileText(
      `import { createSignal } from "@barqjs/core";
export const [markup, setMarkup] = createSignal("<b>server</b>");
export default function Page() { return <main><div innerHTML={markup()} /></main>; }`,
      "inner-html-differs",
    );
    const page = host(wire(compiled.ssr));
    (compiled.dom as unknown as { setMarkup: (value: string) => void }).setMarkup("<i>client</i>");
    core.flush();
    const stop = core.hydrate(compiled.dom.default as never, page);
    core.flush();
    try {
      expect(page.querySelector("main > div")?.innerHTML).toBe("<i>client</i>");
    } finally {
      stop();
      page.remove();
    }
  });
});
