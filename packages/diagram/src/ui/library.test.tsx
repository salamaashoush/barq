/**
 * The sidebar's library: adding the selection (the context menu, the palette
 * and the sidebar's own button), inserting an item by click and by drag,
 * selecting and removing, import and export of `.excalidrawlib`, publishing to
 * an app's endpoint, docking, and the palette's library items and recents.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { MIME_TYPES } from "@excalidraw/common";
import { ariaViolations, screen, user, waitFor, within } from "@barqjs/testing";

import {
  canvas,
  mountEditor,
  pointer,
  rectangle,
  select,
  settle,
  setupUITests,
} from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";
import type { LibraryItem, LibraryItems } from "../types.ts";

setupUITests();

type PickerWindow = Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
const view = window as PickerWindow;

afterEach(() => {
  delete view.showOpenFilePicker;
  delete view.showSaveFilePicker;
});

function key(target: Element, init: KeyboardEventInit) {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

/** The work a library update and its drawings start, settled. */
async function drain() {
  for (let round = 0; round < 4; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
  }
}

function libraryItem(id: string, name?: string, x = 0): LibraryItem {
  return {
    id,
    status: "unpublished",
    created: 1,
    name,
    elements: [rectangle(`${id}-shape`, x, 0)],
  };
}

async function openLibrary() {
  screen.getByTestId("sidebar-trigger").click();
  await drain();
  return screen.getByTestId("default-sidebar");
}

async function fixtureFile() {
  return new File(
    [await Bun.file(`${import.meta.dir}/../fixtures/fixture_library.excalidrawlib`).text()],
    "fixture.excalidrawlib",
    { type: MIME_TYPES.excalidrawlib },
  );
}

async function contextMenuAt(region: HTMLElement, x: number, y: number) {
  pointer(canvas(region), "pointerdown", x, y, 2);
  canvas(region).dispatchEvent(
    new MouseEvent("contextmenu", {
      clientX: x,
      clientY: y,
      button: 2,
      bubbles: true,
      cancelable: true,
    }),
  );
  pointer(canvas(region), "pointerup", x, y, 2);
  await settle();
  return screen.getByTestId("context-menu");
}

function items(api: DiagramEditorApi): Promise<LibraryItems> {
  return new Promise((resolve) => {
    void api.updateLibrary({ libraryItems: (current) => (resolve(current), current) });
  });
}

describe("adding to the library", () => {
  test("the context menu adds the selection, and onLibraryChange hears it", async () => {
    const changes: LibraryItems[] = [];
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
      onLibraryChange: (next) => changes.push(next),
    });
    await select(api, "A");
    const menu = await contextMenuAt(region, 150, 150);
    await user.click(within(menu).getByRole("menuitem", { name: "Add to library" }));
    await drain();
    expect(changes.at(-1)).toHaveLength(1);
    expect(changes.at(-1)?.[0]?.elements.map((element) => element.id)).toEqual(["A"]);
    expect(api.getAppState().toast?.message).toEqual({ key: "toast.addedToLibrary" });
  });

  test("the command palette adds it, lists named items under Library, and remembers the last", async () => {
    const { api, region } = await mountEditor({
      initialData: {
        elements: [rectangle("A", 100, 100)],
        libraryItems: [libraryItem("star", "Star")],
      },
    });
    await drain();
    await select(api, "A");
    key(region, { key: "/", code: "Slash", ...ctrl });
    await settle();
    let palette = screen.getByRole("dialog", { name: "Command palette" });
    expect(within(palette).getByTestId("library:star").textContent).toContain("Star");
    await user.click(within(palette).getByTestId("action:addToLibrary"));
    await drain();
    expect((await items(api)).map((item) => item.elements[0]?.id)).toEqual(["A", "star-shape"]);

    key(region, { key: "/", code: "Slash", ...ctrl });
    await settle();
    palette = screen.getByRole("dialog", { name: "Command palette" });
    expect(within(palette).getByText("Recently used")).toBeDefined();
    expect(within(palette).getByTestId("recent:action:addToLibrary")).toBeDefined();
    const before = api.getSceneElements().length;
    await user.click(within(palette).getByTestId("library:star"));
    await drain();
    expect(api.getSceneElements()).toHaveLength(before + 1);
  });
});

interface ExportedLibrary {
  type: string;
  version: number;
  libraryItems: LibraryItems;
}

