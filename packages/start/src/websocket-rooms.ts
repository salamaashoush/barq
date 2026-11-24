import type { Message, Peer } from "crossws";
import type { WebSocketHooks } from "./websocket.ts";

/**
 * A relay for rooms of peers that encrypt end to end, the protocol of
 * Excalidraw's room server on plain WebSockets. Every frame is binary: a
 * 4-byte big-endian length, that many bytes of a UTF-8 JSON header, and a
 * body, the rest. The server reads headers only; bodies pass through or are
 * kept as they came.
 *
 * A peer hears `hello` with its id and answers `join` with a room. Joining,
 * it hears `first-in-room`, or the others hear `new-user`; everyone then
 * hears `room-user-change` with who is in the room, and again whenever
 * someone leaves. `broadcast` goes to the rest of the room (`volatile` ones
 * are dropped for a peer that is behind), or with `to: "followers"` to the
 * peers following the sender. `follow` starts or stops following a peer,
 * who hears `followers`. `file-put` and `file-get` keep and return a room's
 * files by id; `snapshot-get` and `snapshot-put` its one stored state, saved
 * over the revision it was read at or answered with the newer one.
 */

type ClientFrame =
  | { type: "join"; room: string }
  | { type: "broadcast"; volatile?: boolean; to?: "followers" }
  | { type: "follow"; peer: string; action: "FOLLOW" | "UNFOLLOW" }
  | { type: "file-put"; id: string; request: number }
  | { type: "file-get"; id: string; request: number }
  | { type: "snapshot-get"; request: number }
  | { type: "snapshot-put"; revision: number; request: number };

type ServerFrame =
  | { type: "hello"; id: string }
  | { type: "first-in-room" }
  | { type: "new-user"; id: string }
  | { type: "room-user-change"; peers: string[] }
  | { type: "broadcast"; from: string }
  | { type: "followers"; peers: string[] }
  | { type: "file-saved"; id: string; request: number }
  | { type: "file-error"; id: string; request: number; message: string }
  | { type: "file"; id: string; request: number }
  | { type: "file-missing"; id: string; request: number }
  | { type: "snapshot"; revision: number; request: number }
  | { type: "snapshot-saved"; revision: number; request: number }
  | { type: "snapshot-conflict"; revision: number; request: number }
  | { type: "snapshot-error"; request: number; message: string }
  | { type: "error"; message: string };

const HEADER_LENGTH_BYTES = 4;

export interface WebSocketRoomsOptions {
  /** The largest file a room keeps. @default 4 MiB */
  maxFileBytes?: number;
  /** The most bytes of files one room keeps. @default 64 MiB */
  maxRoomFileBytes?: number;
  /** The largest stored state. @default 8 MiB */
  maxSnapshotBytes?: number;
  /** A room nobody is in is forgotten, files and state, after this long. @default one day */
  emptyRoomTtlMs?: number;
  /** Above this many unsent bytes to a peer, a volatile broadcast skips it. @default 256 KiB */
  volatileBufferLimit?: number;
}

export interface WebSocketRooms {
  /** The hooks a WebSocket route upgrades with. */
  readonly hooks: WebSocketHooks;
  /** The peers in each room, by room id. */
  rooms(): Map<string, string[]>;
  /** Bytes of files each room keeps. */
  fileBytes(roomId: string): number;
}

interface RoomSnapshot {
  revision: number;
  data: Uint8Array;
}

interface DecodedFrame {
  header: ClientFrame;
  body: Uint8Array;
}

interface Unrefable {
  unref?: () => void;
}

interface FrameOfType<Type extends ClientFrame["type"]> {
  type: Type;
}

interface Room {
  peers: Map<string, Peer>;
  /** Followed peer id to the ids following it. */
  followers: Map<string, Set<string>>;
  files: Map<string, Uint8Array>;
  fileBytes: number;
  snapshot: RoomSnapshot | null;
  expiry: ReturnType<typeof setTimeout> | null;
}

function encodeFrame(header: ServerFrame, body?: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const frame = new Uint8Array(HEADER_LENGTH_BYTES + json.byteLength + (body?.byteLength ?? 0));
  new DataView(frame.buffer).setUint32(0, json.byteLength);
  frame.set(json, HEADER_LENGTH_BYTES);
  if (body) frame.set(body, HEADER_LENGTH_BYTES + json.byteLength);
  return frame;
}

