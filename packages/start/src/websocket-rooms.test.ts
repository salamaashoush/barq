import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "srvx";
import { serveBarq } from "./serve.ts";
import { type WebSocketRooms, createWebSocketRooms } from "./websocket-rooms.ts";
import { upgradeWebSocket } from "./websocket.ts";

type FrameHeader = Record<string, unknown> & { type: string };

interface Frame {
  header: FrameHeader;
  body: Uint8Array;
}

interface Waiter {
  type: string;
  resolve: (frame: Frame) => void;
}

function encode(header: object, body?: Uint8Array): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const frame = new Uint8Array(4 + json.byteLength + (body?.byteLength ?? 0));
  new DataView(frame.buffer).setUint32(0, json.byteLength);
  frame.set(json, 4);
  if (body) frame.set(body, 4 + json.byteLength);
  return frame;
}

function decode(data: ArrayBuffer): Frame {
  const bytes = new Uint8Array(data);
  const length = new DataView(data).getUint32(0);
  return {
    header: JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))),
    body: bytes.slice(4 + length),
  };
}

/** A peer on the room server: what it heard, and a wait for the next frame of a type. */
class Client {
  readonly frames: Frame[] = [];
  id = "";
  private readonly socket: WebSocket;
  private readonly waiters: Array<Waiter> = [];
  private readonly consumed = new Set<Frame>();

