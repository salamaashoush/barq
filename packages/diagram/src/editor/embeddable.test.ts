/**
 * Embeds, as Excalidraw's `App` drives them: the embeddable tool, links
 * validated by `validateEmbeddable`, pasted and dropped links, the list of
 * embeds a host renders and the editor places, and their activation by a
 * click on the centre.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS, MIME_TYPES } from "@excalidraw/common";
import {
  isEmbeddableElement,
  newEmbeddableElement,
  newFrameElement,
  newIframeElement,
  newMagicFrameElement,
} from "@excalidraw/element";

import type { ExcalidrawElement, ExcalidrawEmbeddableElement } from "@excalidraw/element/types";

import { createPasteEvent } from "../clipboard.ts";
import { exportToSvg } from "../export.ts";
import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

import type { DiagramEditorOptions } from "./editor.ts";
import type { Embed, EmbedParts } from "./embeds.ts";

afterEach(unmountEditors);

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YOUTUBE_EMBED = "https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1";
const SANDBOX =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads";

const embeddable = (
  id: string,
  link: string | null,
  extra: Partial<ExcalidrawEmbeddableElement> = {},
): ExcalidrawElement => ({
  ...newEmbeddableElement({ type: "embeddable", x: 100, y: 100, width: 300, height: 150 }),
  id,
  link,
  ...extra,
});

const live = () => h().scene.getNonDeletedElements();
const element = (id: string) => h().scene.getNonDeletedElement(id)!;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const settle = async (rounds = 6) => {
  for (let index = 0; index < rounds; index++) await wait(0);
};

/** A host's embeds, as `<DiagramEditor>` renders them: a container, its content and an iframe. */
const mountEmbeds = () => {
  const editor = h();
  const shown = new Map<string, EmbedParts & { detach: () => void }>();
  let list: readonly Embed[] = [];
  editor.onEmbedsChange((embeds) => {
    list = embeds;
    const ids = new Set(embeds.map((embed) => embed.id));
    for (const [id, parts] of shown) {
      if (!ids.has(id)) {
        parts.detach();
        parts.container.remove();
        shown.delete(id);
      }
    }
    for (const embed of embeds) {
      let parts = shown.get(embed.id);
      if (!parts) {
        const container = document.createElement("div");
        const content = document.createElement("div");
        const iframe = document.createElement("iframe");
        content.append(iframe);
        container.append(content);
        editor.container.append(container);
        parts = {
          container,
          content,
          iframe,
          detach: editor.attachEmbed(embed.id, { container, content, iframe }),
        };
        shown.set(embed.id, parts);
      }
      if (embed.src !== null) parts.iframe!.setAttribute("src", embed.src);
      if (embed.srcdoc !== null) parts.iframe!.setAttribute("srcdoc", embed.srcdoc);
      parts.iframe!.setAttribute("sandbox", embed.sandbox);
    }
  });
  return {
    list: () => list,
    get: (id: string) => list.find((embed) => embed.id === id),
    container: (id: string) => shown.get(id)?.container,
    content: (id: string) => shown.get(id)?.content,
  };
};

const mount = (options: Partial<Omit<DiagramEditorOptions, "container">> = {}) => {
  renderEditor(options);
  return mountEmbeds();
};

