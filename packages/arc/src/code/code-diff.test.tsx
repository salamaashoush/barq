import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { ariaViolations, render, screen } from "@barqjs/testing";
import { getOriginalDoc } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";

import { CodeDiff } from "./code-diff.tsx";
import { loadLanguage } from "./languages.ts";
import { editorIn, place, queueSelectionChanges, reported, type } from "./test-dom.ts";

queueSelectionChanges();

const BEFORE = ["a: 1", "b: 2", "c: 3", "d: 4", "e: 5", "f: 6", "g: 7", "h: 8", "i: 9", "j: 10"];
const AFTER = BEFORE.map((line) => (line === "b: 2" ? "b: 20" : line));

/** The view behind a labelled side, found the way an extension would. */
function viewOf(name: string): EditorView {
  const content = screen.getByRole("textbox", { name });
  const view = EditorView.findFromDOM(content);
  if (view === null) throw new Error(`No editor is named ${name}.`);
  return view;
}

describe("CodeDiff", () => {
  test("puts the two side by side, marks the change and folds the rest", async () => {
    await loadLanguage("yaml");
    const { container } = render(() => (
      <CodeDiff original={BEFORE.join("\n")} modified={AFTER.join("\n")} language="yaml" />
    ));
    await editorIn(container, "code-diff");
    expect(container.querySelector(".cm-mergeView")).not.toBeNull();
    const original = viewOf("Original");
    const modified = viewOf("Modified");
    expect(original.state.doc.toString()).toBe(BEFORE.join("\n"));
    expect(modified.state.doc.toString()).toBe(AFTER.join("\n"));
    expect(container.querySelectorAll(".cm-changedLine").length).toBe(2);
    expect(container.querySelector(".cm-merge-b .cm-changedText")?.textContent).toBe("0");
    // Lines 6 to 10 are past the margin of 3 around the change.
    expect(container.querySelector(".cm-collapsedLines")).not.toBeNull();
    expect(original.state.readOnly).toBe(true);
    expect(modified.state.readOnly).toBe(true);
    expect(modified.contentDOM.querySelector(".tok-property")).not.toBeNull();
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("collapses nothing when told not to", async () => {
    const { container } = render(() => (
      <CodeDiff
        original={BEFORE.join("\n")}
        modified={AFTER.join("\n")}
        collapseUnchanged={false}
      />
    ));
    await editorIn(container, "code-diff");
    expect(container.querySelector(".cm-collapsedLines")).toBeNull();
  });

  test("unified, the removed text is drawn above what replaced it in one editor", async () => {
    const { container } = render(() => (
      <CodeDiff
        layout="unified"
        original={BEFORE.join("\n")}
        modified={AFTER.join("\n")}
        modifiedLabel="Config"
      />
    ));
    await editorIn(container, "code-diff");
    expect(container.querySelectorAll(".cm-editor").length).toBe(1);
    expect(container.querySelector(".cm-deletedChunk")?.textContent).toContain("b: 2");
    expect(viewOf("Config").state.doc.toString()).toBe(AFTER.join("\n"));
    // Read-only: no accept or reject buttons.
    expect(container.querySelector(".cm-deletedChunk button")).toBeNull();
  });

  test("editable, the modified side reports its changes once per tick", async () => {
    const [modified, setModified] = createSignal(AFTER.join("\n"));
    const reports: string[] = [];
    const { container } = render(() => (
      <CodeDiff
        original={BEFORE.join("\n")}
        modified={modified()}
        readOnly={false}
        onChange={(next) => {
          reports.push(next);
          setModified(next);
        }}
      />
    ));
    await editorIn(container, "code-diff");
    const view = viewOf("Modified");
    expect(view.state.readOnly).toBe(false);
    expect(viewOf("Original").state.readOnly).toBe(true);
    place(view, 0);
    type(view, "#");
    type(view, " ");
    await reported();
    flush();
    expect(reports).toEqual([`# ${AFTER.join("\n")}`]);
    await reported();
    expect(reports.length).toBe(1);
  });

  test("new texts from the caller come into the live diff", async () => {
    const [original, setOriginal] = createSignal("one\ntwo");
    const [modified, setModified] = createSignal("one\nthree");
    const [layout, setLayout] = createSignal<"split" | "unified">("split");
    const { container } = render(() => (
      <CodeDiff original={original()} modified={modified()} layout={layout()} />
    ));
    await editorIn(container, "code-diff");
    setModified("one\nfour");
    setOriginal("zero\ntwo");
    flush();
    expect(viewOf("Original").state.doc.toString()).toBe("zero\ntwo");
    expect(viewOf("Modified").state.doc.toString()).toBe("one\nfour");

    setLayout("unified");
    flush();
    expect(container.querySelector(".cm-mergeView")).toBeNull();
    const unified = viewOf("Modified");
    expect(getOriginalDoc(unified.state).toString()).toBe("zero\ntwo");
    setOriginal("zero\nfive");
    flush();
    expect(getOriginalDoc(unified.state).toString()).toBe("zero\nfive");
    expect(container.querySelector('[data-slot="code-diff"]')?.getAttribute("data-layout")).toBe(
      "unified",
    );
  });

  test("goes with its owner", async () => {
    const { container, unmount } = render(() => <CodeDiff original="a" modified="b" />);
    const editor = await editorIn(container, "code-diff");
    unmount();
    expect(editor.isConnected).toBe(false);
  });
});
