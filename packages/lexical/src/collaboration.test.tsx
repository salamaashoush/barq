/**
 * Two editors on one shared Yjs document, each with its own replica and a
 * provider that relays updates between them as a server would, the shape a
 * course editor on a hocuspocus provider has: `LexicalCollaboration` around
 * the composer, a null initial state, and a `CollaborationPlugin` whose
 * provider factory hands back the replica for the document id.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { render } from "@barqjs/web";
import { RichTextExtension } from "@lexical/rich-text";
import type { Provider, UserState } from "@lexical/yjs";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import * as Y from "yjs";

import {
  CollaborationPlugin,
  CollaborationPluginV2__EXPERIMENTAL,
  LexicalCollaboration,
  useCollaborationContext,
} from "./collaboration.tsx";
import { $createCardNode, CardNode, lifecycle } from "./fixtures/card-node.tsx";
import { ContentEditable, LexicalComposer, useLexicalEditor } from "./index.ts";
import { host, settle } from "./test-helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

type Listener = (...args: never[]) => void;

/** Every replica of one document, and the relay between them. */
class Room {
  readonly peers = new Set<Peer>();

  relay(from: Peer, update: Uint8Array): void {
    for (const peer of this.peers) {
      if (peer !== from && peer.connected) Y.applyUpdate(peer.doc, update, this);
    }
  }
}

/** A provider for one replica: what a websocket provider does, minus the socket. */
class Peer implements Provider {
  connected = false;
  connects = 0;
  readonly listeners = new Map<string, Set<Listener>>();
  local: UserState | null = null;
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
    readonly room: Room,
    readonly doc: Y.Doc,
  ) {
    room.peers.add(this);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== room && this.connected) room.relay(this, update);
    });
  }

  connect(): void {
    if (this.connected) return;
    this.connected = true;
    this.connects++;
    for (const peer of this.room.peers) {
      if (peer !== this && peer.connected) {
        Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(peer.doc), this.room);
        Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(this.doc), this.room);
      }
    }
    this.emit("status", { status: "connected" });
    this.emit("sync", true);
  }

  disconnect(): void {
    this.connected = false;
  }

  emit(type: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(type) ?? [])
      (listener as (...a: unknown[]) => void)(...args);
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

interface Client {
  editor: LexicalEditor;
  element: HTMLElement;
  peer: Peer;
  name: () => string;
}

function startClient(room: Room, name: string, shouldBootstrap: boolean): Client {
  let editor!: LexicalEditor;
  let peer!: Peer;
  let contextName = "";
  function Grab() {
    editor = useLexicalEditor();
    contextName = useCollaborationContext().name;
    return null;
  }
  const element = host();
  cleanups.push(
    render(
      () => (
        <LexicalCollaboration>
          <LexicalComposer
            extensions={[RichTextExtension]}
            initialConfig={{
              namespace: "lesson",
              nodes: [CardNode],
              editorState: null,
              onError: (error) => {
                throw error;
              },
            }}
            contentEditable={<ContentEditable class="lesson" />}
          >
            <CollaborationPlugin
              id="lesson-7"
              providerFactory={(id, docs) => {
                const doc = new Y.Doc();
                docs.set(id, doc);
                peer = new Peer(room, doc);
                return peer;
              }}
              shouldBootstrap={shouldBootstrap}
              username={name}
              cursorColor="rgb(0, 0, 150)"
            />
            <Grab />
          </LexicalComposer>
        </LexicalCollaboration>
      ),
      element,
    ),
  );
  return {
    editor,
    element,
    get peer() {
      return peer;
    },
    name: () => contextName,
  };
}

const text = (editor: LexicalEditor): string =>
  editor.getEditorState().read(() => $getRoot().getTextContent());

