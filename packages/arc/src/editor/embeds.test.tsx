import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor } from "@barqjs/testing";
import { $getRoot, type LexicalEditor, type SerializedEditorState } from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { documentToMarkdown, htmlToDocument, markdownToDocument } from "./document.ts";
import { type EmbedData, EmbedBlock, embedExtension, embedHtml, resolveEmbed } from "./embeds.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { capture, hydratesFromServer, settle } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

const FILM: EmbedData = {
  provider: "youtube",
  embedId: "dQw4w9WgXcQ",
  caption: "",
  size: "full",
  markers: [
    { at: 0, title: "Opening" },
    { at: 30, title: "" },
    { at: 95, title: "The bridge" },
  ],
};

function stored(node: object): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [{ type: "embed", version: 1, format: "", ...node }],
    },
  } as unknown as SerializedEditorState;
}

function figure(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="editor-embed"]')!;
}

/** Collects what the page posts to a frame, as the provider's player would hear it. */
function heard(frame: HTMLIFrameElement): unknown[] {
  const posted: unknown[] = [];
  const window = frame.contentWindow ?? ({} as Window);
  if (frame.contentWindow === null)
    Object.defineProperty(frame, "contentWindow", { value: window });
  window.postMessage = ((message: string) =>
    posted.push(JSON.parse(message))) as Window["postMessage"];
  return posted;
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("the providers", () => {
  test("each of fourteen sites is read from the address it hands out, and anything else is refused", () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ["https://youtu.be/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"],
      ["https://vimeo.com/76979871", "vimeo", "76979871"],
      [
        "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
        "loom",
        "0123456789abcdef0123456789abcdef",
      ],
      ["https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view", "google-drive", "1AbCdEfGhIjKlMn"],
      ["https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit", "google-docs", "1AbCdEfGhIjKlMn"],
      [
        "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMn/edit",
        "google-slides",
        "1AbCdEfGhIjKlMn",
      ],
      [
        "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit",
        "google-sheets",
        "1AbCdEfGhIjKlMn",
      ],
      [
        "https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEf/viewform",
        "google-forms",
        "1FAIpQLSdAbCdEf",
      ],
      ["https://www.canva.com/design/DAFabcdefg/AbCdEfGhIj/view", "canva", "DAFabcdefg/AbCdEfGhIj"],
      ["https://www.geogebra.org/m/abcde123", "geogebra", "abcde123"],
      ["https://www.desmos.com/calculator/abcdef1234", "desmos", "calculator/abcdef1234"],
      ["https://phet.colorado.edu/en/simulations/gravity-force-lab", "phet", "gravity-force-lab"],
      ["https://sway.cloud.microsoft/s/AbCdEfGh12345678", "microsoft-365", "sway:AbCdEfGh12345678"],
      ["https://forms.office.com/r/AbCdEf1234", "microsoft-forms", "r/AbCdEf1234"],
    ];
    for (const [address, provider, embedId] of cases) {
      expect([address, resolveEmbed(address)?.provider, resolveEmbed(address)?.embedId]).toEqual([
        address,
        provider,
        embedId,
      ]);
    }
    expect(
      resolveEmbed(
        '<iframe width="560" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=x"></iframe>',
      )?.embedId,
    ).toBe("dQw4w9WgXcQ");
    expect(resolveEmbed("https://example.com/page")).toBeNull();
    expect(resolveEmbed("https://youtu.be/short")).toBeNull();
    expect(resolveEmbed("javascript:alert(1)")).toBeNull();
  });
});

