import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { type Child, Show, createSignal } from "@barqjs/core";
import { cleanup, render, screen, waitFor } from "@barqjs/testing";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { $getRoot, type LexicalEditor, type SerializedEditorState } from "lexical";

import { type EditorMedia, provideEditorMedia } from "./media.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, settle, typeText } from "./test-editor.ts";

beforeAll(() => {
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => undefined;
});
afterAll(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

interface Saved {
  value?: SerializedEditorState;
}

interface WithMediaProps {
  media: EditorMedia;
  children: Child;
}

function WithMedia(props: WithMediaProps) {
  provideEditorMedia(props.media);
  return <>{props.children}</>;
}

function chart(bytes = "x"): File {
  return new File([bytes], "chart.png", { type: "image/png" });
}

function types(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getType()),
  );
}

function firstData(editor: LexicalEditor, type: string): Record<string, unknown> {
  return editor.read(() => {
    const node = $getRoot()
      .getChildren()
      .find((one) => one.getType() === type);
    const json: Record<string, unknown> = node?.exportJSON() ?? {};
    return json;
  });
}

describe("an upload refused", () => {
  test("a service's refusal reads in words, an app's own code in the app's", async () => {
    const editor = capture();
    let refusal = "file.infected";
    render(() => (
      <WithMedia
        media={{
          uploadRefusal: (code, file) =>
            code === "acme.quota" ? `No room for ${file.name}` : undefined,
        }}
      >
        <RichTextEditor
          label="Notes"
          onEditor={editor.set}
          upload={() => Promise.reject(new Error(refusal))}
        />
      </WithMedia>
    ));
    await settle();
    await typeText(editor.get(), "Before");
    editor.get().dispatchCommand(DRAG_DROP_PASTE, [chart()]);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "chart.png was refused: it may hold a virus",
      ),
    );
    refusal = "acme.quota";
    screen.getByRole("button", { name: "Retry chart.png" }).click();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("No room for chart.png"),
    );
  });

  test("an empty file is refused before it is sent", async () => {
    const editor = capture();
    let sent = 0;
    render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        upload={() => {
          sent++;
          return Promise.resolve("https://cdn.example.com/x");
        }}
      />
    ));
    await settle();
    await typeText(editor.get(), "Before");
    editor.get().dispatchCommand(DRAG_DROP_PASTE, [chart("")]);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("chart.png is empty"));
    expect(sent).toBe(0);
  });
});

describe("uploads on their way", () => {
  test("leaving the page asks first while a file is on its way, and not once it is up", async () => {
    const editor = capture();
    let finish: () => void = () => undefined;
    render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        upload={() =>
          new Promise<string>((resolve) => {
            finish = () => resolve("https://cdn.example.com/chart.png");
          })
        }
      />
    ));
    await settle();
    await typeText(editor.get(), "Before");
    editor.get().dispatchCommand(DRAG_DROP_PASTE, [chart()]);
    await settle();
    const leaving = new Event("beforeunload", { cancelable: true });
    globalThis.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    finish();
    await waitFor(() =>
      expect(firstData(editor.get(), "image").src).toBe("https://cdn.example.com/chart.png"),
    );
    await settle();
    const later = new Event("beforeunload", { cancelable: true });
    globalThis.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  test("uploads a reload cut off are finished and land at the end of the document", async () => {
    const editor = capture();
    const report = new File(["%PDF"], "report.pdf", { type: "application/pdf" });
    let discarded = 0;
    render(() => (
      <WithMedia
        media={{
          unfinished: () =>
            Promise.resolve([
              {
                file: report,
                resume: () => Promise.resolve("https://cdn.example.com/report.pdf"),
                discard: () => {
                  discarded++;
                  return Promise.resolve();
                },
              },
            ]),
        }}
      >
        <RichTextEditor
          label="Notes"
          defaultMarkdown="Already written"
          onEditor={editor.set}
          upload={() => Promise.reject(new Error("not this way"))}
        />
      </WithMedia>
    ));
    await waitFor(() => expect(types(editor.get())).toEqual(["paragraph", "file"]));
    await waitFor(() =>
      expect(firstData(editor.get(), "file")).toMatchObject({
        name: "report.pdf",
        src: "https://cdn.example.com/report.pdf",
      }),
    );
    expect(discarded).toBe(0);
  });

  test("a field's editor started again takes over the files still on their way", async () => {
    let finish: () => void = () => undefined;
    const [round, setRound] = createSignal(1);
    const first = capture();
    const second = capture();
    const saved: Saved = {};
    function upload(): Promise<string> {
      return new Promise<string>((resolve) => {
        finish = () => resolve("https://cdn.example.com/chart.png");
      });
    }
    render(() => (
      <Show
        when={round() === 1}
        fallback={
          <RichTextEditor
            label="Notes"
            fieldId="body"
            defaultValue={saved.value}
            onEditor={second.set}
            upload={upload}
          />
        }
      >
        <RichTextEditor label="Notes" fieldId="body" onEditor={first.set} upload={upload} />
      </Show>
    ));
    await settle();
    await typeText(first.get(), "Before");
    first.get().dispatchCommand(DRAG_DROP_PASTE, [chart()]);
    await settle();
    saved.value = first.get().getEditorState().toJSON();
    expect(firstData(first.get(), "image").uploadId).toBeDefined();
    // The page starts its editor again, as a new document's does once first saved.
    setRound(2);
    await settle();
    finish();
    await waitFor(() =>
      expect(firstData(second.get(), "image")).toMatchObject({
        src: "https://cdn.example.com/chart.png",
      }),
    );
    expect(firstData(second.get(), "image").uploadId).toBeUndefined();
  });
});