describe("the embeddable tool", () => {
  test("a drag draws an empty embeddable, selected, with its link editor open", () => {
    mount();
    UI.clickTool("embeddable");
    expect(h().state.activeTool.type).toBe("embeddable");
    mouse.downAt(100, 100);
    mouse.moveTo(400, 300);
    mouse.upAt();
    const [drawn] = live();
    expect(drawn?.type).toBe("embeddable");
    expect([drawn?.x, drawn?.y, drawn?.width, drawn?.height]).toEqual([100, 100, 300, 200]);
    expect(drawn?.link).toBeNull();
    expect(h().state.selectedElementIds).toEqual({ [drawn!.id]: true });
    expect(h().state.showHyperlinkPopup).toBe("editor");
    expect(h().state.activeTool.type).toBe("selection");
    // a placeholder until it has a link that validates
    expect(h().embeds.embedsValidationStatus.get(drawn!.id)).toBe(false);
  });

  test("a click without a drag draws nothing", () => {
    mount();
    UI.clickTool("embeddable");
    mouse.clickAt(200, 200);
    expect(live()).toHaveLength(0);
  });

  test("the link editor validates the link: an allowed one shows, sized as its video", () => {
    const embeds = mount();
    API.setElements([embeddable("E", null, { width: 300, height: 200 })]);
    h().batch(() => h().embeds.submitLink(element("E") as never, YOUTUBE));
    expect(element("E").link).toBe(YOUTUBE);
    expect(h().embeds.embedsValidationStatus.get("E")).toBe(true);
    // a video keeps its width and takes the video's proportions
    expect(element("E").width).toBe(300);
    expect(element("E").height).toBeCloseTo((300 * 315) / 560);
    expect(embeds.get("E")?.src).toBe(YOUTUBE_EMBED);
  });

  test("a link outside the allow-list is kept, with Excalidraw's toast, as a placeholder", () => {
    const embeds = mount();
    API.setElements([embeddable("E", null)]);
    h().batch(() => h().embeds.submitLink(element("E") as never, "https://example.com/page"));
    expect(element("E").link).toBe("https://example.com/page");
    expect(h().embeds.embedsValidationStatus.get("E")).toBe(false);
    expect(h().state.toast).toEqual({ message: { key: "toast.unableToEmbed" }, closable: true });
    expect(embeds.get("E")).toBeUndefined();
  });

  test("Ctrl+K edits a selected embeddable's link", () => {
    mount();
    API.setElements([embeddable("E", YOUTUBE)]);
    API.setSelectedElements([element("E")]);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress(KEYS.K));
    expect(h().state.showHyperlinkPopup).toBe("editor");
  });
});

describe("validateEmbeddable", () => {
  const statusOf = (validateEmbeddable: unknown, link: string) => {
    renderEditor({ host: { validateEmbeddable: validateEmbeddable as never } });
    API.setElements([embeddable("E", link)]);
    const status = h().embeds.embedsValidationStatus.get("E");
    unmountEditors();
    return status;
  };

  test("Excalidraw's allow-list by default", () => {
    expect(statusOf(undefined, YOUTUBE)).toBe(true);
    expect(statusOf(undefined, "https://vimeo.com/123456")).toBe(true);
    expect(statusOf(undefined, "https://gist.github.com/acme/abc123")).toBe(true);
    expect(statusOf(undefined, "https://x.com/acme/status/123")).toBe(true);
    expect(statusOf(undefined, "https://example.com")).toBe(false);
  });

  test("true and false allow every link or none", () => {
    expect(statusOf(true, "https://example.com")).toBe(true);
    expect(statusOf(false, YOUTUBE)).toBe(false);
  });

  test("hostnames and patterns allow those and nothing else", () => {
    expect(statusOf(["example.com"], "https://www.example.com/a")).toBe(true);
    expect(statusOf(["example.com"], YOUTUBE)).toBe(false);
    expect(statusOf(/^https:\/\/docs\./, "https://docs.example.com")).toBe(true);
    expect(statusOf([/acme/, "example.com"], "https://acme.test")).toBe(true);
  });

  test("a function decides, falling back to the allow-list when it returns nothing", () => {
    const decide = (link: string) => (link.includes("example.com") ? true : undefined);
    expect(statusOf(decide, "https://example.com")).toBe(true);
    expect(statusOf(decide, YOUTUBE)).toBe(true);
    expect(statusOf(decide, "https://example.org")).toBe(false);
  });

  test("a new validateEmbeddable validates the embeddables again", () => {
    renderEditor();
    API.setElements([embeddable("E", "https://example.com")]);
    expect(h().embeds.embedsValidationStatus.get("E")).toBe(false);
    h().setHost({ validateEmbeddable: ["example.com"] });
    expect(h().embeds.embedsValidationStatus.get("E")).toBe(true);
  });
});

