/**
 * The library without its UI: updates in order, `onLibraryChange`, the
 * `#addLibrary=` install with its URL check and prompt, and a persistence
 * adapter loaded from and saved to.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MIME_TYPES } from "@excalidraw/common";

import { handleLibrary, parseLibraryTokensFromUrl } from "./library.ts";
import { renderEditor, unmountEditors } from "./test-editor.ts";

import type { LibraryItem, LibraryItems } from "../types.ts";

async function fixture(): Promise<Blob> {
  return new Blob(
    [await Bun.file(`${import.meta.dir}/../fixtures/fixture_library.excalidrawlib`).text()],
    {
      type: MIME_TYPES.excalidrawlib,
    },
  );
}

function item(id: string, name?: string): LibraryItem {
  return {
    id,
    status: "unpublished",
    created: 1,
    name,
    elements: [
      {
        type: "rectangle",
        id: `${id}-rect`,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        angle: 0,
        strokeColor: "#000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        index: null,
      } as never,
    ],
  };
}

async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

interface HappyDomWindow {
  happyDOM: HappyDom;
}

interface HappyDom {
  setURL(url: string): void;
}

/** happy-dom's page is `about:blank`, whose history keeps no hash: the page gets an address. */
function setPageUrl(url: string): void {
  return (window as unknown as HappyDomWindow).happyDOM.setURL(url);
}

beforeEach(() => setPageUrl("http://localhost/"));

afterEach(() => {
  unmountEditors();
  setPageUrl("about:blank");
});