function decodeFrame(bytes: Uint8Array): DecodedFrame | null {
  if (bytes.byteLength < HEADER_LENGTH_BYTES) return null;
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (HEADER_LENGTH_BYTES + length > bytes.byteLength) return null;
  try {
    const header = JSON.parse(
      new TextDecoder().decode(bytes.subarray(HEADER_LENGTH_BYTES, HEADER_LENGTH_BYTES + length)),
    ) as unknown;
    if (typeof header !== "object" || header === null || !("type" in header)) return null;
    return { header: header as ClientFrame, body: bytes.slice(HEADER_LENGTH_BYTES + length) };
  } catch {
    return null;
  }
}

/**
 * Rooms for peers that encrypt end to end: the relay, the presence and the
 * follow rooms of Excalidraw's room server, and a room's files and stored
 * state in memory, all as bytes the server never decrypts.
 *
 * ```ts
 * const rooms = createWebSocketRooms();
 *
 * export const Route = createFileRoute("/rooms")({
 *   server: { handlers: { GET: ({ request }) => upgradeWebSocket(request, rooms.hooks) } },
 * });
 * ```
 */
export function createWebSocketRooms(options: WebSocketRoomsOptions = {}): WebSocketRooms {
  const maxFileBytes = options.maxFileBytes ?? 4 * 1024 * 1024;
  const maxRoomFileBytes = options.maxRoomFileBytes ?? 64 * 1024 * 1024;
  const maxSnapshotBytes = options.maxSnapshotBytes ?? 8 * 1024 * 1024;
  const emptyRoomTtlMs = options.emptyRoomTtlMs ?? 24 * 60 * 60 * 1000;
  const volatileBufferLimit = options.volatileBufferLimit ?? 256 * 1024;

  const rooms = new Map<string, Room>();
  /** Peer id to the room it joined. */
  const joined = new Map<string, string>();

  function send(peer: Peer, header: ServerFrame, body?: Uint8Array): void {
    peer.send(encodeFrame(header, body));
  }

  function roomOf(peer: Peer): Room | undefined {
    const id = joined.get(peer.id);
    return id === undefined ? undefined : rooms.get(id);
  }

  function announcePeers(room: Room): void {
    const peers = [...room.peers.keys()];
    for (const peer of room.peers.values()) send(peer, { type: "room-user-change", peers });
  }

  function announceFollowers(room: Room, followed: string): void {
    const peer = room.peers.get(followed);
    if (peer) {
      send(peer, { type: "followers", peers: [...(room.followers.get(followed) ?? [])] });
    }
  }

  function join(peer: Peer, roomId: string): void {
    if (joined.has(peer.id)) {
      send(peer, { type: "error", message: "already in a room" });
      return;
    }
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        peers: new Map(),
        followers: new Map(),
        files: new Map(),
        fileBytes: 0,
        snapshot: null,
        expiry: null,
      };
      rooms.set(roomId, room);
    }
    if (room.expiry !== null) {
      clearTimeout(room.expiry);
      room.expiry = null;
    }
    room.peers.set(peer.id, peer);
    joined.set(peer.id, roomId);
    if (room.peers.size <= 1) {
      send(peer, { type: "first-in-room" });
    } else {
      for (const [id, other] of room.peers) {
        if (id !== peer.id) send(other, { type: "new-user", id: peer.id });
      }
    }
    announcePeers(room);
  }

  function leave(peer: Peer): void {
    const roomId = joined.get(peer.id);
    joined.delete(peer.id);
    const room = roomId === undefined ? undefined : rooms.get(roomId);
    if (!room || roomId === undefined) return;
    room.peers.delete(peer.id);
    room.followers.delete(peer.id);
    for (const [followed, followers] of room.followers) {
      if (followers.delete(peer.id)) announceFollowers(room, followed);
    }
    if (room.peers.size > 0) {
      announcePeers(room);
      return;
    }
    const expiry = setTimeout(() => {
      if (rooms.get(roomId) === room && room.peers.size === 0) rooms.delete(roomId);
    }, emptyRoomTtlMs) as ReturnType<typeof setTimeout> & Unrefable;
    expiry.unref?.();
    room.expiry = expiry;
  }

  function relay(
    peer: Peer,
    room: Room,
    frame: Extract<ClientFrame, FrameOfType<"broadcast">>,
    body: Uint8Array,
  ) {
    const targets =
      frame.to === "followers"
        ? [...(room.followers.get(peer.id) ?? [])].flatMap((id) => {
            const target = room.peers.get(id);
            return target ? [target] : [];
          })
        : [...room.peers.values()].filter((target) => target.id !== peer.id);
    const message = encodeFrame({ type: "broadcast", from: peer.id }, body);
    for (const target of targets) {
      if (frame.volatile && target.bufferedAmount > volatileBufferLimit) continue;
      target.send(message);
    }
  }

  function follow(peer: Peer, room: Room, frame: Extract<ClientFrame, FrameOfType<"follow">>) {
    if (frame.peer === peer.id || !room.peers.has(frame.peer)) return;
    let followers = room.followers.get(frame.peer);
    if (frame.action === "FOLLOW") {
      if (!followers) {
        followers = new Set();
        room.followers.set(frame.peer, followers);
      }
      followers.add(peer.id);
    } else {
      followers?.delete(peer.id);
      if (followers?.size === 0) room.followers.delete(frame.peer);
    }
    announceFollowers(room, frame.peer);
  }

  function putFile(
    peer: Peer,
    room: Room,
    frame: Extract<ClientFrame, FrameOfType<"file-put">>,
    body: Uint8Array,
  ) {
    const reply = { id: frame.id, request: frame.request };
    if (body.byteLength > maxFileBytes) {
      send(peer, { type: "file-error", ...reply, message: "the file is too large" });
      return;
    }
    const replaced = room.files.get(frame.id)?.byteLength ?? 0;
    if (room.fileBytes - replaced + body.byteLength > maxRoomFileBytes) {
      send(peer, { type: "file-error", ...reply, message: "the room's files are too large" });
      return;
    }
    room.files.set(frame.id, body);
    room.fileBytes += body.byteLength - replaced;
    send(peer, { type: "file-saved", ...reply });
  }

  function getFile(peer: Peer, room: Room, frame: Extract<ClientFrame, FrameOfType<"file-get">>) {
    const file = room.files.get(frame.id);
    const reply = { id: frame.id, request: frame.request };
    if (file) send(peer, { type: "file", ...reply }, file);
    else send(peer, { type: "file-missing", ...reply });
  }

  function putSnapshot(
    peer: Peer,
    room: Room,
    frame: Extract<ClientFrame, FrameOfType<"snapshot-put">>,
    body: Uint8Array,
  ) {
    const current = room.snapshot;
    if (body.byteLength > maxSnapshotBytes) {
      send(peer, {
        type: "snapshot-error",
        request: frame.request,
        message: "the stored state is too large",
      });
      return;
    }
    if ((current?.revision ?? 0) !== frame.revision) {
      send(
        peer,
        { type: "snapshot-conflict", revision: current?.revision ?? 0, request: frame.request },
        current?.data,
      );
      return;
    }
    const revision = (current?.revision ?? 0) + 1;
    room.snapshot = { revision, data: body };
    send(peer, { type: "snapshot-saved", revision, request: frame.request });
  }

  const hooks: WebSocketHooks = {
    open(peer) {
      send(peer, { type: "hello", id: peer.id });
    },
    message(peer, message: Message) {
      const frame = decodeFrame(message.uint8Array());
      if (!frame) {
        send(peer, { type: "error", message: "not a room frame" });
        return;
      }
      const { header, body } = frame;
      if (header.type === "join") {
        if (typeof header.room !== "string" || header.room === "") {
          send(peer, { type: "error", message: "join needs a room" });
          return;
        }
        join(peer, header.room);
        return;
      }
      const room = roomOf(peer);
      if (!room) {
        send(peer, { type: "error", message: "join a room first" });
        return;
      }
      switch (header.type) {
        case "broadcast":
          relay(peer, room, header, body);
          return;
        case "follow":
          follow(peer, room, header);
          return;
        case "file-put":
          putFile(peer, room, header, body);
          return;
        case "file-get":
          getFile(peer, room, header);
          return;
        case "snapshot-get":
          send(
            peer,
            { type: "snapshot", revision: room.snapshot?.revision ?? 0, request: header.request },
            room.snapshot?.data,
          );
          return;
        case "snapshot-put":
          putSnapshot(peer, room, header, body);
          return;
        default:
          send(peer, { type: "error", message: "unknown frame" });
      }
    },
    close(peer) {
      leave(peer);
    },
  };

  return {
    hooks,
    rooms: () =>
      new Map([...rooms].map(([id, room]) => [id, [...room.peers.keys()]] as [string, string[]])),
    fileBytes: (roomId) => rooms.get(roomId)?.fileBytes ?? 0,
  };
}
