import type * as Y from "yjs";

import type { SceneBounds } from "@excalidraw/element";
import type { FileId, OrderedExcalidrawElement } from "@excalidraw/element/types";
import type { UserIdleState } from "@excalidraw/common";

import { toByteString } from "../data/encode.ts";
import { WS_SUBTYPES } from "./data.ts";

import type { AppState, SocketId } from "../types.ts";
import type { SocketUpdateDataIncoming, SocketUpdateDataSource } from "./data.ts";
import type {
  CollabCipher,
  CollabTransport,
  CollabTransportHandlers,
  EncodedFile,
  LoadFilesResult,
  SaveFilesResult,
} from "./transport.ts";

/** What changed in an awareness, y-protocols' `change` event. */
export interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

/**
 * The part of a y-protocols `Awareness` the transport uses, so any
 * provider's (y-websocket, Hocuspocus, y-webrtc) fits without the package.
 */
export interface YjsAwareness {
  readonly clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: "change", listener: (changes: AwarenessChanges, origin: unknown) => void): void;
  off(event: "change", listener: (changes: AwarenessChanges, origin: unknown) => void): void;
}

export interface YjsTransportOptions {
  /** The shared document; a provider keeps it in sync and stored. */
  doc: Y.Doc;
  awareness: YjsAwareness;
  /** The document's map of sealed elements by id. @default "elements" */
  elementsMap?: string;
  /** The document's map of sealed files by id. @default "files" */
  filesMap?: string;
  /** The awareness field the sealed presence is in. @default "collab" */
  awarenessField?: string;
}

/** What a client shares in the awareness, sealed. */
interface Presence {
  username?: string;
  pointer?: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
  button?: "down" | "up";
  selectedElementIds?: AppState["selectedElementIds"];
  userState?: UserIdleState;
  /** The client this one follows. */
  following?: SocketId | null;
  /** The visible scene, while someone follows this client. */
  sceneBounds?: SceneBounds | null;
}

