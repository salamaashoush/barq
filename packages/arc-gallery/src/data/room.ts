/**
 * A client for the room server `createWebSocketRooms` serves at `/api/room`:
 * every frame is a 4-byte big-endian header length, the JSON header, then the
 * body. The gallery's bodies are JSON too, and are not encrypted, since the
 * room is a demo between a reader's own tabs.
 */

export interface Room<T> {
  /** To everyone else in the room; `volatile` for what may be dropped, such as typing. */
  send(body: T, volatile?: boolean): void;
  close(): void;
}

export interface RoomHandlers<T> {
  message(body: T, from: string): void;
  /** Who is in the room, this tab included, whenever that changes. */
  peers?(ids: readonly string[], self: string): void;
  status?(status: "connecting" | "open" | "closed"): void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function frame(header: object, body?: unknown): Uint8Array<ArrayBuffer> {
  const head = encoder.encode(JSON.stringify(header));
  const tail = body === undefined ? new Uint8Array() : encoder.encode(JSON.stringify(body));
  const out = new Uint8Array(4 + head.byteLength + tail.byteLength);
  new DataView(out.buffer).setUint32(0, head.byteLength);
  out.set(head, 4);
  out.set(tail, 4 + head.byteLength);
  return out;
}

function unframe(bytes: Uint8Array): {
  header: { type: string; [key: string]: unknown };
  body: string;
} {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  return {
    header: JSON.parse(decoder.decode(bytes.subarray(4, 4 + length))) as { type: string },
    body: decoder.decode(bytes.subarray(4 + length)),
  };
}

export function joinRoom<T>(name: string, handlers: RoomHandlers<T>): Room<T> {
  const url = new URL("/api/room", location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  let self = "";
  handlers.status?.("connecting");

  socket.addEventListener("message", (event: MessageEvent<ArrayBuffer>) => {
    const { header, body } = unframe(new Uint8Array(event.data));
    switch (header.type) {
      case "hello":
        self = String(header["id"]);
        socket.send(frame({ type: "join", room: name }));
        handlers.status?.("open");
        break;
      case "room-user-change":
        handlers.peers?.(header["peers"] as string[], self);
        break;
      case "broadcast":
        handlers.message(JSON.parse(body) as T, String(header["from"]));
        break;
      default:
        break;
    }
  });
  socket.addEventListener("close", () => handlers.status?.("closed"));

  return {
    send(body, volatile = false) {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(frame({ type: "broadcast", volatile }, body));
    },
    close() {
      socket.close();
    },
  };
}