describe("the embeds a host renders", () => {
  test("valid embeddables and generated iframes, with what they load and their sandbox", () => {
    const embeds = mount({
      host: { validateEmbeddable: (link) => (link.includes("example") ? true : undefined) },
    });
    API.setElements([
      embeddable("Y", YOUTUBE, { x: 0, y: 0 }),
      embeddable("A", "https://example.com/page", { x: 0, y: 200 }),
      embeddable("N", "https://other.test", { x: 0, y: 400 }),
      embeddable("G", "https://gist.github.com/acme/abc123", { x: 400, y: 0 }),
      {
        ...newIframeElement({ type: "iframe", x: 400, y: 300, width: 200, height: 100 }),
        id: "I",
        customData: { generationData: { status: "done", html: "<p>Hi</p>" } },
      },
    ]);
    expect(embeds.list().map((embed) => embed.id)).toEqual(["Y", "A", "G", "I"]);
    // YouTube is trusted with its own origin; others are not
    expect(embeds.get("Y")).toMatchObject({
      src: YOUTUBE_EMBED,
      srcdoc: null,
      sandbox: `allow-same-origin ${SANDBOX}`,
    });
    expect(embeds.get("A")).toMatchObject({ src: "https://example.com/page", sandbox: SANDBOX });
    // a gist is a document of its own
    expect(embeds.get("G")?.src).toBeNull();
    expect(embeds.get("G")?.srcdoc).toContain("https://gist.github.com/acme/abc123.js");
    expect(embeds.get("I")).toMatchObject({
      src: null,
      srcdoc: "<p>Hi</p>",
      sandbox: "allow-scripts",
    });
  });

  test("embeddableSandbox replaces the sandbox, for every link or per link", () => {
    let embeds = mount({ host: { embeddableSandbox: "allow-scripts" } });
    API.setElements([embeddable("Y", YOUTUBE)]);
    expect(embeds.get("Y")?.sandbox).toBe("allow-scripts");
    unmountEditors();
    embeds = mount({
      host: { embeddableSandbox: (link) => (link.includes("youtube") ? "" : SANDBOX) },
    });
    API.setElements([embeddable("Y", YOUTUBE)]);
    expect(embeds.get("Y")?.sandbox).toBe("");
  });

  test("placed over the element at the zoom, rotated, following a pan", () => {
    const embeds = mount();
    API.setElements([embeddable("Y", YOUTUBE, { x: 100, y: 50, width: 200, height: 100 })]);
    h().render();
    const style = embeds.container("Y")!.style;
    expect(style.display).toBe("block");
    expect(style.width).toBe("200px");
    expect(style.height).toBe("100px");
    expect(style.pointerEvents).toBe("none");
    expect(style.transform).toBe(
      "translate(100px, 50px) scale(1) translate(100px, 50px) rotate(0rad) translate(-100px, -50px)",
    );

    API.setAppState({ scrollX: 20, scrollY: -10, zoom: { value: 2 as never } });
    h().render();
    // a scene point (x + scrollX) * zoom
    expect(style.transform).toBe(
      "translate(240px, 80px) scale(2) translate(100px, 50px) rotate(0rad) translate(-100px, -50px)",
    );
    // a video draws at the zoom, scaled back down
    expect(embeds.content("Y")!.style.width).toBe("200%");
    expect(embeds.content("Y")!.style.transform).toBe("scale(0.5)");

    h().batch(() => h().scene.mutateElement(element("Y"), { angle: 1 as never }));
    h().render();
    expect(style.transform).toContain("rotate(1rad)");
  });

  test("shown once in view; hidden, and kept, out of it", () => {
    const embeds = mount();
    API.setElements([embeddable("Y", YOUTUBE, { x: 3000, y: 3000 })]);
    h().render();
    expect(embeds.get("Y")).toBeUndefined();
    API.setAppState({ scrollX: -2900, scrollY: -2900 });
    h().render();
    expect(embeds.get("Y")).toBeDefined();
    expect(embeds.container("Y")!.style.display).toBe("block");
    API.setAppState({ scrollX: 0, scrollY: 0 });
    h().render();
    expect(embeds.get("Y")).toBeDefined();
    expect(embeds.container("Y")!.style.display).toBe("none");
  });

  test("clipped by the frame it is in", () => {
    const embeds = mount();
    API.setElements([
      embeddable("Y", YOUTUBE, { x: 100, y: 100, width: 200, height: 100, frameId: "F" }),
      { ...newFrameElement({ x: 50, y: 50, width: 200, height: 200 }), id: "F" },
    ]);
    h().render();
    expect(embeds.container("Y")!.style.clipPath).toBe(
      "polygon(-50px -50px, 150px -50px, 150px 150px, -50px 150px)",
    );
  });
});

