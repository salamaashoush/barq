import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";
import {
  type CompletionContext,
  type CompletionResult,
  CompletionContext as Context,
  autocompletion,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
import { forEachDiagnostic } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { CodeBlock, Highlight } from "./code-block.tsx";
import { CodeEditor } from "./code-editor.tsx";
import { CodeTabs } from "./code-tabs.tsx";
import { codeIntelligence, workerIntelligence } from "./intelligence.ts";
import type { CodeIntelligence, IntelligenceResponse } from "./intelligence-protocol.ts";
import { serveIntelligence, typescriptIntelligence } from "./intelligence-worker.ts";
import { loadLanguage } from "./languages.ts";
import { type CodeLineMark, rangeAround } from "./lines.ts";
import { TerminalBlock } from "./terminal-block.tsx";
import { editorIn, queueSelectionChanges } from "./test-dom.ts";
import { tokenCompletions } from "./token-completions.ts";

queueSelectionChanges();

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
  localStorage.clear();
});

const SCRIPT = [
  'import { test } from "@acme/check";',
  "",
  'test("home", async ({ page }) => {',
  '  await page.goto("https://acme.example.com");',
  '  await page.click("text=Sign in");',
  "  await expect(page).toHaveTitle(/Dashboard/);",
  "});",
].join("\n");

