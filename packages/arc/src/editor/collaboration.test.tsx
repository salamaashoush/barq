import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@barqjs/testing";
import type { Provider, UserState } from "@lexical/yjs";
import type { LexicalEditor } from "lexical";
import * as Y from "yjs";

import { EditorCollaboration, collaboratorTone } from "./collaboration.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, settle, textOf, typeText } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

type Listener = (...args: never[]) => void;

/** One replica of a shared document, relaying its updates to the others as a server would. */
class Peer implements Provider {
  connected = false;
  local: UserState | null = null;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly awareness = {
    getLocalState: (): UserState | null => this.local,
    getStates: (): Map<number, UserState> =>
      this.local === null ? new Map() : new Map([[this.doc.clientID, this.local]]),
    off: (): void => undefined,
    on: (): void => undefined,
    setLocalState: (state: UserState | null): void => {
      this.local = state;
    },
    setLocalStateField: (): void => undefined,
  };

  constructor(
    readonly room: Set<Peer>,
    readonly doc: Y.Doc,
  ) {
    room.add(this);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === room || !this.connected) return;
      for (const peer of room)
        if (peer !== this && peer.connected) Y.applyUpdate(peer.doc, update, room);
    });
  }

  connect(): void {
    this.connected = true;
    for (const peer of this.room) {
      if (peer !== this && peer.connected)
        Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(peer.doc), this.room);
    }
    for (const listener of this.listeners.get("sync") ?? [])
      (listener as (synced: boolean) => void)(true);
  }

  disconnect(): void {
    this.connected = false;
  }

  on(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  off(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }
}

function client(room: Set<Peer>, name: string, bootstrap: boolean) {
  const editor = capture();
  let peer: Peer | undefined;
  render(() => (
    <RichTextEditor label={`Notes for ${name}`} collaborative onEditor={editor.set}>
      <EditorCollaboration
        id="notes"
        username={name}
        shouldBootstrap={bootstrap}
        providerFactory={(id, docs) => {
          const doc = new Y.Doc();
          docs.set(id, doc);
          peer = new Peer(room, doc);
          return peer;
        }}
      />
    </RichTextEditor>
  ));
  return { editor: (): LexicalEditor => editor.get(), peer: () => peer };
}

describe("EditorCollaboration", () => {
  test("two editors on one shared document see each other's edits", async () => {
    const room = new Set<Peer>();
    const first = client(room, "Salama", true);
    const second = client(room, "Sam", false);
    await settle(5);
    await typeText(first.editor(), "hello");
    await settle(5);
    expect(textOf(second.editor())).toBe("hello");
    await typeText(second.editor(), " there");
    await settle(5);
    expect(textOf(first.editor())).toBe("hello there");
  });

  test("publishes a cursor in arc's tone for the name, drawn in the editor's own scroller", async () => {
    const room = new Set<Peer>();
    const one = client(room, "Salama", true);
    await settle(5);
    const tone = collaboratorTone("Salama");
    expect(collaboratorTone("Salama")).toBe(tone);
    expect(one.peer()?.local).toMatchObject({ name: "Salama", color: `var(--${tone})` });
    const root = one.editor().getRootElement();
    // A zero-size box at the scroller's top left, the carets' offset parent
    // and positioned ancestor at once, so a caret lands on its text however
    // far the editor has scrolled; checked against a browser's layout.
    const origin = root?.parentElement?.querySelector<HTMLElement>("[data-lexical-cursors]");
    expect(origin?.style.position).toBe("absolute");
    expect([origin?.style.top, origin?.style.left, origin?.style.width]).toEqual([
      "0px",
      "0px",
      "0px",
    ]);
    expect(origin?.firstElementChild?.tagName).toBe("DIV");
    expect(root?.parentElement?.contains(root)).toBe(true);
    expect(one.editor()._config.theme.collaboration).toMatchObject({
      cursor: expect.any(String),
      cursorName: expect.any(String),
    });
  });
});
