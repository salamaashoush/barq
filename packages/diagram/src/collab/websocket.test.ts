/**
 * Two editors in one room through a real room server, as excalidraw.com's
 * collaboration runs: `createWebSocketRooms` behind `serveBarq` on a free
 * port, a `createWebSocketTransport` and a session per editor.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { newElementWith } from "@excalidraw/element";
import { createWebSocketRooms, upgradeWebSocket } from "@barqjs/start";
import { serveBarq } from "@barqjs/start/serve";

import { decompressData } from "../data/encode.ts";
import { unmountEditors } from "../editor/test-editor.ts";
import { createRoomCipher } from "./transport.ts";
import { createWebSocketTransport } from "./websocket.ts";
import {
  addImage,
  containsText,
  describeCollaboration,
  edit,
  element,
  ids,
  joinRoom,
  newRoom,
  rect,
  until,
  type Join,
  type Peer,
} from "./test-collab.ts";

let server: Awaited<ReturnType<typeof serveBarq>>;
let url: string;
const rooms = createWebSocketRooms();
const peers: Peer[] = [];

beforeAll(async () => {
  server = await serveBarq({
    port: 0,
    hostname: "127.0.0.1",
    silent: true,
    fetch: (request) =>
      new URL(request.url).pathname === "/rooms"
        ? upgradeWebSocket(request, rooms.hooks)
        : new Response("not found", { status: 404 }),
  });
  await server.ready();
  url = `${server.url!.replace(/^http/, "ws").replace(/\/$/, "")}/rooms`;
});

afterEach(async () => {
  await Promise.all(peers.splice(0).map((peer) => peer.session.stop()));
  unmountEditors();
});

afterAll(async () => {
  await server.close(true);
});

const join: Join = async (room, options, elements) => {
  const peer = await joinRoom(room, createWebSocketTransport({ url }), options, elements);
  peers.push(peer);
  return peer;
};

describeCollaboration(join);

/** A peer of the room server without the key, as the server itself is: it sees what the server sees. */
const eavesdrop = async (roomId: string) => {
  const frames: { header: Record<string, unknown>; body: Uint8Array }[] = [];
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  const send = (header: object) => {
    const json = new TextEncoder().encode(JSON.stringify(header));
    const frame = new Uint8Array(4 + json.byteLength);
    new DataView(frame.buffer).setUint32(0, json.byteLength);
    frame.set(json, 4);
    socket.send(frame);
  };
  socket.addEventListener("message", (event) => {
    const bytes = new Uint8Array(event.data as ArrayBuffer);
    const length = new DataView(bytes.buffer).getUint32(0);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
    frames.push({ header, body: bytes.slice(4 + length) });
    if (header.type === "hello") send({ type: "join", room: roomId });
  });
  await until(() => frames.some((frame) => frame.header.type === "room-user-change"), "joined");
  return {
    frames,
    send,
    close: () => socket.close(),
  };
};

describe("the room server", () => {
  test("relays and keeps ciphertext only: the scene, the presence and the files", async () => {
    const room = await newRoom();
    const alice = await join(room, { username: "Alice", existingRoom: false }, [
      rect("secret-1", 10),
    ]);
    const spy = await eavesdrop(room.roomId);
    const bob = await join(room, { username: "Bob" });
    const file = addImage(alice, "secret-image", "secret-file");
    await until(() => bob.editor.api.getFiles()[file.id] !== undefined, "the file at Bob's");

    const broadcasts = spy.frames.filter((frame) => frame.header.type === "broadcast");
    expect(broadcasts.length).toBeGreaterThan(0);
    const cipher = createRoomCipher(room.roomKey);
    const opened = await Promise.all(broadcasts.map((frame) => cipher.decrypt(frame.body)));
    expect(JSON.stringify(opened)).toContain("secret-1");
    expect(JSON.stringify(opened)).toContain("Alice");
    for (const frame of broadcasts) {
      expect(containsText(frame.body, "secret-1")).toBe(false);
      expect(containsText(frame.body, "Alice")).toBe(false);
    }

    spy.send({ type: "file-get", id: file.id, request: 1 });
    await until(() => spy.frames.some((frame) => frame.header.type === "file"), "the stored file");
    const stored = spy.frames.find((frame) => frame.header.type === "file")!.body;
    expect(containsText(stored, "base64")).toBe(false);
    const { data } = await decompressData(stored, { decryptionKey: room.roomKey });
    expect(new TextDecoder().decode(data)).toBe(file.dataURL);
    spy.close();
  });

  test("someone joining an empty room gets its stored scene and images", async () => {
    const room = await newRoom();
    const alice = await join(room, { username: "Alice", existingRoom: false }, [rect("r1", 10)]);
    const file = addImage(alice, "img", "file-stored");
    await until(
      () => (element(alice, "img") as { status?: string } | undefined)?.status === "saved",
      "the image saved",
    );
    await alice.session.stop();
    peers.splice(peers.indexOf(alice), 1);
    await until(() => rooms.rooms().get(room.roomId)?.length === 0, "the room empty");

    const carol = await join(room, { username: "Carol" });
    await until(() => ids(carol).includes("img"), "the stored scene at Carol's");
    expect(ids(carol)).toEqual(["r1", "img"]);
    await until(() => carol.editor.api.getFiles()[file.id] !== undefined, "the stored file");
    expect(carol.editor.api.getFiles()[file.id]?.dataURL).toBe(file.dataURL);
  });

  test("an editor whose session stops keeps its scene, its images pending again", async () => {
    const room = await newRoom();
    const alice = await join(room, { username: "Alice", existingRoom: false });
    addImage(alice, "img", "file-2");
    await until(
      () => (element(alice, "img") as { status?: string } | undefined)?.status === "saved",
      "the image saved",
    );
    await alice.session.stop();
    expect(alice.session.getState().status).toBe("closed");
    expect((element(alice, "img") as { status?: string }).status).toBe("pending");
    expect(alice.editor.api.getAppState().collaborators.size).toBe(0);
  });
});

describe("a dropped connection", () => {
  test("reconnects under a new id, and gets what it missed", async () => {
    const room = await newRoom();
    const sockets: WebSocket[] = [];
    class Recorded extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols);
        sockets.push(this);
      }
    }
    const alice = await joinRoom(
      room,
      createWebSocketTransport({ url, WebSocket: Recorded, reconnectDelay: 20 }),
      { username: "Alice", existingRoom: false },
      [rect("r1", 10)],
    );
    peers.push(alice);
    const bob = await join(room, { username: "Bob" });
    const before = alice.session.getState().socketId!;
    await until(() => bob.session.getState().collaborators.has(before), "Alice at Bob's");

    sockets[0]!.close(4000, "dropped");
    await until(() => alice.session.getState().status === "connecting", "Alice disconnected");
    edit(bob, "r1", (each) => newElementWith(each, { x: 321 }));

    await until(() => alice.session.getState().status === "connected", "Alice back");
    const after = alice.session.getState().socketId!;
    expect(after).not.toBe(before);
    await until(() => element(alice, "r1")?.x === 321, "the missed edit at Alice's");
    await until(
      () =>
        bob.session.getState().collaborators.has(after) &&
        !bob.session.getState().collaborators.has(before),
      "Bob seeing Alice's new id alone",
    );
    edit(alice, "r1", (each) => newElementWith(each, { y: 654 }));
    await until(() => element(bob, "r1")?.y === 654, "Alice's edit after reconnecting");
  });
});
