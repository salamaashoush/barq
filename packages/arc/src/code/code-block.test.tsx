import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";

import { CodeBlock, Highlight } from "./code-block.tsx";
import { highlightHtml } from "./highlight.ts";
import { loadLanguage } from "./languages.ts";

const written: string[] = [];
const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  written.length = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string): Promise<void> => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(navigator, "clipboard");
  else Object.defineProperty(navigator, "clipboard", original);
});

async function highlighted(container: Element): Promise<void> {
  await waitFor(() => {
    flush();
    if (container.querySelector("[class^=tok-]") === null) throw new Error("Not highlighted yet.");
  });
}

describe("highlightHtml", () => {
  test("escapes the text and keeps a comment's colour on each of its lines", async () => {
    const support = await loadLanguage("javascript");
    const html = highlightHtml("/* a\n<b> */ x < 1 && y", support);
    expect(html).toBe(
      '<span data-line><span class="tok-comment">/* a</span></span>\n' +
        '<span data-line><span class="tok-comment">&lt;b&gt; */</span> x ' +
        '<span class="tok-punctuation">&lt;</span> <span class="tok-number">1</span> ' +
        '<span class="tok-punctuation">&amp;&amp;</span> y</span>',
    );
  });

  test("without a language, the lines are plain", () => {
    expect(highlightHtml("a\n\n<b>")).toBe(
      "<span data-line>a</span>\n<span data-line></span>\n<span data-line>&lt;b&gt;</span>",
    );
  });
});

describe("Highlight", () => {
  test("shows the code plain, then highlighted once the language is here", async () => {
    const { container } = render(() => <Highlight code={'print("hi")'} language="python" />);
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toBe('print("hi")');
    await highlighted(container);
    expect(container.querySelector(".tok-string")?.textContent).toBe('"hi"');
    expect(container.querySelector("pre")?.textContent).toBe('print("hi")');
  });

  test("a language already loaded highlights on the first render", async () => {
    await loadLanguage("css");
    const { container } = render(() => <Highlight code="a { color: red }" language="css" />);
    expect(container.querySelector(".tok-property")?.textContent).toBe("color");
  });

  test("follows its code", async () => {
    await loadLanguage("json");
    const [code, setCode] = createSignal('{"a": 1}');
    const { container } = render(() => <Highlight code={code()} language="json" lineNumbers />);
    expect(container.querySelectorAll("[data-line]").length).toBe(1);
    setCode('{\n  "a": 1,\n  "b": true\n}');
    flush();
    expect(container.querySelectorAll("[data-line]").length).toBe(4);
    expect(container.querySelector(".tok-number + .tok-punctuation")).not.toBeNull();
    expect(container.querySelector("pre")?.hasAttribute("data-numbered")).toBe(true);
  });

  test("an unknown language is plain text, not an error", async () => {
    const { container } = render(() => <Highlight code="x := 1" language="cobol" />);
    await tick();
    flush();
    expect(container.querySelector("pre")?.textContent).toBe("x := 1");
    expect(container.querySelector("[class^=tok-]")).toBeNull();
  });
});

describe("CodeBlock", () => {
  test("names itself by its file, copies its code, and numbers its lines in CSS", async () => {
    const code = 'export default {\n  name: "acme",\n};';
    const { container } = render(() => (
      <CodeBlock filename="config.ts" language="typescript" code={code} lineNumbers />
    ));
    await highlighted(container);
    const figure = screen.getByRole("figure", { name: "config.ts" });
    expect(figure.getAttribute("data-slot")).toBe("code-block");
    const pre = figure.querySelector("pre");
    // The numbers are generated content: the text is the code alone.
    expect(pre?.textContent).toBe(code);
    expect(pre?.hasAttribute("data-numbered")).toBe(true);
    expect(pre?.getAttribute("style")).toContain("--code-digits: 1");
    expect(pre?.getAttribute("tabindex")).toBe("0");

    await user.click(screen.getByRole("button", { name: "Copy code" }));
    await tick();
    expect(written).toEqual([code]);
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("falls back to the language's name, or a label, and can leave the button out", async () => {
    render(() => <CodeBlock language="sql" code="select 1" copyable={false} />);
    expect(screen.getByRole("figure", { name: "sql" })).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("with nothing to name it, the copy button floats over the code", async () => {
    const { container } = render(() => (
      <CodeBlock code="plain text" copyLabel="Copy the snippet" maxHeight={200} />
    ));
    expect(container.querySelector("figcaption")).toBeNull();
    const figure = container.querySelector<HTMLElement>('[data-slot="code-block"]');
    expect(figure?.style.getPropertyValue("--code-max-height")).toBe("200px");
    await user.click(screen.getByRole("button", { name: "Copy the snippet" }));
    await tick();
    expect(written).toEqual(["plain text"]);
    expect(ariaViolations(document.body)).toEqual([]);
  });
});
