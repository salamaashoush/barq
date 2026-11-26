/**
 * The code components on a server, and the browser taking over what it wrote.
 */

import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { flush, resetChildIds } from "@barqjs/core";
import { renderPage } from "@barqjs/server";
import { installSeed } from "@barqjs/testing";
import { hydrate } from "@barqjs/web";

import { halves, serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { editorIn, queueSelectionChanges } from "./test-dom.ts";

queueSelectionChanges();

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

function page(names: string[], jsx: string): string {
  return `
    import { renderToStringAsync } from "@barqjs/server";
    import { ${names.join(", ")} } from ${entry};

    export async function page() {
      return await renderToStringAsync(() => (${jsx}));
    }
  `;
}

describe("on a server, with no DOM", () => {
  test("CodeBlock writes its code highlighted, escaped, with its name and copy button", async () => {
    const { code, html, errors } = await serverProcess(
      page(
        ["CodeBlock"],
        `<CodeBlock filename="query.sql" language="sql" code={"select * from t where a < 1"} lineNumbers />`,
      ),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="code-block"');
    expect(html).toContain(">query.sql</span>");
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('<span class="tok-keyword">select</span>');
    expect(html).toContain('<span class="tok-punctuation">&lt;</span>');
    expect(html).toContain("data-numbered");
  });

  test("CodeEditor writes the static code where the editor will be, and no editor", async () => {
    const { code, html, errors } = await serverProcess(
      page(
        ["CodeEditor"],
        `<CodeEditor label="Script" language="javascript" defaultValue={"let total = 0;\\ntotal += 1;"} minHeight={160} />`,
      ),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="code-editor"');
    expect(html).toContain("--code-min-height: 160px");
    expect(html).toContain('data-slot="code-static"');
    expect(html).toContain('<span class="tok-keyword">let</span>');
    expect(html.match(/<span data-line>/g)?.length).toBe(2);
    expect(html).not.toContain("cm-editor");
  });

  test("CodeBlock writes an excerpt numbered from its first line, the marked line marked", async () => {
    const { code, html, errors } = await serverProcess(
      page(
        ["CodeBlock"],
        `<CodeBlock language="javascript" lineNumbers code={"a();\\nb();\\nc();\\nd();"} range={{ from: 2, to: 3 }} marks={[{ line: 3, tone: "danger", label: "Failed here" }]} />`,
      ),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain("--code-line-start: 1");
    expect(html.match(/<span data-line/g)?.length).toBe(2);
    expect(html).toContain(
      'data-mark="danger" data-mark-label="Failed here"><span class="tok-function">c</span>',
    );
  });

  test("TerminalBlock and CodeTabs write their commands with prompts, highlighted with no grammar", async () => {
    const { code, html, errors } = await serverProcess(
      page(
        ["CodeTabs", "TerminalBlock"],
        `<div>
          <TerminalBlock highlighter="light" transcript code={"$ acme status\\nAll up"} />
          <CodeTabs aria-label="Install" highlighter="light" items={[{ id: "bun", label: "bun", code: "bun add acme", terminal: true }, { id: "npm", label: "npm", code: "npm i acme", terminal: true }]} />
        </div>`,
      ),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain(
      '<span data-line data-prompt="$"><span class="tok-function">acme</span> status</span>',
    );
    expect(html).toContain(`<span data-line data-output="">All up</span>`);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('<span class="tok-function">bun</span> add acme');
  });

  test("CodeEditor with folding and marks leaves room for the gutter and marks the static lines", async () => {
    const { code, html, errors } = await serverProcess(
      page(
        ["CodeEditor"],
        `<CodeEditor label="Body" folding marks={[{ line: 2, tone: "warning" }]} defaultValue={"a\\nb"} />`,
      ),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain("data-folding");
    expect(html).toContain('<span data-line data-mark="warning">b</span>');
  });

  test("CodeDiff writes its frame for the browser to fill", async () => {
    const { code, html, errors } = await serverProcess(
      page(["CodeDiff"], `<CodeDiff original="a" modified="b" layout="unified" />`),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="code-diff"');
    expect(html).toContain('data-layout="unified"');
  });
});

/** The server's page and its seed, hydrated into a fresh container. */
async function hydrated(source: string) {
  const { server, client } = await halves(source);
  const rendered = await renderPage(server);
  installSeed(rendered.script);
  const container = document.body.appendChild(document.createElement("div"));
  container.innerHTML = rendered.html;
  const written = container.querySelector("pre");
  const writtenMarkup = written?.innerHTML;
  // A page starts its root ids from nothing, as the server's render did;
  // this process has mounted roots before.
  resetChildIds();
  const dispose = hydrate(client, container);
  flush();
  return {
    container,
    written,
    writtenMarkup,
    report: hydrate.report,
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

describe("hydrated", () => {
  test("CodeBlock keeps the server's highlighted markup, node for node", async () => {
    const result = await hydrated(`
      import { CodeBlock } from ${entry};
      export function Page() {
        return <CodeBlock language="python" code={"def f():\\n    return 1"} />;
      }
    `);
    expect(result.report.mismatches).toEqual([]);
    expect(result.report.recovered).toBe(false);
    const pre = result.container.querySelector("pre");
    expect(pre).toBe(result.written);
    // The server's nodes are kept, so the markup is exactly what it wrote.
    expect(pre?.innerHTML).toBe(result.writtenMarkup ?? "");
    expect(pre?.querySelector(".tok-keyword")?.textContent).toBe("def");
    result.dispose();
  });

  test("a marked excerpt keeps the server's markup, node for node", async () => {
    const result = await hydrated(`
      import { CodeBlock } from ${entry};
      export function Page() {
        return <CodeBlock language="python" lineNumbers code={"a = 1\\nb = 2\\nc = 3"} range={{ from: 2, to: 3 }} marks={[{ line: 2, tone: "info" }]} />;
      }
    `);
    expect(result.report.mismatches).toEqual([]);
    expect(result.report.recovered).toBe(false);
    const pre = result.container.querySelector("pre");
    expect(pre).toBe(result.written);
    expect(pre?.innerHTML).toBe(result.writtenMarkup ?? "");
    expect(pre?.querySelector('[data-mark="info"]')?.textContent).toBe("b = 2");
    result.dispose();
  });

  test("TerminalBlock, CodeTabs and a light Highlight hydrate with every node kept", async () => {
    const result = await hydrates(`
      import { CodeTabs, Highlight, TerminalBlock } from ${entry};
      export function Page() {
        return (
          <div>
            <TerminalBlock highlighter="light" code={"bun add acme\\nbun run dev"} />
            <CodeTabs aria-label="Install" highlighter="light" items={[{ id: "bun", label: "bun", code: "bun add acme", terminal: true }, { id: "json", label: "Config", code: '{"a": 1}', language: "json" }]} />
            <Highlight highlighter="light" language="yaml" code={"name: acme"} />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll("[data-prompt]").length).toBe(3);
    result.unmount();
  });

  test("CodeEditor adopts the static code, then the editor takes its place line for line", async () => {
    const result = await hydrated(`
      import { CodeEditor } from ${entry};
      export function Page() {
        return <CodeEditor label="Query" language="sql" value={"select 1\\nfrom t\\nwhere a = 2"} />;
      }
    `);
    expect(result.report.mismatches).toEqual([]);
    expect(result.report.recovered).toBe(false);
    const pre = result.container.querySelector("pre");
    expect(pre).toBe(result.written);
    expect(pre?.querySelectorAll("[data-line]").length).toBe(3);
    expect(pre?.hasAttribute("data-numbered")).toBe(true);
    const frame = result.container.querySelector('[data-slot="code-editor"]');
    const style = frame?.getAttribute("style");

    await editorIn(result.container);
    expect(result.container.querySelector("pre")).toBeNull();
    expect(result.container.querySelectorAll(".cm-line").length).toBe(3);
    expect(result.container.querySelectorAll(".cm-lineNumbers .cm-gutterElement").length).toBe(4);
    expect(result.container.querySelector(".cm-content .tok-keyword")?.textContent).toBe("select");
    // The frame the static code sat in is the one the editor sits in.
    expect(result.container.querySelector('[data-slot="code-editor"]')).toBe(frame);
    expect(frame?.getAttribute("style")).toBe(style);
    result.dispose();
  });
});
