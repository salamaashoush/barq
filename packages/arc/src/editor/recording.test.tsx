import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { $getRoot, type LexicalEditor, type SerializedEditorState } from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { documentToMarkdown, htmlToDocument, markdownToDocument } from "./document.ts";
import { provideEditorMedia } from "./media.tsx";
import {
  type RecordingData,
  RecordingBlock,
  chaptersOf,
  clockSeconds,
  markedAt,
  recordingExtension,
  recordingHtml,
  takeRecording,
} from "./recording.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { storedFilesExtension } from "./stored-files.ts";
import { capture, hydratesFromServer, settle } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

const TOUR: RecordingData = {
  src: "https://cdn.example.com/tour.mp4",
  mime: "video/mp4",
  caption: "A tour of the mill",
  size: "full",
};

function stored(node: object): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [{ type: "media", version: 1, format: "", ...node }],
    },
  } as unknown as SerializedEditorState;
}

function figure(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="editor-recording"]')!;
}

function dataOf(editor: LexicalEditor): RecordingData {
  return editor.read(() => {
    const node = $getRoot().getChildren().find(RecordingBlock.$is);
    if (node === undefined) throw new Error("no recording");
    return node.getData();
  });
}

/** Moves the player to a moment, as playing would. */
async function playTo(seconds: number): Promise<void> {
  const video = figure().querySelector("video")!;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    writable: true,
    value: seconds,
  });
  video.dispatchEvent(new Event("timeupdate"));
  await settle();
}

interface Sent {
  files: File[];
  finish: () => void;
}