describe("an embed as read", () => {
  test("its frame waits behind a button naming the site, and loads once chosen", async () => {
    render(() => <RichTextRenderer value={stored({ ...FILM, markers: undefined })} />);
    expect(figure().querySelector("iframe")).toBeNull();
    const load = screen.getByRole("button", { name: /Load from YouTube/ });
    expect(load.textContent).toContain("YouTube sees that you opened it");
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(load);
    await settle();
    const frame = figure().querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame?.getAttribute("title")).toBe("YouTube");
    expect(screen.getByRole("link", { name: "Open on YouTube" }).getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  test("a named marker is a chapter: pressed before the frame loads, it loads it and plays from its moment", async () => {
    render(() => <RichTextRenderer value={stored(FILM)} />);
    const chapters = screen.getByRole("list", { name: "Chapters" });
    const buttons = [...chapters.querySelectorAll("button")];
    expect(buttons.map((one) => one.textContent)).toEqual(["0:00Opening", "1:35The bridge"]);
    await user.click(buttons[1]!);
    await settle();
    const frame = figure().querySelector("iframe")!;
    expect(frame.getAttribute("src")).toContain("enablejsapi=1");
    const posted = heard(frame);
    frame.dispatchEvent(new Event("load"));
    expect(posted).toContainEqual({ event: "command", func: "seekTo", args: [95, true] });
    await user.click(buttons[0]!);
    expect(posted).toContainEqual({ event: "command", func: "seekTo", args: [0, true] });
  });

  test("in Arabic a chapter's moment keeps the player's left to right", () => {
    render(() => (
      <Arabic>
        <RichTextRenderer value={stored(FILM)} />
      </Arabic>
    ));
    const time = figure().querySelector('[data-slot="editor-embed-chapters"] [dir="ltr"]');
    expect(time?.textContent).toBe("0:00");
  });

  test("a document an app stored opens unchanged", () => {
    render(() => (
      <RichTextRenderer
        value={stored({ provider: "vimeo", embedId: "76979871", caption: "Walk", size: "medium" })}
      />
    ));
    expect(figure().getAttribute("data-size")).toBe("medium");
    expect(figure().querySelector("figcaption")?.textContent).toBe("Walk");
  });
});

describe("an embed in the editor", () => {
  test("its frame loads at once, and a moment is marked where the provider's player says it is", async () => {
    const editor = capture();
    render(() => <BlockEditor label="Page" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => {
      $getRoot()
        .clear()
        .append(EmbedBlock.$create({ ...FILM, markers: undefined }));
    });
    await settle();
    const frame = figure().querySelector("iframe")!;
    const posted = heard(frame);
    frame.dispatchEvent(new Event("load"));
    expect(posted).toContainEqual({ event: "listening", id: "arc" });
    globalThis.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ event: "infoDelivery", info: { currentTime: 42.7 } }),
        origin: "https://www.youtube-nocookie.com",
        source: frame.contentWindow,
      }),
    );
    // A message from anywhere else is not the player's.
    globalThis.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ event: "infoDelivery", info: { currentTime: 999 } }),
        origin: "https://evil.example",
        source: frame.contentWindow,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Mark this moment" }));
    await settle();
    expect(markersOf(editor.get())).toEqual([{ at: 42, title: "" }]);
  });

  test("an address pasted on an empty line becomes one, its block menu sizes it", async () => {
    const editor = capture();
    render(() => <BlockEditor label="Page" onEditor={editor.set} />);
    await settle();
    expect(resolveEmbed("https://vimeo.com/76979871")?.src).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    editor.get().update(() => {
      $getRoot()
        .clear()
        .append(
          EmbedBlock.$create({
            provider: "vimeo",
            embedId: "76979871",
            caption: "",
            size: "large",
          }),
        );
    });
    await settle();
    expect(figure().getAttribute("data-size")).toBe("large");
  });
});

function markersOf(editor: LexicalEditor) {
  return editor.read(() => {
    const node = $getRoot().getChildren().find(EmbedBlock.$is);
    return node?.getData().markers;
  });
}

describe("an embed written and read", () => {
  test("markdown keeps it as its frame on one line, every field kept, and reads it back", () => {
    const full: EmbedData = {
      ...FILM,
      caption: "The river",
      size: "medium",
      descriptions: "0:05 A map",
    };
    const line = embedHtml(full, "end");
    const read = markdownToDocument(line);
    expect(read.root.children[0]).toMatchObject({ type: "embed", format: "end", ...full });
    expect(documentToMarkdown(read)).toBe(line);
  });

  test("HTML's frames come in by their address, a provider's own embed code included", () => {
    const state = htmlToDocument(
      '<iframe src="https://docs.google.com/presentation/d/1AbCdEfGhIjKlMn/embed"></iframe><iframe src="https://example.com/x"></iframe>',
    );
    expect(state.root.children[0]).toMatchObject({
      type: "embed",
      provider: "google-slides",
      embedId: "1AbCdEfGhIjKlMn",
    });
    expect(state.root.children.filter((one) => one.type === "embed")).toHaveLength(1);
  });

  test("class and classes reach every embed, in the renderer", () => {
    render(() => (
      <RichTextRenderer
        value={stored(FILM)}
        extensions={[
          embedExtension({ class: "acme-embed", classes: { chapters: "acme-chapters" } }),
        ]}
      />
    ));
    expect(figure().classList.contains("acme-embed")).toBe(true);
    expect(figure().querySelector(".acme-chapters")).not.toBeNull();
  });
});

describe("embeds on the server", () => {
  const MARKDOWN = [
    embedHtml(FILM),
    embedHtml({ provider: "desmos", embedId: "calculator/abcdef1234", caption: "", size: "full" }),
  ].join("\n\n");

  test("the renderer draws each embed's button and chapters, and the page hydrates with every node kept", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="editor-embed-load"]')).toHaveLength(2);
    expect(
      result.container.querySelectorAll('[data-slot="editor-embed-chapters"] li'),
    ).toHaveLength(2);
    result.unmount();
  });

  test("the editor takes over the embeds the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    const root = document.querySelector('[data-slot="rich-text-editor-content"]')!;
    await waitFor(() =>
      expect(root.querySelectorAll('[data-slot="editor-embed"] iframe')).toHaveLength(2),
    );
    page.dispose();
  });
});
