/**
 * Two editors in one room through Yjs: each with its own Y.Doc, updates
 * relayed between them as a provider's server would, and an awareness per
 * client relaying its state to the others, the shape y-protocols has.
 */

import { afterEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { unmountEditors } from "../editor/test-editor.ts";
import { createRoomCipher } from "./transport.ts";
import {
  addImage,
  containsText,
  describeCollaboration,
  element,
  ids,
  joinRoom,
  newRoom,
  rect,
  until,
  type Join,
  type Peer,
} from "./test-collab.ts";
import { Room, type Awareness } from "./test-yjs.ts";
import { createYjsTransport } from "./yjs.ts";

const rooms = new Map<string, Room>();
interface YjsPeerParts {
  doc: Y.Doc;
  awareness: Awareness;
}

const peers: Array<Peer & YjsPeerParts> = [];

afterEach(async () => {
  await Promise.all(peers.splice(0).map((peer) => peer.session.stop()));
  unmountEditors();
  rooms.clear();
});

async function joinWith(...args: Parameters<Join>) {
  const [room, options, elements] = args;
  let shared = rooms.get(room.roomId);
  if (!shared) {
    shared = new Room();
    rooms.set(room.roomId, shared);
  }
  const doc = new Y.Doc();
  const awareness = shared.add(doc);
  const peer = await joinRoom(room, createYjsTransport({ doc, awareness }), options, elements);
  const joined = { ...peer, doc, awareness };
  peers.push(joined);
  return joined;
}

const join: Join = joinWith;

describeCollaboration(join);

describe("the Y.Doc", () => {
  test("holds the elements and the files sealed, and the awareness the presence", async () => {
    const room = await newRoom();
    const alice = await joinWith(room, { username: "Alice", existingRoom: false }, [
      rect("secret-1", 10),
    ]);
    const bob = await joinWith(room, { username: "Bob" });
    const file = addImage(alice, "secret-image", "secret-file");
    await until(() => bob.editor.api.getFiles()[file.id] !== undefined, "the file at Bob's");

    const cipher = createRoomCipher(room.roomKey);
    const elements = bob.doc.getMap<Uint8Array>("elements");
    expect([...elements.keys()].toSorted()).toEqual(["secret-1", "secret-image"]);
    for (const sealed of elements.values()) {
      expect(containsText(sealed, "secret")).toBe(false);
    }
    expect(await cipher.decrypt(elements.get("secret-1")!)).toMatchObject({
      id: "secret-1",
      type: "rectangle",
    });

    const stored = bob.doc.getMap<Uint8Array>("files").get(file.id)!;
    expect(containsText(stored, "base64")).toBe(false);

    const presence = bob.awareness.getStates().get(alice.doc.clientID)?.collab;
    expect(typeof presence).toBe("string");
    expect(presence as string).not.toContain("Alice");
    expect(atob(presence as string)).not.toContain("Alice");
  });

  test("a joining editor reads the room's scene from the document alone", async () => {
    const room = await newRoom();
    const alice = await joinWith(room, { username: "Alice", existingRoom: false }, [
      rect("r1", 10),
      rect("r2", 80),
    ]);
    await until(() => alice.doc.getMap("elements").size === 2, "the scene in the document");
    // the creator gone, the document stays, as a provider's store keeps it
    await alice.session.stop();
    alice.awareness.leave();
    peers.splice(peers.indexOf(alice), 1);

    const carol = await joinWith(room, { username: "Carol" });
    expect(ids(carol)).toEqual(["r1", "r2"]);
  });

  test("a copy that lost a race for the map is written again when it should have won", async () => {
    const room = await newRoom();
    const alice = await joinWith(room, { username: "Alice", existingRoom: false }, [
      rect("r1", 10),
    ]);
    const bob = await joinWith(room, { username: "Bob" });
    const elements = alice.doc.getMap<Uint8Array>("elements");
    const cipher = createRoomCipher(room.roomKey);
    const current = element(alice, "r1")!;
    // an older copy lands in the map over Alice's, as a stale replica's might
    const stale = await cipher.encrypt({ ...current, version: 1, x: 999 });
    bob.doc.transact(() => bob.doc.getMap<Uint8Array>("elements").set("r1", stale));
    function isStale(sealed: Uint8Array | undefined) {
      return sealed !== undefined && sealed.join() === stale.join();
    }
    expect(isStale(elements.get("r1"))).toBe(true);
    await until(() => !isStale(elements.get("r1")), "Alice's copy written back");
    expect(await cipher.decrypt(elements.get("r1")!)).toMatchObject({ id: "r1", x: 10 });
    expect(await cipher.decrypt(bob.doc.getMap<Uint8Array>("elements").get("r1")!)).toMatchObject({
      x: 10,
    });
    expect(element(alice, "r1")!.x).toBe(10);
  });
});
