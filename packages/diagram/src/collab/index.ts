/**
 * `@barqjs/diagram/collab`: Excalidraw's live collaboration for an editor.
 * `createCollaboration` binds an editor's API to a room through a
 * transport, `createWebSocketTransport` (a room server, as
 * `createWebSocketRooms` from `@barqjs/start` serves) or
 * `createYjsTransport` from `@barqjs/diagram/collab/yjs`; scene, presence
 * and files are encrypted with the room key end to end.
 */

export { createCollaboration } from "./collaboration.ts";
export type { Collaboration, CollaborationOptions, CollaborationState } from "./collaboration.ts";
export { createWebSocketTransport } from "./websocket.ts";
export type { WebSocketTransportOptions } from "./websocket.ts";
export { createRoomCipher } from "./transport.ts";
export type {
  CollabCipher,
  CollabTransport,
  CollabTransportHandlers,
  EncodedFile,
  LoadFilesResult,
  SaveFilesResult,
  SaveSceneResult,
  StoredScene,
} from "./transport.ts";
export {
  DELETED_ELEMENT_TIMEOUT,
  WS_SUBTYPES,
  generateCollaborationLinkData,
  getCollaborationLink,
  getCollaborationLinkData,
  getSyncableElements,
  isCollaborationLink,
  isSocketUpdateData,
  isSyncableElement,
} from "./data.ts";
export type {
  CollaborationLinkData,
  SocketUpdateData,
  SocketUpdateDataIncoming,
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "./data.ts";
export {
  FILE_UPLOAD_MAX_BYTES,
  FileManager,
  decodeFileFromDownload,
  encodeFilesForUpload,
  updateStaleImageStatuses,
} from "./files.ts";
export type { FileLoadingStatus } from "./files.ts";
export { reconcileElements } from "../data/reconcile.ts";
export type { ReconciledExcalidrawElement, RemoteExcalidrawElement } from "../data/reconcile.ts";
export {
  IV_LENGTH_BYTES,
  createIV,
  decryptData,
  encryptData,
  generateEncryptionKey,
  getCryptoKey,
} from "../data/encryption.ts";
export { compressData, decompressData } from "../data/encode.ts";
