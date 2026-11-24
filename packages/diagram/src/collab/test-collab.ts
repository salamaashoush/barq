/**
 * Two headless editors in one room: each with its own container, its own
 * session and transport, and the host's half of following wired as a page
 * would (the session's `userToFollow` handed to the editor).
 */

import { describe, expect, test } from "bun:test";
import { UserIdleState } from "@excalidraw/common";
import { newElementWith, newImageElement } from "@excalidraw/element";

import { getVisibleSceneBounds } from "../viewport.ts";

import { generateEncryptionKey } from "../data/encryption.ts";
import { actionGoToCollaborator } from "../editor/actions/navigate.ts";
import { API, renderEditor } from "../editor/test-editor.ts";
import { createCollaboration } from "./collaboration.ts";

import type { SceneBounds } from "@excalidraw/element";
import type { ExcalidrawElement, ExcalidrawImageElement, FileId } from "@excalidraw/element/types";

import type { DiagramEditor } from "../editor/editor.ts";
import type { BinaryFileData, Collaborator, DataURL, SocketId } from "../types.ts";
import type { Collaboration, CollaborationOptions } from "./collaboration.ts";
import type { CollabTransport } from "./transport.ts";

export interface Peer {
  editor: DiagramEditor;
  session: Collaboration;
}

/** Waits for a condition the network settles, failing with what was expected. */
export const until = async (
  condition: () => boolean,
  what = "the condition",
  timeout = 3000,
): Promise<void> => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const newRoom = async (): Promise<{ roomId: string; roomKey: string }> => ({
  roomId: `room-${crypto.randomUUID()}`,
  roomKey: await generateEncryptionKey(),
});

/** An editor joined to a room: the first starts it with its scene, the rest join it. */
export const joinRoom = async (
  room: { roomId: string; roomKey: string },
  transport: CollabTransport,
  options: Partial<CollaborationOptions> & { username: string },
  elements: readonly ExcalidrawElement[] = [],
): Promise<Peer> => {
  const editor = renderEditor();
  if (elements.length) {
    editor.api.updateScene({ elements, captureUpdate: "NEVER" });
  }
  const session = createCollaboration({
    api: editor.api,
    transport,
    existingRoom: true,
    idleDetection: false,
    ...room,
    ...options,
  });
  session.subscribe((state) => editor.setHost({ userToFollow: state.userToFollow }));
  await session.ready;
  await until(() => session.getState().status === "connected", "the connection");
  return { editor, session };
};

export const rect = (id: string, x: number, y = x): ExcalidrawElement =>
  API.createElement({ id, x, y, width: 50, height: 50 });

export const element = (peer: Peer, id: string): ExcalidrawElement | undefined =>
  peer.editor.api.getSceneElementsIncludingDeleted().find((each) => each.id === id);

export const ids = (peer: Peer): string[] =>
  peer.editor.api.getSceneElements().map((each) => each.id);

/** Replaces an element in a peer's scene as an edit does: undoable, a new version. */
export const edit = (
  peer: Peer,
  id: string,
  update: (element: ExcalidrawElement) => ExcalidrawElement,
): void => {
  peer.editor.api.updateScene({
    elements: peer.editor.api
      .getSceneElementsIncludingDeleted()
      .map((each) => (each.id === id ? update(each) : each)),
    captureUpdate: "IMMEDIATELY",
  });
};

export const add = (peer: Peer, ...elements: ExcalidrawElement[]): void => {
  peer.editor.api.updateScene({
    elements: [...peer.editor.api.getSceneElementsIncludingDeleted(), ...elements],
    captureUpdate: "IMMEDIATELY",
  });
};

