import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { ariaViolations, render, screen, user } from "@barqjs/testing";
import { EditorView } from "@codemirror/view";

import { CodeEditor } from "./code-editor.tsx";
import { loadLanguage } from "./languages.ts";
import {
  editorIn,
  gatedLanguage,
  place,
  queueSelectionChanges,
  reported,
  type,
} from "./test-dom.ts";

queueSelectionChanges();

/** The live view, through the extension point an app would use. */
function viewHolder(): { view: () => EditorView; onView: (view: EditorView) => void } {
  let held: EditorView | undefined;
  return {
    view: () => {
      if (held === undefined) throw new Error("The editor has not mounted.");
      return held;
    },
    onView: (view) => {
      held = view;
    },
  };
}

/** Counts the transactions that changed the document, whatever made them. */
function docChanges(): {
  count: () => number;
  extension: ReturnType<typeof EditorView.updateListener.of>;
} {
  let count = 0;
  return {
    count: () => count,
    extension: EditorView.updateListener.of((update) => {
      if (update.docChanged) count += update.transactions.filter((tr) => tr.docChanged).length;
    }),
  };
}

describe("CodeEditor", () => {
  test("shows the code highlighted, then the editor takes over in its place", async () => {
    await loadLanguage("typescript");
    const holder = viewHolder();
    const { container } = render(() => (
      <CodeEditor
        label="Script"
        description="Runs before each request."
        language="typescript"
        defaultValue={"const answer = 42;\nexport default answer;"}
        onView={holder.onView}
      />
    ));
    const frame = container.querySelector('[data-slot="code-editor"]');
    // The language is loaded, so the editor mounts once the render settles.
    await editorIn(container);
    expect(container.querySelector('[data-slot="code-static"]')).toBeNull();
    expect(frame?.hasAttribute("data-mounted")).toBe(true);

    const box = screen.getByRole("textbox", { name: "Script" });
    expect(box.getAttribute("aria-multiline")).toBe("true");
    const described = box.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("Runs before each request.");
    expect(box.querySelector(".tok-keyword")?.textContent).toBe("const");
    expect(box.querySelectorAll(".cm-line").length).toBe(2);
    expect(holder.view().state.doc.toString()).toBe("const answer = 42;\nexport default answer;");
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("before its language loads, the code is a static block of the same lines", async () => {
    const slow = gatedLanguage();
    const { container } = render(() => (
      <CodeEditor label="Notes" language={slow.name} defaultValue={"let a;\n\nlet b;"} />
    ));
    await reported();
    const pre = container.querySelector('[data-slot="code-static"]');
    expect(pre?.tagName).toBe("PRE");
    expect(pre?.querySelectorAll("[data-line]").length).toBe(3);
    expect(pre?.hasAttribute("data-numbered")).toBe(true);
    expect(container.querySelector(".cm-editor")).toBeNull();
    await slow.release();
    await editorIn(container);
    expect(container.querySelector('[data-slot="code-static"]')).toBeNull();
    expect(container.querySelectorAll(".cm-line").length).toBe(3);
  });

  test("reports what was typed once per tick, with the latest document", async () => {
    const holder = viewHolder();
    const changes: string[] = [];
    const { container } = render(() => (
      <CodeEditor
        label="Query"
        defaultValue="select"
        onChange={(value) => changes.push(value)}
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const view = holder.view();
    place(view);
    type(view, " *");
    type(view, " from");
    type(view, " t");
    expect(changes).toEqual([]);
    await reported();
    expect(changes).toEqual(["select * from t"]);

    // Its own document: nothing the caller holds is written back.
    type(view, ";");
    await reported();
    expect(changes).toEqual(["select * from t", "select * from t;"]);
    expect(view.state.doc.toString()).toBe("select * from t;");
  });

  test("keys go through CodeMirror's keymap: a new line, and Mod-Enter submits", async () => {
    const holder = viewHolder();
    const submitted: string[] = [];
    const changes: string[] = [];
    const { container } = render(() => (
      <CodeEditor
        label="Query"
        defaultValue="select 1"
        onChange={(value) => changes.push(value)}
        onSubmit={(value) => submitted.push(value)}
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const view = holder.view();
    view.focus();
    place(view);
    user.keyboard("{Enter}");
    type(view, "union");
    await reported();
    expect(changes).toEqual(["select 1\nunion"]);

    user.keyboard("{Enter}", { ctrlKey: true });
    expect(submitted).toEqual(["select 1\nunion"]);
    expect(view.state.doc.toString()).toBe("select 1\nunion");
  });

  test("a controlled value syncs both ways without echoing", async () => {
    const holder = viewHolder();
    const changes = docChanges();
    const [value, setValue] = createSignal("{}");
    const reports: string[] = [];
    const { container } = render(() => (
      <CodeEditor
        label="Body"
        language="json"
        value={value()}
        onChange={(next) => {
          reports.push(next);
          setValue(next);
        }}
        extensions={changes.extension}
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const view = holder.view();

    // In: the caller's value replaces the document, and is not reported back.
    setValue('{ "a": 1 }');
    flush();
    expect(view.state.doc.toString()).toBe('{ "a": 1 }');
    await reported();
    expect(reports).toEqual([]);
    expect(changes.count()).toBe(1);

    // Out: an edit is reported, the caller writes it back, and that write
    // changes nothing in the editor.
    place(view, view.state.doc.length - 2);
    type(view, ', "b": 2');
    await reported();
    flush();
    expect(reports).toEqual(['{ "a": 1, "b": 2 }']);
    expect(value()).toBe('{ "a": 1, "b": 2 }');
    expect(changes.count()).toBe(2);
    await reported();
    expect(reports.length).toBe(1);

    // The same value again is no change at all.
    setValue('{ "a": 1, "b": 2 }');
    flush();
    expect(changes.count()).toBe(2);
  });

  test("a value set before the editor mounts is the one it opens with", async () => {
    const holder = viewHolder();
    const slow = gatedLanguage();
    const [value, setValue] = createSignal("one");
    const { container } = render(() => (
      <CodeEditor label="Text" language={slow.name} value={value()} onView={holder.onView} />
    ));
    setValue("two: 2");
    flush();
    expect(container.querySelector('[data-slot="code-static"]')?.textContent).toBe("two: 2");
    await slow.release();
    await editorIn(container);
    expect(holder.view().state.doc.toString()).toBe("two: 2");
  });

  test("readOnly turns on and off in the live editor", async () => {
    const holder = viewHolder();
    const [readOnly, setReadOnly] = createSignal(true);
    const { container } = render(() => (
      <CodeEditor label="Config" defaultValue="a: 1" readOnly={readOnly()} onView={holder.onView} />
    ));
    await editorIn(container);
    const view = holder.view();
    const box = screen.getByRole("textbox", { name: "Config" });
    const frame = container.querySelector('[data-slot="code-editor"]');
    expect(view.state.readOnly).toBe(true);
    expect(box.getAttribute("aria-readonly")).toBe("true");
    expect(frame?.hasAttribute("data-readonly")).toBe(true);
    // Still a Tab stop, so the code can be read and selected from a keyboard.
    expect(box.getAttribute("contenteditable")).toBe("true");
    view.focus();
    place(view);
    user.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("a: 1");

    setReadOnly(false);
    flush();
    expect(view.state.readOnly).toBe(false);
    expect(box.hasAttribute("aria-readonly")).toBe(false);
    expect(frame?.hasAttribute("data-readonly")).toBe(false);
    user.keyboard("{Enter}");
    expect(view.state.doc.toString()).toBe("a: 1\n");
  });

  test("switching the language reconfigures the live editor", async () => {
    await Promise.all([loadLanguage("json"), loadLanguage("python")]);
    const holder = viewHolder();
    const [language, setLanguage] = createSignal("json");
    const { container } = render(() => (
      <CodeEditor
        label="Snippet"
        language={language()}
        defaultValue={'def f(): return "x"'}
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const view = holder.view();
    const box = screen.getByRole("textbox", { name: "Snippet" });
    expect(box.getAttribute("data-language")).toBe("json");
    expect(box.querySelector(".tok-keyword")).toBeNull();

    setLanguage("python");
    flush();
    expect(box.getAttribute("data-language")).toBe("python");
    expect(box.querySelector(".tok-keyword")?.textContent).toBe("def");

    // A language still loading lands when it arrives, unless the prop moved on.
    setLanguage("sql");
    flush();
    setLanguage("python");
    flush();
    await loadLanguage("sql");
    await reported();
    expect(view.contentDOM.getAttribute("data-language")).toBe("python");
  });

  test("the other options reconfigure in place", async () => {
    const holder = viewHolder();
    const [numbers, setNumbers] = createSignal(true);
    const [wrap, setWrap] = createSignal(false);
    const [tabSize, setTabSize] = createSignal(2);
    const [placeholder, setPlaceholder] = createSignal("Type a query");
    const { container } = render(() => (
      <CodeEditor
        label="Query"
        lineNumbers={numbers()}
        wrap={wrap()}
        tabSize={tabSize()}
        placeholder={placeholder()}
        minHeight={120}
        maxHeight="20rem"
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const view = holder.view();
    const frame = container.querySelector<HTMLElement>('[data-slot="code-editor"]');
    expect(frame?.style.getPropertyValue("--code-min-height")).toBe("120px");
    expect(frame?.style.getPropertyValue("--code-max-height")).toBe("20rem");
    expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(container.querySelector(".cm-placeholder")?.textContent).toBe("Type a query");
    expect(view.state.tabSize).toBe(2);

    setNumbers(false);
    setWrap(true);
    setTabSize(4);
    setPlaceholder("Another");
    flush();
    expect(container.querySelector(".cm-lineNumbers")).toBeNull();
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
    expect(view.state.tabSize).toBe(4);
    expect(frame?.style.getPropertyValue("--code-tab-size")).toBe("4");
    expect(container.querySelector(".cm-placeholder")?.textContent).toBe("Another");
  });

  test("extensions given as an accessor are followed", async () => {
    const holder = viewHolder();
    const [locked, setLocked] = createSignal(false);
    const { container } = render(() => (
      <CodeEditor
        label="Code"
        defaultValue="x"
        extensions={() => (locked() ? EditorView.editable.of(false) : [])}
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const box = holder.view().contentDOM;
    expect(box.getAttribute("contenteditable")).toBe("true");
    setLocked(true);
    flush();
    expect(box.getAttribute("contenteditable")).toBe("false");
  });

  test("its colours are the theme's custom properties, so a theme switch reconfigures nothing", async () => {
    await loadLanguage("typescript");
    const holder = viewHolder();
    const changes = docChanges();
    let updates = 0;
    const { container } = render(() => (
      <CodeEditor
        label="Code"
        language="typescript"
        defaultValue="let x = 1;"
        extensions={[
          changes.extension,
          EditorView.updateListener.of(() => {
            updates++;
          }),
        ]}
        onView={holder.onView}
      />
    ));
    await editorIn(container);
    const sheet = collectCss();
    for (const token of ["keyword", "string", "number", "function", "property", "type", "tag"]) {
      expect(sheet).toMatch(new RegExp(`\\.tok-${token}\\{color:var\\(--code-${token}\\)\\}`));
    }
    const editorRules = [...document.querySelectorAll("style")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(editorRules).toContain("var(--code-line-height)");
    expect(editorRules).toContain("var(--selection)");

    const before = updates;
    document.documentElement.classList.add("dark");
    flush();
    await reported();
    document.documentElement.classList.remove("dark");
    expect(updates).toBe(before);
    expect(container.querySelector(".tok-keyword")?.textContent).toBe("let");
  });

  test("goes with its owner: the view is destroyed and a pending change still reported", async () => {
    const holder = viewHolder();
    const changes: string[] = [];
    let released = 0;
    const { container, unmount } = render(() => (
      <CodeEditor
        label="Code"
        defaultValue="a"
        onChange={(value) => changes.push(value)}
        onView={(view) => {
          holder.onView(view);
          return () => {
            released++;
          };
        }}
      />
    ));
    await editorIn(container);
    const view = holder.view();
    place(view);
    type(view, "b");
    unmount();
    expect(changes).toEqual(["ab"]);
    expect(released).toBe(1);
    expect(view.dom.isConnected).toBe(false);
    await reported();
    expect(changes).toEqual(["ab"]);
  });

  test("an editor disposed before its language loads never mounts", async () => {
    const holder = viewHolder();
    const slow = gatedLanguage();
    let mounted = 0;
    const { unmount } = render(() => (
      <CodeEditor
        label="Code"
        language={slow.name}
        defaultValue="a { color: red }"
        onView={(view) => {
          mounted++;
          holder.onView(view);
        }}
      />
    ));
    await reported();
    unmount();
    await slow.release();
    await reported();
    expect(mounted).toBe(0);
  });

  test("an invalid editor says so", async () => {
    const { container } = render(() => (
      <>
        <span id="query-label">Query</span>
        <span id="query-error">Unknown column.</span>
        <CodeEditor
          labelledBy="query-label"
          describedBy="query-error"
          id="query"
          invalid
          defaultValue="select nope"
        />
      </>
    ));
    await editorIn(container);
    const box = screen.getByRole("textbox", { name: "Query" });
    expect(box.id).toBe("query");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe("query-error");
    expect(container.querySelector('[data-slot="code-editor"]')?.hasAttribute("data-invalid")).toBe(
      true,
    );
    expect(ariaViolations(document.body)).toEqual([]);
  });
});
