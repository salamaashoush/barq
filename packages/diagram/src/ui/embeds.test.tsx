/**
 * The embeds over the canvas: the embeddable tool from the toolbar, the link
 * editor that validates its link, the iframes placed with the viewport,
 * activated by a click on their centre, and the host's `validateEmbeddable`,
 * `renderEmbeddable` and `embeddableSandbox`.
 */

import { describe, expect, test } from "bun:test";
import { screen } from "@barqjs/testing";

import { canvas, mountEditor, pointer, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";

setupUITests();

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YOUTUBE_EMBED = "https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1";
const SANDBOX =
  "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads";

const embeddable = (id: string, link: string | null, extra: Record<string, unknown> = {}) =>
  ({ type: "embeddable", id, x: 100, y: 100, width: 300, height: 150, link, ...extra }) as never;

const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

/** A hover, without a button pressed. */
const hover = (target: Element, x: number, y: number) =>
  target.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      buttons: 0,
      bubbles: true,
    }),
  );

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const embedOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="embeddable"][data-embed-id="${id}"]`);

/** Draws on the next frame, as the browser would. */
const frame = async () => {
  await wait(40);
  await settle();
};

const element = (api: DiagramEditorApi, id: string) =>
  api.getSceneElements().find((each) => each.id === id)!;

describe("the embeddable tool", () => {
  test("the toolbar's entry draws one, whose link editor embeds a YouTube video", async () => {
    const { api, region } = await mountEditor();
    screen.getByTestId("toolbar-extra-tools").click();
    await settle();
    const entry = screen.getByTestId("toolbar-embeddable");
    expect(entry.getAttribute("aria-disabled")).not.toBe("true");
    entry.click();
    await settle();
    expect(api.getAppState().activeTool.type).toBe("embeddable");

    const target = canvas(region);
    pointer(target, "pointerdown", 100, 100);
    pointer(target, "pointermove", 500, 400);
    pointer(target, "pointerup", 500, 400);
    await settle();
    await settle();
    const [drawn] = api.getSceneElements();
    expect(drawn?.type).toBe("embeddable");
    // nothing to show until it has a link
    expect(embedOf(drawn!.id)).toBeNull();

    const input = screen.getByTestId<HTMLInputElement>("hyperlink-input");
    input.value = YOUTUBE;
    key(input, { key: "Enter", code: "Enter" });
    await settle();
    await frame();
    expect(element(api, drawn!.id).link).toBe(YOUTUBE);
    const iframe = embedOf(drawn!.id)!.querySelector("iframe")!;
    expect(iframe.getAttribute("src")).toBe(YOUTUBE_EMBED);
    expect(iframe.getAttribute("sandbox")).toBe(SANDBOX);
    // the popup offers no removal of an embeddable's link
    expect(screen.queryByTestId("hyperlink-remove")).toBeNull();
  });

  test("a link outside the allow-list says so and stays a placeholder", async () => {
    const { api } = await mountEditor({ initialData: { elements: [embeddable("E", null)] } });
    api.updateScene({
      appState: { selectedElementIds: { E: true }, showHyperlinkPopup: "editor" },
    });
    await settle();
    await settle();
    const input = screen.getByTestId<HTMLInputElement>("hyperlink-input");
    input.value = "https://example.com/page";
    key(input, { key: "Enter", code: "Enter" });
    await settle();
    expect(element(api, "E").link).toBe("https://example.com/page");
    expect(api.getAppState().toast?.message).toEqual({ key: "toast.unableToEmbed" });
    await frame();
    expect(embedOf("E")).toBeNull();
  });
});

describe("the iframes", () => {
  test("placed over their element, following a pan and a zoom", async () => {
    const { api } = await mountEditor({
      initialData: { elements: [embeddable("Y", YOUTUBE, { width: 200, height: 100 })] },
    });
    await frame();
    const container = embedOf("Y")!;
    expect(container.style.width).toBe("200px");
    expect(container.style.transform).toBe(
      "translate(100px, 100px) scale(1) translate(100px, 50px) rotate(0rad) translate(-100px, -50px)",
    );
    api.updateScene({ appState: { scrollX: -50, scrollY: 20, zoom: { value: 1.5 as never } } });
    await frame();
    expect(container.style.transform).toBe(
      "translate(75px, 180px) scale(1.5) translate(100px, 50px) rotate(0rad) translate(-100px, -50px)",
    );
  });

  test("a click on the centre activates one, passing it the pointer", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [embeddable("Y", YOUTUBE)] },
    });
    await frame();
    const target = canvas(region);
    hover(target, 250, 175);
    await settle();
    expect(embedOf("Y")!.getAttribute("data-state")).toBe("hover");
    expect(embedOf("Y")!.textContent).toContain("Click to interact");

    pointer(target, "pointerdown", 250, 175);
    pointer(target, "pointerup", 250, 175);
    await wait(150);
    await frame();
    expect(api.getAppState().activeEmbeddable?.state).toBe("active");
    expect(embedOf("Y")!.getAttribute("data-state")).toBe("active");
    expect(embedOf("Y")!.style.pointerEvents).toBe("auto");

    key(region, { key: "Escape", code: "Escape" });
    await frame();
    expect(api.getAppState().activeEmbeddable).toBeNull();
    expect(embedOf("Y")!.style.pointerEvents).toBe("none");
  });

  test("shown with the canvas alone, without the UI", async () => {
    await mountEditor({ ui: false, initialData: { elements: [embeddable("Y", YOUTUBE)] } });
    await frame();
    expect(embedOf("Y")?.querySelector("iframe")?.getAttribute("src")).toBe(YOUTUBE_EMBED);
  });
});

describe("the host's choices", () => {
  test("validateEmbeddable lets a link in", async () => {
    await mountEditor({
      validateEmbeddable: ["example.com"],
      initialData: {
        elements: [embeddable("A", "https://example.com/page"), embeddable("Y", YOUTUBE)],
      },
    });
    await frame();
    expect(embedOf("A")?.querySelector("iframe")?.getAttribute("src")).toBe(
      "https://example.com/page",
    );
    expect(embedOf("Y")).toBeNull();
  });

  test("renderEmbeddable shows its own element instead of the iframe", async () => {
    await mountEditor({
      renderEmbeddable: (element) =>
        element.id === "A" ? <p data-testid="custom-embed">{element.link}</p> : null,
      initialData: {
        elements: [embeddable("A", YOUTUBE), embeddable("B", YOUTUBE, { y: 400 })],
      },
    });
    await frame();
    expect(embedOf("A")?.querySelector("iframe")).toBeNull();
    expect(screen.getByTestId("custom-embed").textContent).toBe(YOUTUBE);
    expect(embedOf("B")?.querySelector("iframe")).not.toBeNull();
  });

  test("embeddableSandbox sets the iframes' sandbox", async () => {
    await mountEditor({
      embeddableSandbox: "allow-scripts allow-popups",
      initialData: { elements: [embeddable("Y", YOUTUBE)] },
    });
    await frame();
    expect(embedOf("Y")?.querySelector("iframe")?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups",
    );
  });
});