describe("marked lines and excerpts", () => {
  test("a CodeBlock shows the lines around a failure, numbered as in the file, the line marked", async () => {
    await loadLanguage("typescript");
    const { container } = render(() => (
      <CodeBlock
        filename="home.spec.ts"
        language="typescript"
        code={SCRIPT}
        lineNumbers
        range={rangeAround(SCRIPT, 5, 1)}
        marks={[{ line: 5, tone: "danger", label: "Failed here" }]}
      />
    ));
    const pre = container.querySelector("pre");
    const lines = [...(pre?.querySelectorAll("[data-line]") ?? [])];
    expect(lines.map((one) => one.textContent)).toEqual([
      '  await page.goto("https://acme.example.com");',
      '  await page.click("text=Sign in");',
      "  await expect(page).toHaveTitle(/Dashboard/);",
    ]);
    expect(pre?.getAttribute("style")).toContain("--code-line-start: 3");
    expect(lines[1]?.getAttribute("data-mark")).toBe("danger");
    expect(lines[1]?.getAttribute("data-mark-label")).toBe("Failed here");
    expect(lines[0]?.hasAttribute("data-mark")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Copy code" }));
    await tick();
    expect(written).toEqual([
      '  await page.goto("https://acme.example.com");\n  await page.click("text=Sign in");\n  await expect(page).toHaveTitle(/Dashboard/);',
    ]);
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("the light highlighter colours with no grammar loaded, and a range past the end is cut", () => {
    const { container } = render(() => (
      <Highlight
        code={'name = "acme"\nport = 80'}
        language="toml"
        highlighter="light"
        range={{ from: 2, to: 9 }}
      />
    ));
    const lines = container.querySelectorAll("[data-line]");
    expect(lines.length).toBe(1);
    expect(lines[0]?.querySelector(".tok-number")?.textContent).toBe("80");
  });

  test("a CodeEditor marks lines too, and follows its marks", async () => {
    const [marks, setMarks] = createSignal<readonly CodeLineMark[]>([
      { line: 2, tone: "warning", label: "Slow" },
    ]);
    const { container } = render(() => (
      <CodeEditor label="Script" defaultValue={"a\nb\nc"} marks={marks()} />
    ));
    await editorIn(container);
    function marked(): Element[] {
      return [...container.querySelectorAll(".cm-line[data-mark]")];
    }
    expect(marked().map((one) => [one.textContent, one.getAttribute("data-mark")])).toEqual([
      ["b", "warning"],
    ]);
    setMarks([{ line: 3, tone: "danger", label: "Error" }]);
    flush();
    expect(marked().map((one) => [one.textContent, one.getAttribute("data-mark-label")])).toEqual([
      ["c", "Error"],
    ]);
  });

  test("folding puts a fold gutter beside the numbers", async () => {
    await loadLanguage("json");
    const code = '{\n  "a": {\n    "b": 1\n  }\n}';
    const { container } = render(() => (
      <CodeEditor label="Body" language="json" defaultValue={code} folding />
    ));
    await editorIn(container);
    expect(container.querySelector(".cm-foldGutter")).not.toBeNull();
  });
});

describe("TerminalBlock", () => {
  test("draws a prompt before each command and copies the commands alone", async () => {
    const { container } = render(() => (
      <TerminalBlock
        code={"bun add @barqjs/arc\nbun run dev \\\n  --port 4700"}
        highlighter="light"
      />
    ));
    const figure = screen.getByRole("figure", { name: "Terminal" });
    expect(figure.getAttribute("data-slot")).toBe("code-block");
    const lines = [...container.querySelectorAll("[data-line]")];
    expect(lines.map((one) => one.getAttribute("data-prompt"))).toEqual(["$", "$", null]);
    expect(lines[2]?.hasAttribute("data-continued")).toBe(true);
    // The prompt is generated content, so the text is the commands alone.
    expect(container.querySelector("pre")?.textContent).toBe(
      "bun add @barqjs/arc\nbun run dev \\\n  --port 4700",
    );
    expect(container.querySelector("pre")?.hasAttribute("data-wrap")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    await tick();
    expect(written).toEqual(["bun add @barqjs/arc\nbun run dev \\\n  --port 4700"]);
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("a transcript shows the output faint and leaves it out of the copy", async () => {
    const { container } = render(() => (
      <TerminalBlock
        transcript
        prompt="%"
        filename="zsh"
        code={"% acme status\nAll 3 services up\n% acme version"}
      />
    ));
    const lines = [...container.querySelectorAll("[data-line]")];
    expect(lines.map((one) => one.textContent)).toEqual([
      "acme status",
      "All 3 services up",
      "acme version",
    ]);
    expect(lines[0]?.getAttribute("data-prompt")).toBe("%");
    expect(lines[1]?.hasAttribute("data-output")).toBe(true);
    expect(lines[1]?.querySelector("[class^=tok-]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    await tick();
    expect(written).toEqual(["acme status\nacme version"]);
  });
});

describe("CodeTabs", () => {
  const items = [
    { id: "bun", label: "bun", code: "bun add @barqjs/arc", terminal: true },
    { id: "npm", label: "npm", code: "npm install @barqjs/arc", terminal: true },
    {
      id: "config",
      label: "Config",
      code: '{ "name": "acme" }',
      language: "json",
      filename: "acme.json",
      note: "Save it beside the project.",
    },
  ] as const;

  test("one tab's code at a time, chosen with a click or the arrows", async () => {
    render(() => <CodeTabs aria-label="Install" items={items} highlighter="light" />);
    const list = screen.getByRole("tablist", { name: "Install" });
    expect(list).toBeDefined();
    expect(screen.getByRole("tabpanel").textContent).toContain("bun add @barqjs/arc");
    await user.click(screen.getByRole("tab", { name: "Config" }));
    flush();
    expect(screen.getByRole("tabpanel").textContent).toContain("Save it beside the project.");
    expect(screen.getByRole("figure", { name: "acme.json" })).toBeDefined();
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(screen.getByRole("tab", { name: "npm" }).getAttribute("aria-selected")).toBe("true");
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("tabs of one group share the choice, and the next page remembers it", async () => {
    const first = render(() => (
      <div>
        <CodeTabs aria-label="Install" group="pm" items={items.slice(0, 2)} />
        <CodeTabs
          aria-label="Run"
          group="pm"
          items={[
            { id: "bun", label: "bun", code: "bun run dev", terminal: true },
            { id: "npm", label: "npm", code: "npm run dev", terminal: true },
          ]}
        />
      </div>
    ));
    await tick();
    flush();
    const tabs = screen.getAllByRole("tab", { name: "npm" });
    await user.click(tabs[0] as HTMLElement);
    flush();
    expect(
      screen.getAllByRole("tab", { name: "npm" }).map((one) => one.getAttribute("aria-selected")),
    ).toEqual(["true", "true"]);
    expect(localStorage.getItem("arc-code-tabs:pm")).toBe("npm");
    first.unmount();

    render(() => <CodeTabs aria-label="Install" group="pm" items={items.slice(0, 2)} />);
    await tick();
    flush();
    expect(screen.getByRole("tab", { name: "npm" }).getAttribute("aria-selected")).toBe("true");
  });

  test("the code follows the options that make it", () => {
    const [port, setPort] = createSignal(4700);
    render(() => (
      <CodeTabs
        aria-label="Run"
        items={[
          { id: "bun", label: "bun", code: `bun run dev --port ${String(port())}`, terminal: true },
        ]}
      />
    ));
    expect(screen.getByRole("tabpanel").textContent).toContain("--port 4700");
    setPort(5000);
    flush();
    expect(screen.getByRole("tabpanel").textContent).toContain("--port 5000");
  });
});

function editorState(doc: string, extension: Extension): EditorState {
  return EditorState.create({ doc, extensions: [autocompletion(), extension] });
}

async function complete(
  state: EditorState,
  pos = state.doc.length,
): Promise<CompletionResult | null> {
  const sources = state.languageDataAt<(context: CompletionContext) => unknown>(
    "autocomplete",
    pos,
  );
  for (const source of sources) {
    const result = (await source(new Context(state, pos, true))) as CompletionResult | null;
    if (result !== null) return result;
  }
  return null;
}

describe("tokenCompletions", () => {
  test("offers the names after the trigger, tagged by kind, the closing braces written once", async () => {
    const extension = tokenCompletions({
      trigger: "{{",
      close: "}}",
      tokens: [
        { name: "API_TOKEN", kind: "secret" },
        { name: "BASE_URL", kind: "variable" },
      ],
    });
    const open = await complete(editorState("url: {{BA", extension));
    expect(open?.from).toBe(7);
    expect(open?.options.map((one) => [one.label, one.detail, one.apply])).toEqual([
      ["API_TOKEN", "secret", "API_TOKEN}}"],
      ["BASE_URL", "variable", "BASE_URL}}"],
    ]);
    const closed = await complete(editorState("url: {{}}", extension), 7);
    expect(closed?.options[0]?.apply).toBe("API_TOKEN");
    expect(await complete(editorState("url: BA", extension))).toBeNull();
  });

  test("reads an accessor each time the list opens", async () => {
    let names = [{ name: "A" }];
    const extension = tokenCompletions({ trigger: "process.env.", tokens: () => names });
    expect(
      (await complete(editorState("process.env.", extension)))?.options.map((one) => one.label),
    ).toEqual(["A"]);
    names = [{ name: "B" }];
    expect(
      (await complete(editorState("process.env.", extension)))?.options.map((one) => one.label),
    ).toEqual(["B"]);
  });

  test("works inside a live CodeEditor", async () => {
    let view: EditorView | undefined;
    const { container } = render(() => (
      <CodeEditor
        label="Template"
        defaultValue="{{"
        extensions={tokenCompletions({ trigger: "{{", close: "}}", tokens: [{ name: "REGION" }] })}
        onView={(created) => {
          view = created;
        }}
      />
    ));
    await editorIn(container);
    view?.dispatch({ selection: { anchor: 2 } });
    if (view !== undefined) startCompletion(view);
    await waitFor(() => {
      if (view === undefined || currentCompletions(view.state).length === 0)
        throw new Error("no list");
    });
    expect(currentCompletions(view?.state as EditorState).map((one) => one.label)).toEqual([
      "REGION",
    ]);
  });
});

/** A worker in this process: two ends that post to each other. */
function pair() {
  const toWorker: ((event: MessageEvent) => void)[] = [];
  const toPage: ((event: MessageEvent) => void)[] = [];
  return {
    page: {
      postMessage: (message: unknown) => {
        queueMicrotask(() => {
          for (const listener of toWorker) listener(new MessageEvent("message", { data: message }));
        });
      },
      addEventListener: (
        _type: "message",
        listener: (event: MessageEvent<IntelligenceResponse>) => void,
      ) => {
        toPage.push(listener as (event: MessageEvent) => void);
      },
    },
    worker: {
      postMessage: (message: unknown) => {
        queueMicrotask(() => {
          for (const listener of toPage) listener(new MessageEvent("message", { data: message }));
        });
      },
      addEventListener: (_type: "message", listener: (event: MessageEvent) => void) => {
        toWorker.push(listener);
      },
    },
  };
}

describe("code intelligence", () => {
  test("a worker's service answers each call with its scope, started on the first request", async () => {
    const ends = pair();
    const started: string[] = [];
    let starts = 0;
    serveIntelligence(ends.worker, (scope) => {
      started.push(scope);
      return {
        completions: (text, pos) => Promise.resolve([{ label: `${scope}:${text.slice(0, pos)}` }]),
        diagnostics: () => Promise.reject(new Error("checker down")),
      };
    });
    const service = workerIntelligence(() => {
      starts++;
      return ends.page;
    }, "test");
    expect(starts).toBe(0);
    expect(await service.completions("abc", 2)).toEqual([{ label: "test:ab" }]);
    expect(await service.completions("x", 1)).toEqual([{ label: "test:x" }]);
    expect(starts).toBe(1);
    expect(started).toEqual(["test"]);
    await expect(service.diagnostics?.("x") ?? Promise.resolve()).rejects.toThrow("checker down");
    expect(await service.details?.("x", 0, "a")).toBeNull();
  });

  test("TypeScript's answers become completions, docs and diagnostics", async () => {
    let updates = 0;
    const environment = {
      text: " ",
      getSourceFile: () => ({ text: environment.text }),
      updateFile: (_file: string, content: string) => {
        updates++;
        environment.text = content;
      },
      languageService: {
        getCompletionsAtPosition: () => ({
          entries: [
            { name: "goto", kind: "method", sortText: "11" },
            { name: "__private", kind: "property", sortText: "11" },
            { name: "url", kind: "property", sortText: "15", insertText: "url()" },
          ],
        }),
        getCompletionEntryDetails: () => ({
          displayParts: [{ text: "goto(" }, { text: "url: string" }, { text: "): Promise<void>" }],
          documentation: [{ text: "Opens a page." }],
        }),
        getQuickInfoAtPosition: () => ({
          textSpan: { start: 2, length: 4 },
          displayParts: [{ text: "const page: Page" }],
        }),
        getSyntacticDiagnostics: () => [],
        getSemanticDiagnostics: () => [
          {
            start: 0,
            length: 4,
            category: 1,
            messageText: {
              messageText: "Type mismatch.",
              next: [{ messageText: "Number is not a string." }],
            },
          },
          { start: 5, length: 1, category: 0, messageText: "Unused." },
        ],
      },
    };
    const service = typescriptIntelligence(() => environment);
    expect(await service.completions("page.go", 7)).toEqual([
      { label: "goto", type: "method", apply: undefined, boost: 39 },
      { label: "url", type: "property", apply: "url()", boost: 35 },
    ]);
    expect(environment.text).toBe("page.go");
    await service.completions("page.go", 7);
    expect(updates).toBe(1);
    expect(await service.details?.("page.go", 7, "goto")).toEqual({
      signature: "goto(url: string): Promise<void>",
      documentation: "Opens a page.",
    });
    expect(await service.quickInfo?.("page.go", 3)).toEqual({
      from: 2,
      to: 6,
      signature: "const page: Page",
      documentation: "",
    });
    expect(await service.diagnostics?.("page.go")).toEqual([
      { from: 0, to: 4, severity: "error", message: "Type mismatch.\n  Number is not a string." },
      { from: 5, to: 6, severity: "warning", message: "Unused." },
    ]);
  });

  test("in an editor: completion from the service, its diagnostics underlined, a failure an empty answer", async () => {
    const service: CodeIntelligence = {
      completions: () => Promise.resolve([{ label: "goto", type: "method" }]),
      diagnostics: () => Promise.resolve([{ from: 0, to: 4, severity: "error", message: "Nope." }]),
      quickInfo: () => Promise.reject(new Error("down")),
    };
    let view: EditorView | undefined;
    const { container } = render(() => (
      <CodeEditor
        label="Script"
        defaultValue="page."
        extensions={codeIntelligence(service, { source: "TypeScript", lintDelay: 0 })}
        onView={(created) => {
          view = created;
        }}
      />
    ));
    await editorIn(container);
    const live = view as EditorView;
    live.dispatch({ selection: { anchor: 5 } });
    startCompletion(live);
    await waitFor(() => {
      if (currentCompletions(live.state).length === 0) throw new Error("no list");
    });
    expect(currentCompletions(live.state).map((one) => one.label)).toEqual(["goto"]);
    await waitFor(() => {
      let count = 0;
      forEachDiagnostic(live.state, () => count++);
      if (count === 0) throw new Error("not checked yet");
    });
    const found: string[] = [];
    forEachDiagnostic(live.state, (diagnostic) =>
      found.push(`${diagnostic.source ?? ""}: ${diagnostic.message}`),
    );
    expect(found).toEqual(["TypeScript: Nope."]);
    expect(container.querySelector(".cm-gutter-lint")).not.toBeNull();
  });
});