async function mount(
  data?: RecordingData,
  wrap?: (child: () => unknown) => unknown,
): Promise<[LexicalEditor, Sent]> {
  const editor = capture();
  const waiting: (() => void)[] = [];
  const files: File[] = [];
  function page() {
    return (
      <BlockEditor
        label="Page"
        onEditor={editor.set}
        upload={(file: File) =>
          new Promise<string>((resolve) => {
            files.push(file);
            waiting.push(() => resolve(`https://cdn.example.com/up/${file.name}`));
          })
        }
      />
    );
  }
  render(() => (wrap === undefined ? page() : wrap(page)) as never);
  await settle();
  if (data !== undefined) {
    editor.get().update(() => {
      $getRoot().clear().append(RecordingBlock.$create(data));
    });
    await settle();
  }
  return [editor.get(), { files, finish: () => waiting.splice(0).forEach((one) => one()) }];
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("a recording in the editor", () => {
  test("a video dropped on the editor plays on the player once it is up", async () => {
    const [editor, sent] = await mount();
    editor.update(() => $getRoot().selectEnd());
    editor.dispatchCommand(DRAG_DROP_PASTE, [new File(["v"], "walk.mp4", { type: "video/mp4" })]);
    await settle();
    expect(figure().getAttribute("data-kind")).toBe("video");
    sent.finish();
    await waitFor(() => expect(dataOf(editor).src).toBe("https://cdn.example.com/up/walk.mp4"));
    const player = within(figure()).getByRole("region", { name: "Video" });
    expect(player.querySelector("video source")?.getAttribute("src")).toBe(
      "https://cdn.example.com/up/walk.mp4",
    );
  });

  test("moments are marked where the player stands, named, moved by their clock or to now, and removed", async () => {
    const [editor] = await mount(TOUR);
    await playTo(65.4);
    await user.click(screen.getByRole("button", { name: "Mark this moment" }));
    await settle();
    await playTo(12);
    await user.click(screen.getByRole("button", { name: "Mark this moment" }));
    await settle();
    // A second press at the same moment marks nothing more.
    await user.click(screen.getByRole("button", { name: "Mark this moment" }));
    await settle();
    expect(dataOf(editor).markers).toEqual([
      { at: 12, title: "" },
      { at: 65, title: "" },
    ]);
    await user.type(
      screen.getByRole("textbox", { name: "Name of the moment at 1:05" }),
      "The wheel",
    );
    const clock = screen.getByRole<HTMLInputElement>("textbox", { name: "Moment at 0:12" });
    await user.clear(clock);
    await user.type(clock, "1:30");
    clock.blur();
    await settle();
    expect(dataOf(editor).markers?.map((one) => one.at)).toEqual([65, 90]);
    await playTo(20);
    const rows = document.querySelectorAll('[data-slot="recording-marker"]');
    await user.click(
      within(rows[1] as HTMLElement).getByRole("button", { name: "Move to where the player is" }),
    );
    await settle();
    expect(dataOf(editor).markers).toEqual([
      { at: 20, title: "" },
      { at: 65, title: "The wheel" },
    ]);
    await user.click(screen.getByRole("button", { name: "Remove the moment at 0:20" }));
    await settle();
    expect(dataOf(editor).markers).toEqual([{ at: 65, title: "The wheel" }]);
    // The named ones are the player's chapters.
    expect(within(figure()).getByRole("button", { name: "Chapters" })).toBeDefined();
  });

  test("keys typed in its fields are the fields': the editor's shortcuts leave them alone", async () => {
    const [editor] = await mount({ ...TOUR, markers: [{ at: 10, title: "" }] });
    const field = screen.getByRole("textbox", { name: "Name of the moment at 0:10" });
    field.focus();
    const duplicate = new KeyboardEvent("keydown", {
      key: "d",
      code: "KeyD",
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(duplicate);
    await settle();
    expect(editor.read(() => $getRoot().getChildren().filter(RecordingBlock.$is))).toHaveLength(1);
    expect(duplicate.defaultPrevented).toBe(false);
  });

  test("captions, an audio description and a transcript are written beside it, the captions stored as a file", async () => {
    const [editor, sent] = await mount(TOUR);
    await user.click(screen.getByRole("button", { name: "Captions, description and transcript" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Add a line" }));
    await settle();
    await user.type(
      screen.getByRole("textbox", { name: "Words of line 1" }),
      "Welcome to the mill",
    );
    await user.click(screen.getByRole("button", { name: "Save captions" }));
    await settle();
    expect(sent.files[0]?.name.endsWith(".vtt")).toBe(true);
    sent.finish();
    await waitFor(() =>
      expect(dataOf(editor).captionsSrc).toMatch(/^https:\/\/cdn\.example\.com\/up\//),
    );
    expect(dataOf(editor).captionsLang).toBeDefined();
    // Saved captions end the dialog; the other words are a press away again.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Captions, description and transcript" }));
    await settle();
    await user.click(screen.getByRole("tab", { name: "Transcript" }));
    await settle();
    await user.type(screen.getByRole("textbox", { name: "Transcript" }), "Welcome to the mill.");
    await settle();
    expect(dataOf(editor).transcript).toBe("Welcome to the mill.");
    await user.click(screen.getByRole("tab", { name: "Audio description" }));
    await settle();
    await user.type(
      screen.getByRole("textbox", { name: "Audio description" }),
      "0:05 The wheel turns",
    );
    await settle();
    expect(dataOf(editor).descriptions).toBe("0:05 The wheel turns");
  });

  test("in Arabic a moment's clock reads Arabic digits, and the list keeps the player's left to right", async () => {
    const [editor] = await mount({ ...TOUR, markers: [{ at: 10, title: "" }] }, (page) => (
      <Arabic>{page() as never}</Arabic>
    ));
    const clock = screen.getByRole<HTMLInputElement>("textbox", { name: "Moment at 0:10" });
    expect(clock.getAttribute("dir")).toBe("ltr");
    await user.clear(clock);
    await user.type(clock, "٢:٠٥");
    clock.blur();
    await settle();
    expect(dataOf(editor).markers?.[0]?.at).toBe(125);
    expect(clockSeconds("1:02:05")).toBe(3725);
    expect(clockSeconds("1:75")).toBeNull();
    expect(markedAt([{ at: 3, title: "" }], 3)).toHaveLength(1);
  });
});

describe("recording in the page", () => {
  test("Insert opens the recorder for a sound or a video, and a clip used lands as a recording", async () => {
    const [editor, sent] = await mount();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Record video" }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Record video" });
    expect(dialog.querySelector('[data-slot="clip-recorder"]')?.getAttribute("data-kind")).toBe(
      "video",
    );
    editor.update(() => $getRoot().selectEnd());
    takeRecording(editor, {
      blob: new Blob(["x"], { type: "audio/webm;codecs=opus" }),
      url: "blob:clip",
      mimeType: "audio/webm;codecs=opus",
      duration: 3,
    });
    await settle();
    expect(dataOf(editor).mime).toBe("audio/webm");
    expect(sent.files[0]?.name).toMatch(/^audio-.+\.webm$/);
  });
});

describe("a recording as read", () => {
  test("its captions, chapters, audio description and transcript reach the reader", async () => {
    render(() => (
      <RichTextRenderer
        value={stored({
          ...TOUR,
          captionsSrc: "https://cdn.example.com/tour.vtt",
          captionsLang: "en",
          markers: [
            { at: 0, title: "The gate" },
            { at: 40, title: "" },
            { at: 65, title: "The wheel" },
          ],
          descriptions: "0:05 The wheel turns",
          transcript: "Welcome to the mill.",
        })}
      />
    ));
    const track = figure().querySelector("track");
    expect(track?.getAttribute("srclang")).toBe("en");
    expect(track?.getAttribute("src")).toBe("https://cdn.example.com/tour.vtt");
    expect(
      chaptersOf([
        { at: 40, title: " " },
        { at: 0, title: "The gate" },
      ]),
    ).toEqual([{ start: 0, title: "The gate" }]);
    expect(screen.getByRole("button", { name: "Audio description" })).toBeDefined();
    const transcript = figure().querySelector('[data-slot="editor-recording-transcript"]');
    expect(transcript?.textContent).toContain("Welcome to the mill.");
    await user.click(screen.getByRole("button", { name: "Chapters" }));
    await settle();
    const chapters = screen.getAllByRole("menuitemradio").map((one) => one.textContent ?? "");
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toContain("The gate");
    expect(chapters[1]).toContain("The wheel");
    await user.keyboard("{Escape}");
    await settle();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a sound draws an audio player, with no audio description", () => {
    render(() => (
      <RichTextRenderer
        value={stored({ src: "/talk.mp3", mime: "audio/mpeg", caption: "", size: "medium" })}
      />
    ));
    expect(figure().getAttribute("data-kind")).toBe("audio");
    expect(figure().querySelector("audio")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Audio description" })).toBeNull();
  });

  test("a document an app stored, keeping the recording and its captions by id, opens unchanged", () => {
    function Page() {
      provideEditorMedia({ fileUrl: (id) => `https://files.example.com/${id}` });
      return (
        <RichTextRenderer
          value={stored({
            fileId: "v-1",
            mime: "video/mp4",
            caption: "",
            size: "large",
            captionsFileId: "c-1",
            captionsLang: "ar",
          })}
        />
      );
    }
    render(() => <Page />);
    expect(figure().querySelector("video source")?.getAttribute("src")).toBe(
      "https://files.example.com/v-1",
    );
    expect(figure().querySelector("track")?.getAttribute("src")).toBe(
      "https://files.example.com/c-1",
    );
  });
});

describe("a recording written and read", () => {
  test("markdown keeps it as one line, its words and markers kept, and reads it back", () => {
    const full: RecordingData = {
      ...TOUR,
      size: "medium",
      transcript: "Line one.\nLine two.",
      descriptions: "0:05 The wheel turns",
      markers: [{ at: 65, title: "The wheel" }],
      captionsSrc: "https://cdn.example.com/tour.vtt",
      captionsLang: "en",
    };
    const line = recordingHtml(full, "end");
    expect(line).not.toContain("\n");
    const read = markdownToDocument(line);
    expect(read.root.children[0]).toMatchObject({ type: "media", format: "end", ...full });
    expect(documentToMarkdown(read)).toBe(line);
  });

  test("HTML's video and audio come in as recordings, a kept file's by its id", () => {
    const state = htmlToDocument(
      `<video src="acme-file:v-9" data-mime="video/mp4"></video>
       <audio><source src="https://example.com/talk.mp3" type="audio/mpeg"></audio>`,
      { extensions: [storedFilesExtension({ scheme: "acme-file:" })] },
    );
    expect(state.root.children[0]).toMatchObject({
      type: "media",
      fileId: "v-9",
      mime: "video/mp4",
    });
    expect(state.root.children[1]).toMatchObject({
      type: "media",
      src: "https://example.com/talk.mp3",
      mime: "audio/mpeg",
    });
  });

  test("class and classes reach every recording, in the renderer", () => {
    render(() => (
      <RichTextRenderer
        value={stored(TOUR)}
        extensions={[
          recordingExtension({ class: "acme-recording", classes: { caption: "acme-caption" } }),
        ]}
      />
    ));
    expect(figure().classList.contains("acme-recording")).toBe(true);
    expect(figure().querySelector(".acme-caption")?.textContent).toBe("A tour of the mill");
  });
});

describe("recordings on the server", () => {
  const MARKDOWN = [
    recordingHtml({ ...TOUR, markers: [{ at: 0, title: "Start" }] }),
    recordingHtml({ src: "/talk.mp3", mime: "audio/mpeg", caption: "A talk", size: "small" }),
  ].join("\n\n");

  test("the renderer draws each recording and the page hydrates with every node kept", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="editor-recording"]')).toHaveLength(2);
    expect(result.container.querySelector("video")).not.toBeNull();
    result.unmount();
  });

  test("the editor takes over the recordings the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    const root = document.querySelector('[data-slot="rich-text-editor-content"]')!;
    await waitFor(() =>
      expect(root.querySelectorAll('[data-slot="editor-recording"]')).toHaveLength(2),
    );
    expect(root.hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
