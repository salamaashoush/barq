import { WS_SUBTYPES, isSocketUpdateData } from "./data.ts";

import type { FileId } from "@excalidraw/element/types";

import type { SocketId } from "../types.ts";
import type {
  CollabCipher,
  CollabTransport,
  CollabTransportHandlers,
  EncodedFile,
  LoadFilesResult,
  SaveFilesResult,
  SaveSceneResult,
  StoredScene,
} from "./transport.ts";

/**
 * The room protocol `createWebSocketRooms` from `@barqjs/start` serves.
 * Every frame is binary: a 4-byte big-endian length, that many bytes of a
 * UTF-8 JSON header, and the body, the rest. Bodies are ciphertext.
 */
type ClientFrame =
  | { type: "join"; room: string }
  | { type: "broadcast"; volatile: boolean; to?: "followers" }
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

interface NumberedRequest {
  request: number;
}

type Reply = Extract<ServerFrame, NumberedRequest>;

const HEADER_LENGTH_BYTES = 4;

/** Above this many unsent bytes, a volatile message is dropped rather than queued. */
const VOLATILE_BUFFER_LIMIT = 256 * 1024;

function encodeFrame(header: ClientFrame, body?: Uint8Array): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const frame = new Uint8Array(HEADER_LENGTH_BYTES + json.byteLength + (body?.byteLength ?? 0));
  new DataView(frame.buffer).setUint32(0, json.byteLength);
  frame.set(json, HEADER_LENGTH_BYTES);
  if (body) frame.set(body, HEADER_LENGTH_BYTES + json.byteLength);
  return frame;
}

interface DecodedFrame {
  header: ServerFrame;
  body: Uint8Array<ArrayBuffer>;
}

function decodeFrame(data: ArrayBuffer): DecodedFrame {
  const bytes = new Uint8Array(data);
  const length = new DataView(data).getUint32(0);
  const header = JSON.parse(
    new TextDecoder().decode(bytes.subarray(HEADER_LENGTH_BYTES, HEADER_LENGTH_BYTES + length)),
  ) as ServerFrame;
  return { header, body: bytes.slice(HEADER_LENGTH_BYTES + length) };
}

async function toArrayBuffer(data: unknown): Promise<ArrayBuffer | null> {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.arrayBuffer();
  return null;
}

export interface WebSocketTransportOptions {
  /** The room server's address, a route answering with `createWebSocketRooms`' hooks. */
  url: string | URL;
  protocols?: string | string[];
  /** The `WebSocket` constructor. @default globalThis.WebSocket */
  WebSocket?: typeof WebSocket;
  /** How long a file or scene request waits for the server. @default 30 seconds */
  timeout?: number;
  /**
   * The first wait before connecting again after the connection drops,
   * doubled each failed try up to 30 seconds, as socket.io reconnects;
   * `false` to stay disconnected. @default 1000
   */
  reconnectDelay?: number | false;
}

interface PendingRequest {
  resolve: (reply: ReplyFrame) => void;
  reject: (error: Error) => void;
}

interface ReplyFrame {
  header: Reply;
  body: Uint8Array<ArrayBuffer>;
}

/**
 * A transport through a room server over a WebSocket, as Excalidraw's
 * socket.io portal: the server relays sealed messages to the room, the
 * followed side's viewport to its followers, and keeps the room's sealed
 * files and scene.
 */
