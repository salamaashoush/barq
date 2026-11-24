import { IV_LENGTH_BYTES, decryptData, encryptData, getCryptoKey } from "../data/encryption.ts";

import type { FileId } from "@excalidraw/element/types";

import type { OnUserFollowedPayload, SocketId } from "../types.ts";
import type { SocketUpdateData, SocketUpdateDataIncoming } from "./data.ts";

/**
 * Encrypts values with a room's key, AES-GCM: a sealed value is its IV
 * followed by the ciphertext of its JSON. A transport seals what it sends
 * and opens what it receives, so the server between peers sees ciphertext.
 */
export interface CollabCipher {
  encrypt(value: unknown): Promise<Uint8Array<ArrayBuffer>>;
  /** Rejects when the data was not sealed with the room's key, or was changed. */
  decrypt(data: Uint8Array): Promise<unknown>;
}

/** A file as it travels: `compressData`'s output, encrypted with the room's key. */
export interface EncodedFile {
  id: FileId;
  buffer: Uint8Array<ArrayBuffer>;
}

/** A room's stored scene: sealed elements, and the revision a save replaces. */
export interface StoredScene {
  revision: number;
  data: Uint8Array<ArrayBuffer>;
}

export type SaveSceneResult =
  | { saved: true; revision: number }
  /** Someone saved first: their scene, to reconcile with and save over. */
  | { saved: false; current: StoredScene | null };

export interface SaveFilesResult {
  savedFiles: FileId[];
  erroredFiles: FileId[];
}

export interface LoadFilesResult {
  loadedFiles: EncodedFile[];
  erroredFiles: FileId[];
}

/** What a transport reports to the session it carries. */
export interface CollabTransportHandlers {
  /** Connected and in the room, with this client's id there. */
  onConnect(socketId: SocketId): void;
  /** Nobody else is in the room: the scene is the stored one, or this client's. */
  onFirstInRoom(): void;
  /** Someone joined, and is sent the whole scene. */
  onNewUser(socketId: SocketId): void;
  /** Who is in the room now, this client included. */
  onRoomUserChange(socketIds: readonly SocketId[]): void;
  /** A message from another client, or `INVALID_RESPONSE` for one that did not decrypt. */
  onMessage(data: SocketUpdateDataIncoming): void;
  /** The clients following this one. */
  onFollowersChange(socketIds: readonly SocketId[]): void;
  /** The connection dropped, with why; a transport that reconnects calls `onConnect` again. */
  onDisconnect(error?: Error): void;
}

export interface RoomConnection {
  roomId: string;
  cipher: CollabCipher;
}

export interface BroadcastOptions {
  volatile: boolean;
}

/**
 * What carries a collaboration session between clients, Excalidraw's
 * socket.io room behind one interface: `createWebSocketTransport` relays
 * through a room server, `createYjsTransport` keeps the scene in a Y.Doc
 * and the presence in its awareness.
 */
export interface CollabTransport {
  connect(room: RoomConnection, handlers: CollabTransportHandlers): void;
  close(): void;
  /**
   * Sends to everyone else in the room; a volatile message (a pointer, an
   * idle state) may be dropped. `USER_VISIBLE_SCENE_BOUNDS` goes to the
   * clients following this one only.
   */
  broadcast(data: SocketUpdateData, options: BroadcastOptions): Promise<void>;
  /** Starts or stops following a client, for them to send their viewport. */
  follow(payload: OnUserFollowedPayload): void;
  saveFiles(files: readonly EncodedFile[]): Promise<SaveFilesResult>;
  loadFiles(ids: readonly FileId[]): Promise<LoadFilesResult>;
  /**
   * The room's stored scene, for a client that joins an empty room.
   * Absent where the transport's shared state is the stored scene, as a
   * Y.Doc is.
   */
  loadScene?(): Promise<StoredScene | null>;
  /** Stores the scene over `scene.revision`, or answers with the newer one. */
  saveScene?(scene: StoredScene): Promise<SaveSceneResult>;
}

/** A cipher on a room key, `generateEncryptionKey`'s 22 characters. */
export function createRoomCipher(roomKey: string): CollabCipher {
  let encryptKey: Promise<CryptoKey> | null = null;
  let decryptKey: Promise<CryptoKey> | null = null;
  return {
    encrypt: async (value) => {
      encryptKey ??= getCryptoKey(roomKey, "encrypt");
      const { encryptedBuffer, iv } = await encryptData(
        await encryptKey,
        new TextEncoder().encode(JSON.stringify(value)),
      );
      const sealed = new Uint8Array(IV_LENGTH_BYTES + encryptedBuffer.byteLength);
      sealed.set(iv, 0);
      sealed.set(new Uint8Array(encryptedBuffer), IV_LENGTH_BYTES);
      return sealed;
    },
    decrypt: async (data) => {
      decryptKey ??= getCryptoKey(roomKey, "decrypt");
      const iv = data.slice(0, IV_LENGTH_BYTES);
      const encrypted = data.slice(IV_LENGTH_BYTES);
      const decrypted = await decryptData(iv, encrypted, await decryptKey);
      return JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(decrypted))) as unknown;
    },
  };
}