describe("activation", () => {
  const center = { x: 250, y: 175 };

  test("a hover over the centre, then a click there, activates it; Escape ends it", async () => {
    const embeds = mount();
    API.setElements([embeddable("Y", YOUTUBE)]);
    mouse.moveTo(110, 110);
    expect(h().state.activeEmbeddable).toBeNull();
    mouse.moveTo(center.x, center.y);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "hover" });
    expect(embeds.get("Y")?.state).toBe("hover");

    mouse.clickAt(center.x, center.y);
    expect(h().state.activeEmbeddable?.state).not.toBe("active");
    await wait(150);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "active" });
    expect(h().state.activeEmbeddable?.element.id).toBe("Y");
    expect(h().state.selectedElementIds).toEqual({ Y: true });
    h().render();
    expect(embeds.container("Y")!.style.pointerEvents).toBe("auto");

    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h().state.activeEmbeddable).toBeNull();
    h().render();
    expect(embeds.container("Y")!.style.pointerEvents).toBe("none");
  });

  test("a click away deactivates it", async () => {
    mount();
    API.setElements([embeddable("Y", YOUTUBE)]);
    mouse.clickAt(center.x, center.y);
    await wait(150);
    expect(h().state.activeEmbeddable?.state).toBe("active");
    mouse.clickAt(700, 600);
    expect(h().state.activeEmbeddable).toBeNull();
  });

  test("a click off the centre, or with a modifier, selects without activating", async () => {
    mount();
    API.setElements([embeddable("Y", YOUTUBE)]);
    mouse.clickAt(110, 110);
    Keyboard.withModifierKeys({ shift: true }, () => mouse.clickAt(center.x, center.y));
    await wait(150);
    expect(h().state.activeEmbeddable).toBeNull();
  });

  test("a double-click activates it", () => {
    mount();
    API.setElements([embeddable("Y", YOUTUBE)]);
    mouse.clickAt(110, 110);
    mouse.doubleClickAt(110, 110);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "active" });
  });

  test("in view mode a click anywhere on it activates it, and a click away ends it", async () => {
    mount({ viewModeEnabled: true });
    API.setElements([embeddable("Y", YOUTUBE)]);
    mouse.moveTo(110, 110);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "hover" });
    mouse.clickAt(110, 110);
    await wait(150);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "active" });
    mouse.clickAt(700, 600);
    expect(h().state.activeEmbeddable).toBeNull();
    expect(h().state.selectedElementIds).toEqual({});
  });

  test("a generated page is interactive once generated, not while it is", async () => {
    let finish: (html: string) => void = () => {};
    mount({
      host: {
        diagramToCode: {
          generate: () => new Promise((resolve) => (finish = (html) => resolve({ html }))),
        },
      },
    });
    API.setElements([
      { ...API.createElement({ id: "A", x: 0, y: 0, width: 50, height: 50 }), frameId: "M" },
      {
        ...newMagicFrameElement({ x: -50, y: -50, width: 150, height: 150 }),
        id: "M",
      },
    ]);
    const generation = h().magicFrame.generate(element("M") as never, "button");
    const iframe = live().find((each) => each.type === "iframe")!;
    const middle = { x: iframe.x + iframe.width / 2, y: iframe.y + iframe.height / 2 };
    expect(h().embeds.isInteractive(iframe)).toBe(false);
    mouse.clickAt(middle.x, middle.y);
    await wait(150);
    expect(h().state.activeEmbeddable).toBeNull();

    finish("<!DOCTYPE html><html><body>Done</body></html>");
    await generation;
    expect(h().embeds.isInteractive(iframe)).toBe(true);
    mouse.clickAt(700, 700);
    mouse.clickAt(middle.x, middle.y);
    await wait(150);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "active" });
  });
});

describe("fullscreen", () => {
  const generated = () =>
    ({
      ...newIframeElement({ type: "iframe", x: 100, y: 100, width: 300, height: 150 }),
      id: "I",
      customData: { generationData: { status: "done", html: "<p>Hi</p>" } },
    }) as ExcalidrawElement;

  test("a generated page shows full screen, active, until fullscreen ends", async () => {
    mount();
    API.setElements([generated()]);
    const iframe = h().embeds.getIframe(element("I") as never)!;
    const requested: Element[] = [];
    iframe.requestFullscreen = () => {
      requested.push(iframe);
      return Promise.resolve();
    };
    h().embeds.enterFullscreen(element("I") as never);
    expect(requested).toEqual([iframe]);
    expect(h().state.activeEmbeddable).toMatchObject({ state: "active" });
    expect(h().state.selectedElementIds).toEqual({ I: true });
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(h().state.activeEmbeddable).toBeNull();
  });

  test("a refused fullscreen says so", async () => {
    mount();
    API.setElements([generated()]);
    const iframe = h().embeds.getIframe(element("I") as never)!;
    iframe.requestFullscreen = () => Promise.reject(new Error("denied"));
    const warn = console.warn;
    console.warn = () => {};
    try {
      h().embeds.enterFullscreen(element("I") as never);
      await settle();
    } finally {
      console.warn = warn;
    }
    expect(h().state.errorMessage).toEqual({ key: "magicFrame.fullscreenFailed" });
  });
});