describe("collaboration", () => {
  test("two editors on one shared document see each other's edits", async () => {
    const room = new Room();
    const first = startClient(room, "Salama", true);
    const second = startClient(room, "Reviewer", false);
    await settle(5);

    expect(first.peer.connects).toBe(1);
    expect(second.peer.connects).toBe(1);
    expect(first.name()).toBe("Salama");
    expect(first.peer.local?.name).toBe("Salama");
    expect(second.peer.local?.name).toBe("Reviewer");
    // Only the first seeded the document, so both hold one empty paragraph.
    expect(first.element.querySelectorAll(".lesson p").length).toBe(1);
    expect(second.element.querySelectorAll(".lesson p").length).toBe(1);

    first.editor.update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("Hello from the first")));
    });
    await settle(5);
    expect(text(second.editor)).toBe("Hello from the first");
    expect(second.element.querySelector(".lesson")?.textContent).toBe("Hello from the first");

    second.editor.update(() => {
      $getRoot().append($createParagraphNode().append($createTextNode("and the second")));
    });
    await settle(5);
    expect(text(first.editor)).toBe("Hello from the first\n\nand the second");
    expect(first.peer.doc.get("root", Y.XmlText).length).toBeGreaterThan(0);
  });

  test("a decorator block made on one editor is drawn by the other's component", async () => {
    const room = new Room();
    const first = startClient(room, "Salama", true);
    const second = startClient(room, "Reviewer", false);
    await settle(5);
    lifecycle.built = 0;
    first.editor.update(() => {
      $getRoot().append($createCardNode("Shared block"));
    });
    await settle(5);
    expect(second.element.querySelector(".card-title")?.textContent).toBe("Shared block");
    expect(lifecycle.built).toBe(2);
  });

  test("undo is the shared document's: it takes back this editor's edit everywhere", async () => {
    const room = new Room();
    const first = startClient(room, "Salama", true);
    const second = startClient(room, "Reviewer", false);
    await settle(5);
    first.editor.update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("draft")));
    });
    await settle(5);
    expect(text(second.editor)).toBe("draft");
    first.editor.dispatchCommand(UNDO_COMMAND, undefined);
    await settle(5);
    expect(text(first.editor)).toBe("");
    expect(text(second.editor)).toBe("");
    first.editor.dispatchCommand(REDO_COMMAND, undefined);
    await settle(5);
    expect(text(second.editor)).toBe("draft");
  });

  test("unmounting disconnects the provider", async () => {
    const room = new Room();
    const [shown, setShown] = createSignal(true);
    let peer!: Peer;
    const element = host();
    cleanups.push(
      render(
        () => (
          <LexicalCollaboration>
            <LexicalComposer extensions={[RichTextExtension]} initialConfig={{ editorState: null }}>
              {shown() ? (
                <CollaborationPlugin
                  id="lesson-8"
                  providerFactory={(id, docs) => {
                    const doc = new Y.Doc();
                    docs.set(id, doc);
                    peer = new Peer(room, doc);
                    return peer;
                  }}
                  shouldBootstrap={true}
                />
              ) : null}
            </LexicalComposer>
          </LexicalCollaboration>
        ),
        element,
      ),
    );
    await settle(5);
    expect(peer.connected).toBe(true);
    setShown(false);
    await settle(5);
    expect(peer.connected).toBe(false);
  });

  test("the second binding syncs two editors over documents the application owns", async () => {
    const room = new Room();
    const start = (
      name: string,
      bootstrap: boolean,
    ): { editor: () => LexicalEditor; element: HTMLElement } => {
      let editor!: LexicalEditor;
      function Grab() {
        editor = useLexicalEditor();
        return null;
      }
      const doc = new Y.Doc();
      const peer = new Peer(room, doc);
      const element = host();
      cleanups.push(
        render(
          () => (
            <LexicalCollaboration>
              <LexicalComposer
                extensions={[RichTextExtension]}
                initialConfig={{ editorState: null, nodes: [CardNode] }}
                contentEditable={<ContentEditable class="lesson" />}
              >
                <CollaborationPluginV2__EXPERIMENTAL
                  id="lesson-9"
                  doc={doc}
                  provider={peer}
                  username={name}
                  __shouldBootstrapUnsafe={bootstrap}
                />
                <Grab />
              </LexicalComposer>
            </LexicalCollaboration>
          ),
          element,
        ),
      );
      return { editor: () => editor, element };
    };
    const first = start("Salama", true);
    const second = start("Reviewer", false);
    await settle(5);
    first.editor().update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("version two")));
    });
    await settle(5);
    expect(text(second.editor())).toBe("version two");
    expect(second.element.querySelector(".lesson")?.textContent).toBe("version two");
  });
});