describe("Library", () => {
  test("updates resolve in order, merge, and reach onChange once settled", async () => {
    const editor = renderEditor();
    const changes: LibraryItems[] = [];
    editor.library.onChange((items) => changes.push(items));
    void editor.library.setLibrary([item("a")]);
    void editor.library.updateLibrary({ libraryItems: [item("b")], merge: true });
    expect(editor.library.state.status).toBe("loading");
    const latest = await editor.library.getLatestLibrary();
    expect(latest.map((each) => each.id)).toEqual(["b", "a"]);
    expect(editor.library.state).toMatchObject({ status: "loaded", isInitialized: true });
    expect(changes.at(-1)?.map((each) => each.id)).toEqual(["b", "a"]);
  });

  test("a library file is restored, its items published or not as asked", async () => {
    const editor = renderEditor();
    const items = await editor.library.updateLibrary({
      libraryItems: await fixture(),
      defaultStatus: "published",
      openLibraryMenu: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("published");
    expect(items[0]?.elements[0]?.type).toBe("rectangle");
    expect(editor.state.openSidebar).toEqual({ name: "default", tab: "library" });
  });

  test("a prompt the reader declines leaves the library as it was", async () => {
    const editor = renderEditor();
    await editor.library.setLibrary([item("a")]);
    const confirm = spyOn(window, "confirm").mockReturnValue(false);
    const items = await editor.library.updateLibrary({
      libraryItems: [item("b")],
      prompt: true,
      merge: true,
    });
    expect(confirm).toHaveBeenCalledWith("This will add 1 shape(s) to your library. Are you sure?");
    expect(items.map((each) => each.id)).toEqual(["a"]);
    confirm.mockRestore();
  });

  test("initialData's libraryItems join the library, and the API updates it", async () => {
    const editor = renderEditor({ initialData: { libraryItems: [item("a")] } });
    await settle();
    expect((await editor.library.getLatestLibrary()).map((each) => each.id)).toEqual(["a"]);
    await editor.api.updateLibrary({ libraryItems: [item("b")] });
    expect((await editor.library.getLatestLibrary()).map((each) => each.id)).toEqual(["b"]);
    expect(editor.api.id).toBe(editor.id);
  });
});

interface SavedLibrary {
  libraryItems: LibraryItems;
}

describe("handleLibrary", () => {
  test("parses the install URL, current and legacy", () => {
    expect(
      parseLibraryTokensFromUrl({
        hash: "#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Fa.excalidrawlib&token=abc",
        search: "",
      }),
    ).toEqual({ libraryUrl: "https://libraries.excalidraw.com/a.excalidrawlib", idToken: "abc" });
    expect(
      parseLibraryTokensFromUrl({ hash: "", search: "?addLibrary=https://excalidraw.com/a" }),
    ).toEqual({ libraryUrl: "https://excalidraw.com/a", idToken: null });
    expect(parseLibraryTokensFromUrl({ hash: "#room=1", search: "" })).toBeNull();
  });

  test("installs an allowed library without asking when the token is the editor's", async () => {
    const editor = renderEditor();
    const blob = await fixture();
    const fetched: string[] = [];
    const fetchSpy = spyOn(window, "fetch").mockImplementation((async (url: string) => {
      fetched.push(url);
      return new Response(blob);
    }) as typeof fetch);
    const confirm = spyOn(window, "confirm").mockReturnValue(true);
    window.history.replaceState(
      {},
      "",
      `/#addLibrary=${encodeURIComponent("https://libraries.excalidraw.com/lib.excalidrawlib")}&token=${editor.id}`,
    );
    const stop = handleLibrary({ excalidrawAPI: editor.api });
    await settle();
    expect(fetched).toEqual(["https://libraries.excalidraw.com/lib.excalidrawlib"]);
    expect(confirm).not.toHaveBeenCalled();
    const items = await editor.library.getLatestLibrary();
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("published");
    expect(editor.state.openSidebar).toEqual({ name: "default", tab: "library" });
    expect(window.location.hash).not.toContain("addLibrary");
    stop();
    fetchSpy.mockRestore();
    confirm.mockRestore();
  });

  test("asks before installing from another token, and rejects a URL it does not trust", async () => {
    const editor = renderEditor();
    const blob = await fixture();
    const fetchSpy = spyOn(window, "fetch").mockImplementation(
      (async () => new Response(blob)) as unknown as typeof fetch,
    );
    const confirm = spyOn(window, "confirm").mockReturnValue(true);
    window.history.replaceState(
      {},
      "",
      `/#addLibrary=https://libraries.excalidraw.com/a&token=other`,
    );
    const stop = handleLibrary({ excalidrawAPI: editor.api });
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await editor.library.getLatestLibrary()).toHaveLength(1);
    stop();

    window.history.replaceState({}, "", `/#addLibrary=https://evil.example.com/lib`);
    const stopAgain = handleLibrary({ excalidrawAPI: editor.api });
    await settle();
    expect(String(editor.state.errorMessage)).toContain("Invalid or disallowed library URL");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    stopAgain();

    window.history.replaceState(
      {},
      "",
      `/#addLibrary=https://acme.example.com/lib&token=${editor.id}`,
    );
    const stopAllowed = handleLibrary({
      excalidrawAPI: editor.api,
      validateLibraryUrl: (url) => url.startsWith("https://acme.example.com/"),
    });
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    stopAllowed();
    fetchSpy.mockRestore();
    confirm.mockRestore();
  });

  test("loads from the adapter, migrates a legacy store, and saves each change", async () => {
    const editor = renderEditor();
    const saved: LibraryItems[] = [];
    let stored: LibraryItems = [item("stored")];
    const adapter = {
      load: () => ({ libraryItems: stored }),
      save: ({ libraryItems }: SavedLibrary) => {
        stored = libraryItems;
        saved.push(libraryItems);
      },
    };
    let cleared = false;
    const migrationAdapter = {
      load: () => ({ libraryItems: [item("legacy")] }),
      clear: () => {
        cleared = true;
      },
    };
    const stop = handleLibrary({ excalidrawAPI: editor.api, adapter, migrationAdapter });
    await settle();
    expect(cleared).toBe(true);
    expect((await editor.library.getLatestLibrary()).map((each) => each.id).toSorted()).toEqual([
      "legacy",
      "stored",
    ]);
    await editor.library.setLibrary((items) => [item("new"), ...items]);
    await settle();
    expect(saved.at(-1)?.map((each) => each.id)).toContain("new");
    expect(stored.map((each) => each.id)).toContain("legacy");
    stop();
  });
});