describe("pasted and dropped links", () => {
  const paste = async (text: string, plain = false) => {
    h().container.focus();
    if (plain) h().clipboard.onPasteShortcut(new KeyboardEvent("keydown", { shiftKey: true }));
    document.dispatchEvent(createPasteEvent({ types: { [MIME_TYPES.text]: text } }));
    await settle();
  };

  test("a pasted link the embeds allow becomes an embeddable at the pointer, selected", async () => {
    mount();
    mouse.moveTo(300, 200);
    await paste(YOUTUBE);
    const [pasted] = live();
    expect(isEmbeddableElement(pasted)).toBe(true);
    expect(pasted?.link).toBe(YOUTUBE);
    expect([pasted?.x, pasted?.y, pasted?.width, pasted?.height]).toEqual([300, 200, 560, 315]);
    expect(h().state.selectedElementIds).toEqual({ [pasted!.id]: true });
    Keyboard.undo();
    expect(live()).toHaveLength(0);
  });

  test("a link per line pastes an embeddable each, side by side", async () => {
    mount();
    mouse.moveTo(0, 0);
    await paste(`${YOUTUBE}\n\nhttps://vimeo.com/123456`);
    const pasted = live();
    expect(pasted.map((each) => each.type)).toEqual(["embeddable", "embeddable"]);
    expect(pasted[1]!.x).toBe(pasted[0]!.x + pasted[0]!.width + 20);
    expect(Object.keys(h().state.selectedElementIds)).toHaveLength(2);
  });

  test("an embed's code pastes as its link", async () => {
    mount();
    await paste(
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    );
    expect(live()[0]?.link).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  test("a link the embeds do not allow, or a plain paste, is text", async () => {
    mount();
    await paste("https://example.com/page");
    expect(live().map((each) => each.type)).toEqual(["text"]);
    unmountEditors();
    mount();
    await paste(YOUTUBE, true);
    expect(live().map((each) => each.type)).toEqual(["text"]);
    unmountEditors();
    mount();
    await paste(`${YOUTUBE}\nsome words`);
    expect(live().every((each) => each.type === "text")).toBe(true);
  });

  test("validateEmbeddable decides what a paste embeds", async () => {
    mount({ host: { validateEmbeddable: ["example.com"] } });
    await paste("https://example.com/page");
    expect(live().map((each) => each.type)).toEqual(["embeddable"]);
  });

  test("a dropped link becomes an embeddable where it is dropped", async () => {
    mount();
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(MIME_TYPES.text, YOUTUBE);
    const event = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(event, "clientX", { value: 200 });
    Object.defineProperty(event, "clientY", { value: 100 });
    h().container.dispatchEvent(event);
    await settle();
    const [dropped] = live();
    expect(dropped?.type).toBe("embeddable");
    expect([dropped?.x, dropped?.y]).toEqual([200, 100]);
    expect(h().state.selectedElementIds).toEqual({ [dropped!.id]: true });
  });
});

describe("export", () => {
  test("an SVG links an embeddable, or embeds its iframe with renderEmbeddables", async () => {
    const elements = [embeddable("Y", YOUTUBE)];
    const linked = await exportToSvg({ elements, appState: {}, files: null });
    expect(linked.querySelector("a")?.getAttribute("href")).toBe(YOUTUBE);
    expect(linked.querySelector("iframe")).toBeNull();
    const embedded = await exportToSvg({
      elements,
      appState: {},
      files: null,
      renderEmbeddables: true,
    });
    expect(embedded.querySelector("foreignObject iframe")?.getAttribute("src")).toBe(YOUTUBE_EMBED);
  });
});
