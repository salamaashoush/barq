import { UserIdleState, bytesToHexString } from "@excalidraw/common";
import { isInvisiblySmallElement } from "@excalidraw/element";

import type { SceneBounds } from "@excalidraw/element";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { generateEncryptionKey } from "../data/encryption.ts";
import { LocalizedError } from "../i18n.ts";

import type { AppState, CollaboratorPointer, SocketId } from "../types.ts";

/** How long a deleted element is still sent, for clients that were away to delete it too. */
export const DELETED_ELEMENT_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day
const ROOM_ID_BYTES = 10;

declare const syncableBrand: unique symbol;

export type SyncableExcalidrawElement = OrderedExcalidrawElement & {
  readonly [syncableBrand]: "SyncableExcalidrawElement";
};

/** Whether an element is sent: not invisibly small, and deleted only for a day. */
export function isSyncableElement(
  element: OrderedExcalidrawElement,
): element is SyncableExcalidrawElement {
  if (element.isDeleted) {
    if (element.updated > Date.now() - DELETED_ELEMENT_TIMEOUT) {
      return true;
    }
    return false;
  }
  return !isInvisiblySmallElement(element);
}

export function getSyncableElements(
  elements: readonly OrderedExcalidrawElement[],
): SyncableExcalidrawElement[] {
  return elements.filter(isSyncableElement);
}

/** The messages of a session, Excalidraw's `WS_SUBTYPES`. */
export const WS_SUBTYPES = {
  INVALID_RESPONSE: "INVALID_RESPONSE",
  INIT: "SCENE_INIT",
  UPDATE: "SCENE_UPDATE",
  MOUSE_LOCATION: "MOUSE_LOCATION",
  IDLE_STATUS: "IDLE_STATUS",
  USER_VISIBLE_SCENE_BOUNDS: "USER_VISIBLE_SCENE_BOUNDS",
} as const;

export interface InvalidResponseMessage {
  type: typeof WS_SUBTYPES.INVALID_RESPONSE;
}

export interface SceneInitMessage {
  type: typeof WS_SUBTYPES.INIT;
  payload: ScenePayload;
}

export interface ScenePayload {
  elements: readonly OrderedExcalidrawElement[];
}

export interface SceneUpdateMessage {
  type: typeof WS_SUBTYPES.UPDATE;
  payload: ScenePayload;
}

export interface MouseLocationMessage {
  type: typeof WS_SUBTYPES.MOUSE_LOCATION;
  payload: MouseLocationPayload;
}

export interface MouseLocationPayload {
  socketId: SocketId;
  pointer: Pick<CollaboratorPointer, "x" | "y" | "tool">;
  button: "down" | "up";
  selectedElementIds: AppState["selectedElementIds"];
  username: string;
}

export interface VisibleSceneBoundsMessage {
  type: typeof WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS;
  payload: VisibleSceneBoundsPayload;
}

export interface VisibleSceneBoundsPayload {
  socketId: SocketId;
  username: string;
  sceneBounds: SceneBounds;
}

export interface IdleStatusMessage {
  type: typeof WS_SUBTYPES.IDLE_STATUS;
  payload: IdleStatusPayload;
}

export interface IdleStatusPayload {
  socketId: SocketId;
  userState: UserIdleState;
  username: string;
}

export type SocketUpdateDataSource = {
  INVALID_RESPONSE: InvalidResponseMessage;
  SCENE_INIT: SceneInitMessage;
  SCENE_UPDATE: SceneUpdateMessage;
  MOUSE_LOCATION: MouseLocationMessage;
  USER_VISIBLE_SCENE_BOUNDS: VisibleSceneBoundsMessage;
  IDLE_STATUS: IdleStatusMessage;
};

/** Any message a client receives. */
export type SocketUpdateDataIncoming = SocketUpdateDataSource[keyof SocketUpdateDataSource];

/** A message a client sends. */
export type SocketUpdateData = Exclude<
  SocketUpdateDataIncoming,
  SocketUpdateDataSource["INVALID_RESPONSE"]
>;

const MESSAGE_TYPES = new Set<string>(Object.values(WS_SUBTYPES));
const IDLE_STATES = new Set<string>(Object.values(UserIdleState));

interface UncheckedMessage {
  type?: unknown;
  payload?: unknown;
}

/** Whether a decrypted value has a message's shape, rather than trusting it to. */
export function isSocketUpdateData(value: unknown): value is SocketUpdateData {
  if (typeof value !== "object" || value === null) return false;
  const { type, payload } = value as UncheckedMessage;
  if (typeof type !== "string" || !MESSAGE_TYPES.has(type)) return false;
  if (type === WS_SUBTYPES.INVALID_RESPONSE) return false;
  if (typeof payload !== "object" || payload === null) return false;
  const fields = payload as Record<string, unknown>;
  switch (type) {
    case WS_SUBTYPES.INIT:
    case WS_SUBTYPES.UPDATE:
      return Array.isArray(fields.elements);
    case WS_SUBTYPES.MOUSE_LOCATION:
      return typeof fields.socketId === "string" && typeof fields.pointer === "object";
    case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS:
      return typeof fields.socketId === "string" && Array.isArray(fields.sceneBounds);
    case WS_SUBTYPES.IDLE_STATUS:
      return (
        typeof fields.socketId === "string" &&
        typeof fields.userState === "string" &&
        IDLE_STATES.has(fields.userState)
      );
    default:
      return false;
  }
}

/** A room, as a collaboration link carries it. */
export interface CollaborationLinkData {
  roomId: string;
  /** The room's key, which never reaches a server: it is in the link's hash. */
  roomKey: string;
}

const RE_COLLAB_LINK = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;

export function isCollaborationLink(link: string): boolean {
  const hash = new URL(link).hash;
  return RE_COLLAB_LINK.test(hash);
}

/**
 * The room a link's `#room=id,key` names, or `null` for a link without
 * one; a key that is not a room key's 22 characters throws, with
 * `alerts.invalidEncryptionKey` to show.
 */
export function getCollaborationLinkData(link: string): CollaborationLinkData | null {
  const hash = new URL(link).hash;
  const match = hash.match(RE_COLLAB_LINK);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  if (match[2].length !== 22) {
    throw new LocalizedError({ key: "alerts.invalidEncryptionKey" });
  }
  return { roomId: match[1], roomKey: match[2] };
}

/** A new room: a random id, and a new AES-GCM key. */
export async function generateCollaborationLinkData(): Promise<CollaborationLinkData> {
  const buffer = new Uint8Array(ROOM_ID_BYTES);
  globalThis.crypto.getRandomValues(buffer);
  const roomId = bytesToHexString(buffer);
  const roomKey = await generateEncryptionKey();

  if (!roomKey) {
    throw new Error("Couldn't generate room key");
  }

  return { roomId, roomKey };
}

/** The link to a room on a page, the page's address by default. */
export function getCollaborationLink(
  data: CollaborationLinkData,
  page: string | URL = globalThis.location.href,
): string {
  const url = new URL(page);
  return `${url.origin}${url.pathname}#room=${data.roomId},${data.roomKey}`;
}
