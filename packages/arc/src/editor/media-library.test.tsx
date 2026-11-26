import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $setSelection,
  type LexicalEditor,
  PASTE_COMMAND,
} from "lexical";

import { BlockEditor } from "./block-editor.tsx";
import { type EditorMedia, type KeptPicture, provideEditorMedia } from "./media.tsx";
import { commonsFile, commonsPicture } from "./media-library.tsx";
import { ImageBlock } from "./picture.tsx";
import { capture, settle } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

interface WithMediaProps {
  media: EditorMedia;
  children: Child;
}

function WithMedia(props: WithMediaProps) {
  provideEditorMedia(props.media);
  return <>{props.children}</>;
}

async function mount(media: EditorMedia): Promise<LexicalEditor> {
  const editor = capture();
  render(() => (
    <WithMedia media={media}>
      <BlockEditor label="Page" onEditor={editor.set} />
    </WithMedia>
  ));
  await settle();
  editor.get().update(() => $getRoot().selectEnd());
  await settle();
  return editor.get();
}

function blocks(editor: LexicalEditor): Record<string, unknown>[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .filter((one) => one.getType() !== "paragraph")
      .map((one) => one.exportJSON() as Record<string, unknown>),
  );
}

const ANSWER = {
  query: {
    pages: [
      {
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/River.jpg",
            thumburl:
              "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/River.jpg/1600px-River.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:River.jpg",
            extmetadata: {
              ImageDescription: { value: "A <b>river</b> in spring" },
              Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
            },
          },
        ],
      },
    ],
  },
};

describe("the app's media library", () => {
  test("Insert offers it where the app has one, and what is chosen lands as the block of its kind", async () => {
    const editor = await mount({
      library: {
        choose: () =>
          Promise.resolve([
            {
              fileId: "p-1",
              name: "river.jpg",
              mime: "image/jpeg",
              alt: "A river",
              caption: "May",
            },
            { fileId: "f-2", name: "plan.pdf", mime: "application/pdf", bytes: 1200 },
          ]),
      },
    });
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "From the library" }));
    await waitFor(() => expect(blocks(editor)).toHaveLength(2));
    expect(blocks(editor)).toEqual([
      expect.objectContaining({ type: "image", fileId: "p-1", alt: "A river", caption: "May" }),
      expect.objectContaining({ type: "file", fileId: "f-2", name: "plan.pdf", bytes: 1200 }),
    ] as unknown as Record<string, unknown>[]);
    cleanup();
    await mount({});
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    expect(screen.queryByRole("menuitem", { name: "From the library" })).toBeNull();
  });

  test("a picture's block menu keeps it in the library, with its words and credit", async () => {
    const kept: KeptPicture[] = [];
    const editor = await mount({
      library: {
        choose: () => Promise.resolve(null),
        keep: (picture) => {
          kept.push(picture);
          return Promise.resolve();
        },
      },
    });
    editor.update(() => {
      const picture = ImageBlock.$create({
        src: "https://cdn.example.com/river.jpg",
        alt: "A river",
        caption: "",
        size: "full",
        credit: { author: "Jane Doe", licence: "CC BY 4.0" },
      });
      $getRoot().clear().append(picture, $createParagraphNode());
      const selection = $createNodeSelection();
      selection.add(picture.getKey());
      $setSelection(selection);
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Keep in the library" }));
    await waitFor(() => expect(kept).toHaveLength(1));
    expect(kept[0]).toMatchObject({ alt: "A river", credit: { author: "Jane Doe" } });
  });
});

describe("picture search", () => {
  test("open pictures are found by words and put in with their credit, copied first where the app takes them", async () => {
    const asked: string[] = [];
    const editor = await mount({
      pictures: {
        search: (query) => {
          asked.push(query);
          return Promise.resolve([
            {
              id: "1",
              label: "Owl",
              thumb: "https://pictures.example.com/owl-small.png",
              full: "https://pictures.example.com/owl.png",
              alt: "A barn owl",
              credit: { author: "A. Maker", licence: "CC0 1.0" },
            },
          ]);
        },
        take: () => Promise.resolve({ fileId: "copied-owl" }),
      },
    });
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Find a picture" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByRole("searchbox", { name: "What it shows" }), "بومة");
    await user.click(dialog.getByRole("button", { name: "Search" }));
    await settle();
    expect(asked).toEqual(["بومة"]);
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(dialog.getByRole("button", { name: /A barn owl/ }));
    await waitFor(() =>
      expect(blocks(editor)[0]).toMatchObject({
        type: "image",
        fileId: "copied-owl",
        alt: "A barn owl",
        credit: { author: "A. Maker", licence: "CC0 1.0" },
      }),
    );
  });
});

describe("Wikimedia Commons", () => {
  test("a file page, a picture opened from an article, or the picture itself names the file", () => {
    expect(commonsFile("https://commons.wikimedia.org/wiki/File:River_in_May.jpg")).toEqual({
      api: "https://commons.wikimedia.org/w/api.php",
      title: "File:River in May.jpg",
    });
    expect(commonsFile("https://ar.wikipedia.org/wiki/Nile#/media/File:Nile.jpg")).toEqual({
      api: "https://ar.wikipedia.org/w/api.php",
      title: "File:Nile.jpg",
    });
    expect(
      commonsFile(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/River.jpg/800px-River.jpg",
      )?.title,
    ).toBe("File:River.jpg");
    expect(commonsFile("https://example.com/wiki/File:River.jpg")).toBeNull();
    expect(commonsFile("http://commons.wikimedia.org/wiki/File:River.jpg")).toBeNull();
  });

  test("a link pasted on an empty line becomes the picture, its author and licence its credit", async () => {
    const original = globalThis.fetch;
    const fetched: string[] = [];
    globalThis.fetch = ((address: string) => {
      fetched.push(address);
      return Promise.resolve(new Response(JSON.stringify(ANSWER)));
    }) as typeof fetch;
    try {
      const editor = await mount({});
      const data = new DataTransfer();
      data.setData("text/plain", "https://commons.wikimedia.org/wiki/File:River.jpg");
      editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent("paste", { clipboardData: data }));
      await waitFor(() => expect(blocks(editor)).toHaveLength(1));
      expect(fetched[0]).toContain("titles=File%3ARiver.jpg");
      expect(blocks(editor)[0]).toMatchObject({
        type: "image",
        src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/River.jpg/1600px-River.jpg",
        alt: "A river in spring",
        credit: {
          author: "Jane Doe",
          licence: "CC BY-SA 4.0",
          licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
          source: "https://commons.wikimedia.org/wiki/File:River.jpg",
        },
      });
      expect(commonsPicture({ query: { pages: [{ missing: true }] } })).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});