  private constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";
    this.socket.addEventListener("message", (event) => {
      const frame = decode(event.data as ArrayBuffer);
      this.frames.push(frame);
      const index = this.waiters.findIndex((waiter) => waiter.type === frame.header.type);
      if (index !== -1) {
        this.consumed.add(frame);
        this.waiters.splice(index, 1)[0].resolve(frame);
      }
    });
  }

  static async open(url: string, room?: string): Promise<Client> {
    const client = new Client(url);
    const hello = await client.next("hello");
    client.id = String(hello.header.id);
    if (room !== undefined) client.send({ type: "join", room });
    return client;
  }

  send(header: object, body?: Uint8Array): void {
    this.socket.send(encode(header, body));
  }

  /** The next frame of a type not yet waited for, heard already or to come. */
  next(type: string): Promise<Frame> {
    const heard = this.frames.find(
      (frame) => !this.consumed.has(frame) && frame.header.type === type,
    );
    if (heard) {
      this.consumed.add(heard);
      return Promise.resolve(heard);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${type} frame`)), 2000);
      this.waiters.push({
        type,
        resolve: (frame) => {
          clearTimeout(timer);
          resolve(frame);
        },
      });
    });
  }

  heard(type: string): Frame[] {
    return this.frames.filter((frame) => frame.header.type === type);
  }

  close(): void {
    this.socket.close();
  }
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

let server: Server;
let base: string;
let rooms: WebSocketRooms;
const clients: Client[] = [];

async function open(room?: string): Promise<Client> {
  const client = await Client.open(`${base}/rooms`, room);
  clients.push(client);
  return client;
}

beforeAll(async () => {
  rooms = createWebSocketRooms({
    maxFileBytes: 64,
    maxRoomFileBytes: 100,
    maxSnapshotBytes: 32,
    emptyRoomTtlMs: 100,
  });
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
  base = server.url!.replace(/^http/, "ws").replace(/\/$/, "");
});

afterAll(async () => {
  for (const client of clients) client.close();
  await server.close(true);
});

describe("createWebSocketRooms", () => {
  test("a joining peer is first in the room, then the others hear the new user, and everyone who is in", async () => {
    const alice = await open("joining");
    await alice.next("first-in-room");
    expect((await alice.next("room-user-change")).header.peers).toEqual([alice.id]);

    const bob = await open("joining");
    expect((await alice.next("new-user")).header.id).toBe(bob.id);
    expect((await alice.next("room-user-change")).header.peers).toEqual([alice.id, bob.id]);
    expect((await bob.next("room-user-change")).header.peers).toEqual([alice.id, bob.id]);
    expect(bob.heard("first-in-room")).toEqual([]);

    bob.close();
    expect((await alice.next("room-user-change")).header.peers).toEqual([alice.id]);
    expect(rooms.rooms().get("joining")).toEqual([alice.id]);
  });

  test("relays a broadcast's body as it came to the rest of the room, not the sender or other rooms", async () => {
    const alice = await open("relay");
    const bob = await open("relay");
    const carol = await open("elsewhere");
    await bob.next("room-user-change");

    const body = new Uint8Array([1, 2, 3, 250]);
    alice.send({ type: "broadcast", volatile: false }, body);
    const relayed = await bob.next("broadcast");
    expect(relayed.header.from).toBe(alice.id);
    expect([...relayed.body]).toEqual([1, 2, 3, 250]);

    alice.send({ type: "broadcast", volatile: true }, new Uint8Array([9]));
    expect([...(await bob.next("broadcast")).body]).toEqual([9]);
    await settle();
    expect(alice.heard("broadcast")).toEqual([]);
    expect(carol.heard("broadcast")).toEqual([]);
  });

  test("follow rooms: the followed peer hears its followers, and its broadcasts to them reach them alone", async () => {
    const alice = await open("follow");
    const bob = await open("follow");
    const carol = await open("follow");
    await carol.next("room-user-change");

    bob.send({ type: "follow", peer: alice.id, action: "FOLLOW" });
    expect((await alice.next("followers")).header.peers).toEqual([bob.id]);
    carol.send({ type: "follow", peer: alice.id, action: "FOLLOW" });
    expect((await alice.next("followers")).header.peers).toEqual([bob.id, carol.id]);

    carol.send({ type: "follow", peer: alice.id, action: "UNFOLLOW" });
    expect((await alice.next("followers")).header.peers).toEqual([bob.id]);

    alice.send({ type: "broadcast", volatile: true, to: "followers" }, new Uint8Array([7]));
    expect((await bob.next("broadcast")).header.from).toBe(alice.id);
    await settle();
    expect(carol.heard("broadcast")).toEqual([]);

    // a follower leaving is a change of followers
    bob.close();
    expect((await alice.next("followers")).header.peers).toEqual([]);
  });

  test("keeps a room's files as they came, within its caps", async () => {
    const alice = await open("files");
    const bob = await open("files");
    await bob.next("room-user-change");

    alice.send({ type: "file-put", id: "f1", request: 1 }, new Uint8Array(60).fill(5));
    expect((await alice.next("file-saved")).header).toEqual({
      type: "file-saved",
      id: "f1",
      request: 1,
    });
    bob.send({ type: "file-get", id: "f1", request: 2 });
    const file = await bob.next("file");
    expect(file.header.request).toBe(2);
    expect(file.body).toEqual(new Uint8Array(60).fill(5));

    bob.send({ type: "file-get", id: "none", request: 3 });
    expect((await bob.next("file-missing")).header.id).toBe("none");

    alice.send({ type: "file-put", id: "big", request: 4 }, new Uint8Array(65));
    expect((await alice.next("file-error")).header.message).toBe("the file is too large");
    alice.send({ type: "file-put", id: "f2", request: 5 }, new Uint8Array(60));
    expect((await alice.next("file-error")).header.message).toBe("the room's files are too large");
    expect(rooms.fileBytes("files")).toBe(60);
  });

  test("stores one state, saved over the revision it was read at or answered with the newer one", async () => {
    const alice = await open("snapshot");
    alice.send({ type: "snapshot-get", request: 1 });
    const empty = await alice.next("snapshot");
    expect(empty.header.revision).toBe(0);
    expect(empty.body.byteLength).toBe(0);

    alice.send({ type: "snapshot-put", revision: 0, request: 2 }, new Uint8Array([1]));
    expect((await alice.next("snapshot-saved")).header.revision).toBe(1);

    const bob = await open("snapshot");
    bob.send({ type: "snapshot-put", revision: 0, request: 3 }, new Uint8Array([2]));
    const conflict = await bob.next("snapshot-conflict");
    expect(conflict.header.revision).toBe(1);
    expect([...conflict.body]).toEqual([1]);
    bob.send({ type: "snapshot-put", revision: 1, request: 4 }, new Uint8Array([3]));
    expect((await bob.next("snapshot-saved")).header.revision).toBe(2);

    bob.send({ type: "snapshot-put", revision: 2, request: 5 }, new Uint8Array(33));
    expect((await bob.next("snapshot-error")).header.message).toBe("the stored state is too large");
    alice.send({ type: "snapshot-get", request: 6 });
    expect([...(await alice.next("snapshot")).body]).toEqual([3]);
  });

  test("answers a peer that has not joined, or sends something else, with an error", async () => {
    const alice = await open();
    alice.send({ type: "broadcast", volatile: false }, new Uint8Array([1]));
    expect((await alice.next("error")).header.message).toBe("join a room first");
    alice.send({ type: "join" });
    expect((await alice.next("error")).header.message).toBe("join needs a room");
  });

  test("forgets a room once nobody has been in it for its time", async () => {
    const alice = await open("expiring");
    await alice.next("first-in-room");
    alice.send({ type: "file-put", id: "f", request: 1 }, new Uint8Array([1]));
    await alice.next("file-saved");
    alice.close();
    await settle();
    expect(rooms.rooms().get("expiring")).toEqual([]);

    // back in time, the room is as it was left
    const bob = await open("expiring");
    bob.send({ type: "file-get", id: "f", request: 1 });
    expect([...(await bob.next("file")).body]).toEqual([1]);
    bob.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(rooms.rooms().has("expiring")).toBe(false);
  });
});