function base64(bytes: Uint8Array): string {
  return btoa(toByteString(bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface Written {
  version: number;
  versionNonce: number;
  data: Uint8Array;
}

interface ElementVersion {
  version: number;
  versionNonce: number;
}

/**
 * A transport on a Y.Doc and its awareness: the elements in a map by id,
 * the files in another, each value sealed with the room key, and each
 * client's pointer, selection, idle state, follow and visible bounds sealed
 * in its awareness state. A provider carries both; it and its server see
 * ciphertext.
 *
 * Two clients writing one element at once leave the map with one of the two
 * copies; the one whose copy lost writes it again when it should have won by
 * Excalidraw's rule (the higher version, then the lower nonce), so every
 * replica converges on the copy reconciliation picks.
 */
export function createYjsTransport(options: YjsTransportOptions): CollabTransport {
  const { doc, awareness } = options;
  const elements = doc.getMap<Uint8Array>(options.elementsMap ?? "elements");
  const files = doc.getMap<Uint8Array>(options.filesMap ?? "files");
  const field = options.awarenessField ?? "collab";
  const selfId = String(awareness.clientID) as SocketId;
  const origin = Symbol("barq-diagram-collab");

  let cipher: CollabCipher | null = null;
  let handlers: CollabTransportHandlers | null = null;
  let presence: Presence = { following: null, sceneBounds: null };
  /** The (version, nonce) of each element's copy in the map, as far as this client knows. */
  const known = new Map<string, ElementVersion>();
  /** This client's own last copy of each element, written again should it lose a race. */
  const written = new Map<string, Written>();
  const seen = new Map<number, Presence>();
  let peers: SocketId[] = [];
  let followers: SocketId[] = [];
  // decrypted one after another, so they reach the session in order
  let queue: Promise<void> = Promise.resolve();
  function enqueue(task: () => Promise<void>): void {
    queue = queue.then(task).catch((error: unknown) => console.error(error));
  }

  function deliver(data: SocketUpdateDataIncoming): void {
    return handlers?.onMessage(data);
  }

  function publishPresence(): void {
    const snapshot = { ...presence };
    enqueue(async () => {
      if (!cipher || !handlers) return;
      awareness.setLocalStateField(field, base64(await cipher.encrypt(snapshot)));
    });
  }

  async function decryptElement(data: Uint8Array): Promise<OrderedExcalidrawElement | null> {
    try {
      const element = (await cipher?.decrypt(data)) as OrderedExcalidrawElement | undefined;
      return element && typeof element === "object" && typeof element.id === "string"
        ? element
        : null;
    } catch (error) {
      console.error(error);
      deliver({ type: WS_SUBTYPES.INVALID_RESPONSE });
      return null;
    }
  }

  function wins(mine: ElementVersion, theirs: ElementVersion): boolean {
    return (
      mine.version > theirs.version ||
      (mine.version === theirs.version && mine.versionNonce < theirs.versionNonce)
    );
  }

  function onElements(event: Y.YMapEvent<Uint8Array>, transaction: Y.Transaction): void {
    if (transaction.origin === origin) return;
    const ids = [...(event.keysChanged as Set<string>)].filter((id) => elements.has(id));
    const values = ids.map((id) => [id, elements.get(id)!] as const);
    enqueue(async () => {
      const received: OrderedExcalidrawElement[] = [];
      const rewrite: Array<[string, Uint8Array]> = [];
      for (const [id, data] of values) {
        const element = await decryptElement(data);
        if (!element) continue;
        known.set(id, { version: element.version, versionNonce: element.versionNonce });
        const mine = written.get(id);
        if (mine && wins(mine, element)) {
          rewrite.push([id, mine.data]);
          known.set(id, { version: mine.version, versionNonce: mine.versionNonce });
        }
        received.push(element);
      }
      if (rewrite.length) {
        doc.transact(() => {
          for (const [id, data] of rewrite) elements.set(id, data);
        }, origin);
      }
      if (received.length) {
        deliver({ type: WS_SUBTYPES.UPDATE, payload: { elements: received } });
      }
    });
  }

  function roomPeers(): SocketId[] {
    const ids = [...awareness.getStates()]
      .filter(([id, state]) => id !== awareness.clientID && typeof state[field] === "string")
      .map(([id]) => String(id) as SocketId);
    return [selfId, ...ids].toSorted();
  }

  function onAwareness({ added, updated, removed }: AwarenessChanges): void {
    const states = awareness.getStates();
    const changed = [...added, ...updated]
      .filter((id) => id !== awareness.clientID)
      .flatMap((id) => {
        const sealed = states.get(id)?.[field];
        return typeof sealed === "string" ? [[id, sealed] as const] : [];
      });
    const gone = [
      ...removed,
      ...updated.filter((id) => typeof states.get(id)?.[field] !== "string"),
    ].filter((id) => id !== awareness.clientID);
    enqueue(async () => {
      if (!handlers || !cipher) return;
      const nextPeers = roomPeers();
      if (!same(nextPeers, peers)) {
        peers = nextPeers;
        handlers.onRoomUserChange(peers);
      }
      for (const id of gone) seen.delete(id);
      for (const [id, sealed] of changed) {
        let next: Presence;
        try {
          next = (await cipher.decrypt(fromBase64(sealed))) as Presence;
        } catch (error) {
          console.error(error);
          deliver({ type: WS_SUBTYPES.INVALID_RESPONSE });
          continue;
        }
        const prev = seen.get(id) ?? {};
        seen.set(id, next);
        const socketId = String(id) as SocketId;
        const username = next.username ?? "";
        if (
          next.pointer &&
          (!same(prev.pointer, next.pointer) ||
            prev.button !== next.button ||
            !same(prev.selectedElementIds, next.selectedElementIds) ||
            prev.username !== next.username)
        ) {
          deliver({
            type: WS_SUBTYPES.MOUSE_LOCATION,
            payload: {
              socketId,
              pointer: next.pointer,
              button: next.button ?? "up",
              selectedElementIds: next.selectedElementIds ?? {},
              username,
            },
          });
        }
        if (
          next.userState &&
          (prev.userState !== next.userState || prev.username !== next.username)
        ) {
          deliver({
            type: WS_SUBTYPES.IDLE_STATUS,
            payload: { socketId, userState: next.userState, username },
          });
        }
        if (
          next.sceneBounds &&
          presence.following === socketId &&
          !same(prev.sceneBounds, next.sceneBounds)
        ) {
          deliver({
            type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
            payload: { socketId, username, sceneBounds: next.sceneBounds },
          });
        }
      }
      const nextFollowers = [...seen]
        .filter(
          ([id, state]) => state.following === selfId && nextPeers.includes(String(id) as SocketId),
        )
        .map(([id]) => String(id) as SocketId)
        .toSorted();
      if (!same(nextFollowers, followers)) {
        followers = nextFollowers;
        if (followers.length === 0 && presence.sceneBounds) {
          presence = { ...presence, sceneBounds: null };
          publishPresence();
        }
        handlers.onFollowersChange(followers);
      }
    });
  }

  return {
    connect(room, nextHandlers) {
      cipher = room.cipher;
      handlers = nextHandlers;
      elements.observe(onElements);
      awareness.on("change", onAwareness);
      nextHandlers.onConnect(selfId);
      publishPresence();
      const values = [...elements.entries()];
      enqueue(async () => {
        const received: OrderedExcalidrawElement[] = [];
        for (const [id, data] of values) {
          const element = await decryptElement(data);
          if (!element) continue;
          known.set(id, { version: element.version, versionNonce: element.versionNonce });
          received.push(element);
        }
        if (!handlers) return;
        peers = roomPeers();
        handlers.onRoomUserChange(peers);
        if (received.length) {
          deliver({ type: WS_SUBTYPES.INIT, payload: { elements: received } });
        } else {
          handlers.onFirstInRoom();
        }
      });
      onAwareness({ added: [...awareness.getStates().keys()], updated: [], removed: [] });
    },

    close() {
      if (!handlers) return;
      elements.unobserve(onElements);
      awareness.off("change", onAwareness);
      handlers = null;
      awareness.setLocalStateField(field, null);
    },

    async broadcast(data) {
      if (!cipher) return;
      switch (data.type) {
        case WS_SUBTYPES.INIT:
        case WS_SUBTYPES.UPDATE: {
          const sealer = cipher;
          const candidates = data.payload.elements;
          // written in the order they were sent, an edit's copy never over its next one's
          return new Promise<void>((resolve) => {
            enqueue(async () => {
              try {
                const sealed: Array<[string, Written]> = [];
                for (const element of candidates) {
                  const copy = known.get(element.id);
                  if (
                    copy &&
                    ((copy.version === element.version &&
                      copy.versionNonce === element.versionNonce) ||
                      wins(copy, element))
                  ) {
                    continue;
                  }
                  sealed.push([
                    element.id,
                    {
                      version: element.version,
                      versionNonce: element.versionNonce,
                      data: await sealer.encrypt(element),
                    },
                  ]);
                }
                if (!sealed.length) return;
                doc.transact(() => {
                  for (const [id, copy] of sealed) {
                    written.set(id, copy);
                    known.set(id, { version: copy.version, versionNonce: copy.versionNonce });
                    elements.set(id, copy.data);
                  }
                }, origin);
              } finally {
                resolve();
              }
            });
          });
        }
        case WS_SUBTYPES.MOUSE_LOCATION: {
          const { pointer, button, selectedElementIds, username } = data.payload;
          presence = { ...presence, pointer, button, selectedElementIds, username };
          break;
        }
        case WS_SUBTYPES.IDLE_STATUS: {
          const { userState, username } = data.payload;
          presence = { ...presence, userState, username };
          break;
        }
        case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS: {
          if (!followers.length) return;
          const { sceneBounds, username } = data.payload;
          presence = { ...presence, sceneBounds, username };
          break;
        }
      }
      publishPresence();
    },

    follow({ userToFollow, action }) {
      if (action === "FOLLOW") {
        presence = { ...presence, following: userToFollow.socketId };
        // bounds they share already, for someone else, are where they are now
        const shared = seen.get(Number(userToFollow.socketId));
        if (shared?.sceneBounds) {
          const sceneBounds = shared.sceneBounds;
          enqueue(async () =>
            deliver({
              type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
              payload: {
                socketId: userToFollow.socketId,
                username: shared.username ?? "",
                sceneBounds,
              },
            }),
          );
        }
      } else if (presence.following === userToFollow.socketId) {
        presence = { ...presence, following: null };
      } else {
        return;
      }
      publishPresence();
    },

    async saveFiles(encoded: readonly EncodedFile[]): Promise<SaveFilesResult> {
      doc.transact(() => {
        for (const { id, buffer } of encoded) files.set(id, buffer);
      }, origin);
      return { savedFiles: encoded.map(({ id }) => id), erroredFiles: [] };
    },

    async loadFiles(ids: readonly FileId[]): Promise<LoadFilesResult> {
      const loadedFiles: EncodedFile[] = [];
      const erroredFiles: FileId[] = [];
      for (const id of new Set(ids)) {
        const buffer = files.get(id);
        if (buffer) {
          loadedFiles.push({ id, buffer: new Uint8Array(buffer) });
        } else {
          erroredFiles.push(id);
        }
      }
      return { loadedFiles, erroredFiles };
    },
  };
}
