import { afterEach, describe, expect, test } from "bun:test";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { cleanup, render, screen, user } from "@barqjs/testing";
import { Input } from "@barqjs/ui/input";
import { $getRoot } from "lexical";

import { Status } from "../components/status.tsx";
import { BlockEditor } from "./block-editor.tsx";
import { type Block, defineBlock } from "./blocks.tsx";
import { $insertBlock } from "./commands.ts";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import {
  customizeExtensions,
  defineEditorExtension,
  editorExtensions,
  hasExtension,
  loadExtension,
  resolveExtensions,
} from "./extension.ts";
import { documentPreset } from "./presets.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, keydown, layOut, settle, typeText } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

interface DecisionData {
  text: string;
  status: "proposed" | "accepted";
}

/** An app's own block, made only from arc's pieces: a decision a team records, and where it stands. */
const Decision: Block<DecisionData> = defineBlock<DecisionData>({
  type: "acme-decision",
  label: "Decision",
  keywords: ["adr", "decide"],
  defaultData: () => ({ text: "", status: "proposed" }),
  component: (props) => (
    <div data-slot="acme-decision">
      <Status tone={props.data.status === "accepted" ? "success" : "neutral"}>
        {props.data.status === "accepted" ? "Accepted" : "Proposed"}
      </Status>
      <Input
        aria-label="Decision"
        value={props.data.text}
        readOnly={!props.editable}
        onInput={(event: Event) =>
          props.setData({ text: (event.currentTarget as HTMLInputElement).value })
        }
      />
    </div>
  ),
  toMarkdown: (data) => `> [!decision ${data.status}] ${data.text}`,
  fromMarkdown: {
    regExp: /^> \[!decision (proposed|accepted)\] (.*)$/,
    data: (match) => ({
      status: match[1] === "accepted" ? "accepted" : "proposed",
      text: match[2] ?? "",
    }),
  },
});

/** The app's extension around it: a key, a toolbar button and a choice in the block's menu. */
const decisions = defineEditorExtension({
  name: "acme/decisions",
  dependencies: [Decision],
  keys: [
    {
      keys: "Mod+Alt+d",
      run: () => {
        $insertBlock(Decision.$create());
      },
    },
  ],
  toolbar: [
    {
      id: "decision",
      label: "Record a decision",
      icon: () => <span>D</span>,
      run: (editor) => editor.update(() => void $insertBlock(Decision.$create())),
    },
  ],
  blockMenu: [
    {
      id: "decision-status",
      label: "Status",
      $read: (block) =>
        Decision.$is(block)
          ? {
              value: block.getData().status,
              options: [
                { value: "proposed", label: "Proposed" },
                { value: "accepted", label: "Accepted" },
              ],
            }
          : null,
      $choose: (block, value) => {
        if (Decision.$is(block)) {
          block.setData({
            ...block.getData(),
            status: value === "accepted" ? "accepted" : "proposed",
          });
        }
      },
    },
  ],
});

describe("an app's own extension", () => {
  test("its block is offered by /, written and read by its markdown line, and drawn by the renderer", async () => {
    const editor = capture();
    render(() => <BlockEditor label="Page" extensions={[decisions]} onEditor={editor.set} />);
    await settle();
    editor.get().update(() => $getRoot().selectEnd());
    await typeText(editor.get(), "/decision");
    keydown(document.querySelector('[data-slot="rich-text-editor-content"]')!, "Enter");
    await settle();
    expect(document.querySelector('[data-slot="acme-decision"]')).not.toBeNull();
    const markdown = "> [!decision accepted] Ship on Fridays";
    const state = markdownToDocument(markdown, { extensions: [decisions] });
    expect(state.root.children[0]?.type).toBe("acme-decision");
    expect(documentToMarkdown(state, { extensions: [decisions] })).toBe(markdown);
    cleanup();
    render(() => <RichTextRenderer value={state} extensions={[decisions]} />);
    expect(document.querySelector('[data-slot="acme-decision"]')?.textContent).toContain(
      "Accepted",
    );
  });

  test("its key, its toolbar button and its block-menu choice all reach the block", async () => {
    const editor = capture();
    render(() => <BlockEditor label="Page" extensions={[decisions]} onEditor={editor.set} />);
    await settle();
    editor.get().update(() => $getRoot().selectEnd());
    keydown(document.querySelector('[data-slot="rich-text-editor-content"]')!, "d", {
      ctrlKey: true,
      altKey: true,
      code: "KeyD",
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Record a decision" }));
    await settle();
    expect(document.querySelectorAll('[data-slot="acme-decision"]')).toHaveLength(2);
    layOut(editor.get());
    const root = document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
    root.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 10 }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Accepted" }));
    await settle();
    expect(document.querySelector('[data-slot="acme-decision"]')?.textContent).toContain(
      "Accepted",
    );
    expect(editorExtensions(editor.get()).some((one) => one.name === "acme/decisions")).toBe(true);
  });
});

describe("presets", () => {
  test("a built-in is left out by name, and one named as a built-in takes its place", async () => {
    const withoutTables = customizeExtensions(documentPreset, { remove: ["arc/table"] });
    expect(hasExtension(withoutTables, "arc/table")).toBe(false);
    render(() => <RichTextEditor label="Notes" preset={withoutTables} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    expect(screen.queryByRole("menuitem", { name: "Table" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Callout" })).not.toBeNull();

    const mine = defineEditorExtension({
      name: "arc/callout",
      commands: [{ id: "note", label: "My note", run: () => undefined }],
    });
    const resolved = resolveExtensions([...documentPreset, mine]);
    const at = resolved.findIndex((one) => one.name === "arc/callout");
    expect(resolved[at]).toBe(mine);
    expect(resolved.filter((one) => one.name === "arc/callout")).toHaveLength(1);
  });

  test("an extension's dependencies come before it, each once", () => {
    const base = defineEditorExtension({ name: "test/base" });
    const one = defineEditorExtension({ name: "test/one", dependencies: [base] });
    const two = defineEditorExtension({ name: "test/two", dependencies: [base, one] });
    expect(resolveExtensions([two, one]).map((extension) => extension.name)).toEqual([
      "test/base",
      "test/one",
      "test/two",
    ]);
  });

  test("a heavy module loads once, when first asked for, and a failed load is tried again", async () => {
    let loads = 0;
    let fail = true;
    const heavy = defineEditorExtension({
      name: "test/heavy",
      load: async () => {
        loads += 1;
        if (fail) throw new Error("offline");
        return { ready: true };
      },
    });
    expect(loads).toBe(0);
    await expect(loadExtension(heavy)).rejects.toThrow("offline");
    fail = false;
    await Promise.resolve();
    expect(await loadExtension(heavy)).toEqual({ ready: true });
    expect(await loadExtension(heavy)).toEqual({ ready: true });
    expect(loads).toBe(2);
  });
});