export function createWebSocketTransport(options: WebSocketTransportOptions): CollabTransport {
  const Socket = options.WebSocket ?? globalThis.WebSocket;
  const timeout = options.timeout ?? 30_000;
  let socket: WebSocket | null = null;
  let cipher: CollabCipher | null = null;
  let handlers: CollabTransportHandlers | null = null;
  let nextRequest = 1;
  const pending = new Map<number, PendingRequest>();
  // frames are handled one after another: a broadcast decrypts before the
  // frames after it are seen, so the room's order holds
  let incoming: Promise<void> = Promise.resolve();
  // sealed side by side, sent in the order they were given
  let outgoing: Promise<void> = Promise.resolve();

  function send(header: ClientFrame, body?: Uint8Array): boolean {
    if (!socket || socket.readyState !== Socket.OPEN) return false;
    socket.send(encodeFrame(header, body));
    return true;
  }

  function request(header: ClientFrame & NumberedRequest, body?: Uint8Array): Promise<ReplyFrame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(header.request);
        reject(new Error(`the room server did not answer ${header.type} in time`));
      }, timeout);
      pending.set(header.request, {
        resolve: (reply) => {
          clearTimeout(timer);
          resolve(reply);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      if (!send(header, body)) {
        pending.get(header.request)?.reject(new Error("the room's connection is closed"));
        pending.delete(header.request);
      }
    });
  }

  function rejectPending(error: Error): void {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }

  async function handle(frame: DecodedFrame) {
    const { header, body } = frame;
    const to = handlers;
    if (!to) return;
    switch (header.type) {
      case "hello":
        attempts = 0;
        send({ type: "join", room: roomId });
        to.onConnect(header.id as SocketId);
        return;
      case "first-in-room":
        to.onFirstInRoom();
        return;
      case "new-user":
        to.onNewUser(header.id as SocketId);
        return;
      case "room-user-change":
        to.onRoomUserChange(header.peers as SocketId[]);
        return;
      case "followers":
        to.onFollowersChange(header.peers as SocketId[]);
        return;
      case "broadcast": {
        let data: unknown = null;
        try {
          data = await cipher?.decrypt(body);
        } catch (error) {
          console.error(error);
        }
        to.onMessage(isSocketUpdateData(data) ? data : { type: WS_SUBTYPES.INVALID_RESPONSE });
        return;
      }
      case "error":
        console.error(`the room server: ${header.message}`);
        return;
      default: {
        const waiting = pending.get(header.request);
        pending.delete(header.request);
        waiting?.resolve({ header, body });
      }
    }
  }

  let roomId = "";
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  function open(): void {
    const opened = new Socket(options.url, options.protocols);
    opened.binaryType = "arraybuffer";
    socket = opened;
    let failed: Error | undefined;
    opened.addEventListener("message", (event) => {
      incoming = incoming.then(async () => {
        const data = await toArrayBuffer(event.data);
        if (!data) return;
        try {
          await handle(decodeFrame(data));
        } catch (error) {
          console.error(error);
        }
      });
    });
    opened.addEventListener("error", () => {
      failed = new Error("the connection to the room server failed");
    });
    opened.addEventListener("close", (event) => {
      if (socket !== opened) return;
      socket = null;
      const error =
        failed ??
        new Error(
          `the room server closed the connection (${event.code}${event.reason ? `, ${event.reason}` : ""})`,
        );
      rejectPending(error);
      const to = handlers;
      incoming = incoming.then(() => to?.onDisconnect(error));
      const delay = options.reconnectDelay ?? 1000;
      if (delay === false || closed) return;
      retry = setTimeout(
        () => {
          retry = null;
          if (!closed) open();
        },
        Math.min(30_000, delay * 2 ** attempts++),
      );
    });
  }

  return {
    connect(room, nextHandlers) {
      roomId = room.roomId;
      cipher = room.cipher;
      handlers = nextHandlers;
      closed = false;
      open();
    },

    close() {
      closed = true;
      if (retry !== null) clearTimeout(retry);
      retry = null;
      const closing = socket;
      socket = null;
      handlers = null;
      rejectPending(new Error("the room's connection closed"));
      closing?.close(1000);
    },

    async broadcast(data, { volatile }) {
      if (!cipher || !socket) return;
      if (volatile && socket.bufferedAmount > VOLATILE_BUFFER_LIMIT) return;
      const sealing = cipher.encrypt(data);
      const header: ClientFrame =
        data.type === WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS
          ? { type: "broadcast", volatile, to: "followers" }
          : { type: "broadcast", volatile };
      const sent = outgoing.then(async () => {
        send(header, await sealing);
      });
      outgoing = sent.catch(() => undefined);
      await sent;
    },

    follow({ userToFollow, action }) {
      send({ type: "follow", peer: userToFollow.socketId, action });
    },

    async saveFiles(files: readonly EncodedFile[]): Promise<SaveFilesResult> {
      const savedFiles: FileId[] = [];
      const erroredFiles: FileId[] = [];
      await Promise.all(
        files.map(async ({ id, buffer }) => {
          try {
            const reply = await request({ type: "file-put", id, request: nextRequest++ }, buffer);
            (reply.header.type === "file-saved" ? savedFiles : erroredFiles).push(id);
          } catch (error) {
            console.error(error);
            erroredFiles.push(id);
          }
        }),
      );
      return { savedFiles, erroredFiles };
    },

    async loadFiles(ids: readonly FileId[]): Promise<LoadFilesResult> {
      const loadedFiles: EncodedFile[] = [];
      const erroredFiles: FileId[] = [];
      await Promise.all(
        [...new Set(ids)].map(async (id) => {
          try {
            const reply = await request({ type: "file-get", id, request: nextRequest++ });
            if (reply.header.type === "file") {
              loadedFiles.push({ id, buffer: reply.body });
            } else {
              erroredFiles.push(id);
            }
          } catch (error) {
            console.error(error);
            erroredFiles.push(id);
          }
        }),
      );
      return { loadedFiles, erroredFiles };
    },

    async loadScene(): Promise<StoredScene | null> {
      const reply = await request({ type: "snapshot-get", request: nextRequest++ });
      if (reply.header.type !== "snapshot") {
        throw new Error(`the room server answered ${reply.header.type} for the scene`);
      }
      return reply.header.revision > 0 && reply.body.byteLength > 0
        ? { revision: reply.header.revision, data: reply.body }
        : null;
    },

    async saveScene(scene: StoredScene): Promise<SaveSceneResult> {
      const reply = await request(
        { type: "snapshot-put", revision: scene.revision, request: nextRequest++ },
        scene.data,
      );
      switch (reply.header.type) {
        case "snapshot-saved":
          return { saved: true, revision: reply.header.revision };
        case "snapshot-conflict":
          return {
            saved: false,
            current:
              reply.header.revision > 0 && reply.body.byteLength > 0
                ? { revision: reply.header.revision, data: reply.body }
                : null,
          };
        case "snapshot-error":
          throw new Error(reply.header.message);
        default:
          throw new Error(`the room server answered ${reply.header.type} for the scene`);
      }
    },
  };
}