describe("the library sidebar", () => {
  test("opens from its trigger, adds the pending selection, and inserts an item on click", async () => {
    const { api } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    const sidebar = await openLibrary();
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "library" });
    expect(within(sidebar).getByText("No items added yet...")).toBeDefined();
    expect(ariaViolations(sidebar)).toEqual([]);

    await select(api, "A");
    await drain();
    within(sidebar).getByTestId("library-add-pending").click();
    await drain();
    expect(api.getAppState().selectedElementIds).toEqual({});
    const units = within(sidebar).getAllByTestId("library-unit");
    expect(units).toHaveLength(1);
    expect(units[0]?.querySelector("svg")).not.toBeNull();

    within(units[0]!).getByRole("button", { name: "Library item 1" }).click();
    await drain();
    const elements = api.getSceneElements();
    expect(elements).toHaveLength(2);
    const inserted = elements[1]!;
    expect(inserted.id).not.toBe("A");
    // in the middle of the view, the sidebar closing as Excalidraw's does
    expect(inserted.x + inserted.width / 2).toBeCloseTo(640, -1);
    expect(api.getAppState().openSidebar).toBeNull();
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("selects items, shift-selects a range, and removes them once confirmed", async () => {
    const { api } = await mountEditor({
      initialData: {
        libraryItems: [libraryItem("a"), libraryItem("b"), libraryItem("c"), libraryItem("d")],
      },
    });
    await drain();
    const sidebar = await openLibrary();
    const boxes = within(sidebar).getAllByRole("checkbox");
    await user.click(boxes[0]!);
    await settle();
    await user.click(within(sidebar).getAllByRole("checkbox")[2]!, { shiftKey: true });
    await settle();
    expect(within(sidebar).getByTestId("library-selected-count").textContent).toBe("3");

    await user.click(within(sidebar).getByTestId("library-menu-trigger"));
    await settle();
    await user.click(screen.getByTestId("lib-dropdown--remove"));
    await settle();
    expect(screen.getByText("Delete 3 item(s) from library?")).toBeDefined();
    await user.click(screen.getByTestId("confirm-library-remove"));
    await drain();
    expect((await items(api)).map((item) => item.id)).toEqual(["d"]);
  });

  test("loads a .excalidrawlib and exports the library as one", async () => {
    const { api } = await mountEditor();
    const file = await fixtureFile();
    view.showOpenFilePicker = async () => [
      { kind: "file", name: file.name, getFile: async () => file },
    ];
    const written: Blob[] = [];
    view.showSaveFilePicker = async () => ({
      kind: "file",
      name: "library.excalidrawlib",
      createWritable: async () => ({
        write: async (blob: Blob) => {
          written.push(blob);
        },
        close: async () => {},
      }),
    });
    const sidebar = await openLibrary();
    await user.click(within(sidebar).getByTestId("library-menu-trigger"));
    await settle();
    await user.click(screen.getByTestId("lib-dropdown--load"));
    await drain();
    const loaded = await items(api);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.elements[0]).toMatchObject({ type: "rectangle", id: "A" });

    await user.click(within(sidebar).getByTestId("library-menu-trigger"));
    await settle();
    await user.click(screen.getByTestId("lib-dropdown--export"));
    await drain();
    expect(written).toHaveLength(1);
    const exported = JSON.parse(await written[0]!.text()) as ExportedLibrary;
    expect(exported.type).toBe("excalidrawlib");
    expect(exported.version).toBe(2);
    expect(exported.libraryItems.map((item) => item.id)).toEqual(loaded.map((item) => item.id));
    expect(exported.libraryItems[0]?.elements[0]).toMatchObject({ type: "rectangle", width: 50 });
  });

  test("an item dragged onto the canvas lands there, and a dropped library file joins the library", async () => {
    const { api, region } = await mountEditor({
      initialData: { libraryItems: [libraryItem("a")] },
    });
    await drain();
    const sidebar = await openLibrary();
    const dataTransfer = new DataTransfer();
    const start = new DragEvent("dragstart", { bubbles: true });
    Object.defineProperty(start, "dataTransfer", { value: dataTransfer });
    within(sidebar).getByRole("button", { name: "Library item 1" }).dispatchEvent(start);
    expect(JSON.parse(dataTransfer.getData(MIME_TYPES.excalidrawlibIds))).toEqual({
      itemIds: ["a"],
    });

    const drop = new DragEvent("drop", { bubbles: true, cancelable: true });
    // happy-dom's DragEvent drops these from its init
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 300 });
    Object.defineProperty(drop, "clientY", { value: 200 });
    canvas(region).dispatchEvent(drop);
    await drain();
    const [inserted] = api.getSceneElements();
    expect(inserted?.type).toBe("rectangle");
    expect(inserted!.x + inserted!.width / 2).toBeCloseTo(300, -1);

    api.updateScene({ appState: { openSidebar: null } });
    const fileTransfer = new DataTransfer();
    fileTransfer.items.add(await fixtureFile());
    const fileDrop = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(fileDrop, "dataTransfer", { value: fileTransfer });
    canvas(region).dispatchEvent(fileDrop);
    await drain();
    expect(await items(api)).toHaveLength(2);
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "library" });
  });

  test("docked where it fits, it stays open; undocked, a press on the canvas closes it", async () => {
    const { api, region } = await mountEditor({
      UIOptions: { dockedSidebarBreakpoint: 800 },
      initialData: { libraryItems: [libraryItem("a")] },
    });
    await drain();
    let sidebar = await openLibrary();
    within(sidebar).getByTestId("sidebar-dock").click();
    await settle();
    expect(api.getAppState().defaultSidebarDockedPreference).toBe(true);
    expect(screen.getByTestId("editor-ui").style.insetInlineEnd).toBe("316px");
    expect(screen.queryByTestId("sidebar-trigger")).toBeNull();
    within(sidebar).getByRole("button", { name: "Library item 1" }).click();
    await drain();
    expect(api.getAppState().openSidebar).not.toBeNull();

    sidebar = screen.getByTestId("default-sidebar");
    within(sidebar).getByTestId("sidebar-dock").click();
    await settle();
    pointer(canvas(region), "pointerdown", 100, 500);
    pointer(canvas(region), "pointerup", 100, 500);
    await settle();
    expect(api.getAppState().openSidebar).toBeNull();
  });
});