/** A pointer event on a peer's interactive canvas, at a client point. */
export const pointer = (
  peer: Peer,
  type: "pointermove" | "pointerdown" | "pointerup",
  x: number,
  y: number,
): void => {
  peer.editor.interactiveCanvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: type === "pointermove" ? -1 : 0,
      buttons: type === "pointerup" ? 0 : type === "pointerdown" ? 1 : 0,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" as DataURL;

/** An image placed on a peer's canvas with its file, pending upload as a new one is. */
export const addImage = (peer: Peer, id: string, fileId: string): BinaryFileData => {
  const file: BinaryFileData = {
    id: fileId as FileId,
    mimeType: "image/png",
    dataURL: ONE_PIXEL_PNG,
    created: Date.now(),
  };
  peer.editor.api.addFiles([file]);
  add(peer, {
    ...newImageElement({
      type: "image",
      x: 300,
      y: 300,
      width: 40,
      height: 40,
      fileId: file.id,
      status: "pending",
    }),
    id,
  });
  return file;
};

/** Whether bytes carry a text in the clear. */
export const containsText = (bytes: Uint8Array, text: string): boolean =>
  new TextDecoder("latin1").decode(bytes).includes(text);

export type Join = (
  room: { roomId: string; roomKey: string },
  options: Partial<CollaborationOptions> & { username: string },
  elements?: readonly ExcalidrawElement[],
) => Promise<Peer>;

const socketOf = (peer: Peer): SocketId => {
  const { socketId } = peer.session.getState();
  if (!socketId) throw new Error("not connected");
  return socketId;
};

const collaborator = (peer: Peer, of: Peer): Collaborator | undefined =>
  peer.editor.api.getAppState().collaborators.get(socketOf(of));

const follow = (follower: Peer, followed: Peer): void => {
  const user = collaborator(follower, followed);
  follower.editor.batch(() =>
    follower.editor.actionManager.executeAction(actionGoToCollaborator, {
      ...user,
      socketId: socketOf(followed),
    }),
  );
};

/** Whether a viewport shows a scene rectangle, centred, the way following fits it. */
const showsBounds = (peer: Peer, bounds: SceneBounds): boolean => {
  const [x1, y1, x2, y2] = getVisibleSceneBounds(peer.editor.api.getAppState());
  const close = (a: number, b: number) => Math.abs(a - b) < 1;
  return (
    close((x1 + x2) / 2, (bounds[0] + bounds[2]) / 2) &&
    close((y1 + y2) / 2, (bounds[1] + bounds[3]) / 2) &&
    x1 <= bounds[0] + 1 &&
    y1 <= bounds[1] + 1 &&
    x2 >= bounds[2] - 1 &&
    y2 >= bounds[3] - 1
  );
};

const scrollTo = (peer: Peer, scrollX: number, scrollY: number): void => {
  peer.editor.batch(() => peer.editor.setState({ scrollX, scrollY }));
};

/**
 * What a session does over any transport: the scene both ways and
 * reconciled, cursors, laser, selections and idle states, following, and
 * images with their files.
 */
export const describeCollaboration = (join: Join): void => {
  describe("the scene", () => {
    test("a joining editor gets the room's scene, and edits go both ways", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [rect("r1", 10)]);
      const bob = await join(room, { username: "Bob" });
      expect(ids(bob)).toEqual(["r1"]);

      add(bob, rect("r2", 200));
      await until(() => ids(alice).includes("r2"), "Bob's rectangle at Alice's");
      const undoable = bob.editor.history.undoStack.length;
      edit(alice, "r1", (each) => newElementWith(each, { x: 123 }));
      await until(() => element(bob, "r1")?.x === 123, "Alice's move at Bob's");
      // a remote change is not the receiver's to undo
      expect(bob.editor.history.undoStack.length).toBe(undoable);
    });

    test("a deletion reaches the others, as a deleted element", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [
        rect("r1", 10),
        rect("r2", 100),
      ]);
      const bob = await join(room, { username: "Bob" });
      edit(alice, "r1", (each) => newElementWith(each, { isDeleted: true }));
      await until(() => element(bob, "r1")?.isDeleted === true, "the deletion at Bob's");
      expect(ids(bob)).toEqual(["r2"]);
    });

    test("z-order follows the fractional indices", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [
        rect("r1", 10),
        rect("r2", 100),
        rect("r3", 200),
      ]);
      const bob = await join(room, { username: "Bob" });
      const [r1, r2, r3] = alice.editor.api.getSceneElementsIncludingDeleted();
      alice.editor.api.updateScene({ elements: [r2!, r3!, r1!], captureUpdate: "IMMEDIATELY" });
      await until(() => ids(bob).join() === "r2,r3,r1", "r1 brought to the front at Bob's");
    });

    test("concurrent edits of one element settle on the same copy everywhere", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [rect("r1", 10)]);
      const bob = await join(room, { username: "Bob" });
      edit(alice, "r1", (each) => newElementWith(each, { x: 111 }));
      edit(bob, "r1", (each) => newElementWith(each, { x: 222 }));
      await until(() => {
        const a = element(alice, "r1");
        const b = element(bob, "r1");
        return !!a && !!b && a.x === b.x;
      }, "the two copies to agree");
      // the lower nonce of the two wins at both
      await sleep(100);
      expect(element(alice, "r1")!.x).toBe(element(bob, "r1")!.x);
      expect([111, 222]).toContain(element(alice, "r1")!.x);
    });

    test("the newer version wins over a concurrent older one", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [rect("r1", 10)]);
      const bob = await join(room, { username: "Bob" });
      // two edits sent as one: version 3 against Bob's 2
      alice.editor.batch(() => {
        edit(alice, "r1", (each) => newElementWith(each, { x: 111 }));
        edit(alice, "r1", (each) => newElementWith(each, { y: 333 }));
      });
      edit(bob, "r1", (each) => newElementWith(each, { x: 222 }));
      expect(element(alice, "r1")!.version).toBeGreaterThan(element(bob, "r1")!.version);
      await until(
        () => element(bob, "r1")?.y === 333 && element(alice, "r1")?.y === 333,
        "Alice's newer copy at both",
      );
      expect(element(bob, "r1")!.x).toBe(111);
      expect(element(alice, "r1")!.x).toBe(111);
    });

    test("an element being drawn here keeps its local copy", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [rect("r1", 10)]);
      const bob = await join(room, { username: "Bob" });
      const drawing = element(bob, "r1")!;
      bob.editor.batch(() => bob.editor.setState({ newElement: drawing as never }));
      edit(alice, "r1", (each) => newElementWith(each, { x: 500 }));
      add(alice, rect("r2", 50));
      await until(() => ids(bob).includes("r2"), "the same update's other element");
      expect(element(bob, "r1")!.x).toBe(10);
    });
  });

  describe("presence", () => {
    test("everyone in the room is a collaborator, this editor's user marked", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      await until(() => alice.session.getState().collaborators.size === 2, "two in the room");
      expect(collaborator(alice, alice)).toEqual({ username: "Alice", isCurrentUser: true });
      expect(collaborator(alice, bob)?.isCurrentUser).toBe(false);

      await bob.session.stop();
      await until(() => alice.session.getState().collaborators.size === 1, "Bob gone");
      expect(alice.editor.api.getAppState().collaborators.has(socketOf(alice))).toBe(true);
    });

    test("a pointer moving on one canvas is a cursor on the other, with the name and the selection", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false }, [rect("r1", 10)]);
      const bob = await join(room, { username: "Bob" });
      alice.editor.batch(() =>
        alice.editor.setState({ selectedElementIds: { r1: true } as never }),
      );
      pointer(alice, "pointermove", 400, 300);
      await until(() => collaborator(bob, alice)?.pointer?.x === 400, "Alice's cursor at Bob's");
      expect(collaborator(bob, alice)).toMatchObject({
        username: "Alice",
        pointer: { x: 400, y: 300, tool: "pointer" },
        button: "up",
        selectedElementIds: { r1: true },
      });
    });

    test("the laser: its tool and its button reach the others", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      alice.editor.api.setActiveTool({ type: "laser" });
      pointer(alice, "pointerdown", 200, 200);
      await sleep(50);
      pointer(alice, "pointermove", 260, 240);
      await until(
        () =>
          collaborator(bob, alice)?.pointer?.tool === "laser" &&
          collaborator(bob, alice)?.button === "down" &&
          collaborator(bob, alice)?.pointer?.x === 260,
        "Alice's laser at Bob's",
      );
      pointer(alice, "pointerup", 260, 240);
      await until(() => collaborator(bob, alice)?.button === "up", "the laser released");
    });

    test("idle and away states reach the others", async () => {
      const room = await newRoom();
      const alice = await join(room, {
        username: "Alice",
        existingRoom: false,
        idleDetection: true,
      });
      const bob = await join(room, { username: "Bob" });
      const hidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
      try {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
        await until(
          () => collaborator(bob, alice)?.userState === UserIdleState.AWAY,
          "Alice away at Bob's",
        );
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
        await until(
          () => collaborator(bob, alice)?.userState === UserIdleState.ACTIVE,
          "Alice back at Bob's",
        );
        expect(collaborator(bob, alice)?.username).toBe("Alice");
      } finally {
        delete (document as { hidden?: boolean }).hidden;
        if (hidden) Object.defineProperty(Document.prototype, "hidden", hidden);
      }
    });
  });

  describe("following", () => {
    test("the follower's viewport shows the followed user's, as it moves, until they stop", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      await until(() => collaborator(bob, alice)?.username === "Alice", "Alice at Bob's");

      follow(bob, alice);
      expect(bob.session.getState().userToFollow).toEqual({
        socketId: socketOf(alice),
        username: "Alice",
      });
      expect(bob.session.getState().viewportStatusFrame?.label?.label).toBe("Following Alice");
      await until(
        () => alice.session.getState().followedBy.has(socketOf(bob)),
        "Bob among Alice's followers",
      );
      scrollTo(alice, -800, -600);
      await until(
        () => showsBounds(bob, getVisibleSceneBounds(alice.editor.api.getAppState())),
        "Bob's viewport on Alice's",
      );
      // moved by the one followed, the viewport keeps following
      expect(bob.session.getState().userToFollow?.socketId).toBe(socketOf(alice));

      // taking the viewport over stops following
      bob.editor.api.scrollToContent();
      await until(() => bob.session.getState().userToFollow === null, "Bob to stop");
      expect(bob.session.getState().viewportStatusFrame).toBe(null);
      await until(() => alice.session.getState().followedBy.size === 0, "Alice unfollowed");
      const before = getVisibleSceneBounds(bob.editor.api.getAppState());
      scrollTo(alice, 400, 300);
      await sleep(100);
      expect(getVisibleSceneBounds(bob.editor.api.getAppState())).toEqual(before);
    });

    test("the frame's close stops following", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      await until(() => collaborator(bob, alice)?.username === "Alice", "Alice at Bob's");
      follow(bob, alice);
      bob.session.getState().viewportStatusFrame?.label?.onClose?.();
      expect(bob.session.getState().userToFollow).toBe(null);
      await until(() => alice.session.getState().followedBy.size === 0, "Alice unfollowed");
    });

    test("the followed user leaving stops following", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      await until(() => collaborator(bob, alice)?.username === "Alice", "Alice at Bob's");
      follow(bob, alice);
      await until(() => alice.session.getState().followedBy.size === 1, "Alice followed");
      await alice.session.stop();
      await until(() => bob.session.getState().userToFollow === null, "Bob to stop");
    });
  });

  describe("files", () => {
    test("an image added on one editor shows on the other with its file", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      const file = addImage(alice, "img", "file-1");
      await until(() => {
        const image = element(alice, "img") as ExcalidrawImageElement | undefined;
        return image?.status === "saved";
      }, "the image saved at Alice's");
      await until(() => bob.editor.api.getFiles()[file.id] !== undefined, "the file at Bob's");
      expect(bob.editor.api.getFiles()[file.id]).toMatchObject({
        id: file.id,
        mimeType: "image/png",
        dataURL: file.dataURL,
      });
      expect((element(bob, "img") as ExcalidrawImageElement).status).toBe("saved");
    });

    test("an image whose file the room does not have is marked errored", async () => {
      const room = await newRoom();
      const alice = await join(room, { username: "Alice", existingRoom: false });
      const bob = await join(room, { username: "Bob" });
      add(alice, {
        ...newImageElement({
          type: "image",
          x: 0,
          y: 0,
          width: 40,
          height: 40,
          fileId: "never-uploaded" as FileId,
          status: "saved",
        }),
        id: "lost",
      });
      await until(
        () => (element(bob, "lost") as ExcalidrawImageElement | undefined)?.status === "error",
        "the image errored at Bob's",
      );
      expect(bob.editor.api.getFiles()["never-uploaded"]).toBeUndefined();
    });
  });
};