interface SentRequest {
  url: string;
  body: FormData;
}

interface PublishedLibrary {
  libraryItems: LibraryItems;
}

describe("publishing", () => {
  test("without an endpoint the library offers no publishing", async () => {
    await mountEditor({ initialData: { libraryItems: [libraryItem("a", "Arrow")] } });
    await drain();
    const sidebar = await openLibrary();
    await user.click(within(sidebar).getAllByRole("checkbox")[0]!);
    await user.click(within(sidebar).getByTestId("library-menu-trigger"));
    await settle();
    expect(screen.getByTestId("lib-dropdown--export")).toBeDefined();
    expect(screen.queryByTestId("lib-dropdown--publish")).toBeNull();
  });

  test("with an endpoint the selection is sent as Excalidraw's form and marked published", async () => {
    const sent: SentRequest[] = [];
    const fetchSpy = spyOn(window, "fetch").mockImplementation((async (
      url: string,
      init: RequestInit,
    ) => {
      sent.push({ url, body: init.body as FormData });
      return new Response(JSON.stringify({ url: "https://acme.example.com/libraries/arrows" }), {
        status: 200,
      });
    }) as typeof fetch);
    const { api } = await mountEditor({
      initialData: { libraryItems: [libraryItem("a", "Arrow"), libraryItem("b")] },
      libraryPublishEndpoint: "https://acme.example.com/submit",
    });
    await drain();
    const sidebar = await openLibrary();
    const boxes = within(sidebar).getAllByRole("checkbox");
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(within(sidebar).getByTestId("library-menu-trigger"));
    await settle();
    await user.click(screen.getByTestId("lib-dropdown--publish"));
    await drain();
    const dialog = screen.getByTestId("publish-library");
    expect(ariaViolations(dialog)).toEqual([]);
    await user.type(within(dialog).getByPlaceholderText("Name of your library"), "Shapes");
    await user.type(
      within(dialog).getByPlaceholderText(
        "Description of your library to help people understand its usage",
      ),
      "Two shapes",
    );
    await user.type(within(dialog).getByPlaceholderText("Your name or username"), "Salama");
    await user.click(within(dialog).getByTestId("publish-submit"));
    await drain();
    await drain();
    expect(
      screen.getAllByTestId("publish-item-name").map((input) => input.getAttribute("aria-invalid")),
    ).toEqual(["false", "true"]);
    expect(document.body.textContent).toContain("Required");
    expect(sent).toHaveLength(0);

    await user.type(within(dialog).getAllByTestId("publish-item-name")[1]!, "Box");
    await user.click(within(dialog).getByTestId("publish-submit"));
    await waitFor(() => expect(screen.getByTestId("publish-library-success")).toBeDefined(), {
      timeout: 5000,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://acme.example.com/submit");
    expect(sent[0]?.body.get("name")).toBe("Shapes");
    expect(sent[0]?.body.get("authorName")).toBe("Salama");
    expect(sent[0]?.body.get("previewImageType")).toBe("image/jpeg");
    expect((sent[0]!.body.get("previewImage") as File).type).toBe("image/jpeg");
    const lib = JSON.parse(
      await (sent[0]!.body.get("excalidrawLib") as Blob).text(),
    ) as PublishedLibrary;
    expect(lib.libraryItems.map((item) => item.name)).toEqual(["Arrow", "Box"]);
    expect(screen.getByTestId("publish-library-success")).toBeDefined();
    const after = await items(api);
    expect(after.map((item) => [item.name, item.status])).toEqual([
      ["Arrow", "published"],
      ["Box", "published"],
    ]);
    fetchSpy.mockRestore();
  });
});
