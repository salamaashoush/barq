/**
 * What a session is built from: room links, the room cipher, files encoded
 * for upload as Excalidraw encodes them, and which elements are sent.
 */

import { describe, expect, test } from "bun:test";
import { newElementWith } from "@excalidraw/element";

import { compressData, decompressData } from "../data/encode.ts";
import { generateEncryptionKey } from "../data/encryption.ts";
import { LocalizedError } from "../i18n.ts";
import {
  DELETED_ELEMENT_TIMEOUT,
  generateCollaborationLinkData,
  getCollaborationLink,
  getCollaborationLinkData,
  getSyncableElements,
  isCollaborationLink,
  isSocketUpdateData,
} from "./data.ts";
import { decodeFileFromDownload, encodeFilesForUpload } from "./files.ts";
import { createRoomCipher } from "./transport.ts";
import { rect } from "./test-collab.ts";

import type { FileId } from "@excalidraw/element/types";

import type { BinaryFileData, DataURL } from "../types.ts";

describe("room links", () => {
  test("a new room has a random id and a 22-character key, carried in the link's hash", async () => {
    const room = await generateCollaborationLinkData();
    expect(room.roomId).toMatch(/^[0-9a-f]{20}$/);
    expect(room.roomKey).toHaveLength(22);
    const link = getCollaborationLink(room, "https://example.com/board?tab=1#old");
    expect(link).toBe(`https://example.com/board#room=${room.roomId},${room.roomKey}`);
    expect(isCollaborationLink(link)).toBe(true);
    expect(getCollaborationLinkData(link)).toEqual(room);
    expect((await generateCollaborationLinkData()).roomId).not.toBe(room.roomId);
  });

  test("a link without a room is none, and one with a short key throws a message to show", () => {
    expect(isCollaborationLink("https://example.com/board")).toBe(false);
    expect(getCollaborationLinkData("https://example.com/board#json=1,2")).toBe(null);
    let thrown: unknown;
    try {
      getCollaborationLinkData("https://example.com/#room=abc,short");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LocalizedError);
    expect((thrown as LocalizedError).localized).toEqual({ key: "alerts.invalidEncryptionKey" });
  });
});

describe("the room cipher", () => {
  test("seals a value that only the room's key opens, and refuses a changed one", async () => {
    const key = await generateEncryptionKey();
    const cipher = createRoomCipher(key);
    const sealed = await cipher.encrypt({ type: "SCENE_UPDATE", payload: { elements: [] } });
    expect(new TextDecoder("latin1").decode(sealed)).not.toContain("SCENE_UPDATE");
    expect(await cipher.decrypt(sealed)).toEqual({
      type: "SCENE_UPDATE",
      payload: { elements: [] },
    });
    // a fresh IV every time
    expect((await cipher.encrypt("same")).join()).not.toBe((await cipher.encrypt("same")).join());

    const other = createRoomCipher(await generateEncryptionKey());
    await expect(other.decrypt(sealed)).rejects.toBeDefined();
    const tampered = sealed.slice();
    tampered[tampered.length - 1]! ^= 1;
    await expect(cipher.decrypt(tampered)).rejects.toBeDefined();
  });

  test("a decrypted value is a message only with a message's shape", () => {
    expect(isSocketUpdateData({ type: "SCENE_UPDATE", payload: { elements: [] } })).toBe(true);
    expect(
      isSocketUpdateData({
        type: "IDLE_STATUS",
        payload: { socketId: "a", userState: "away", username: "Salama" },
      }),
    ).toBe(true);
    expect(isSocketUpdateData({ type: "IDLE_STATUS", payload: { socketId: "a" } })).toBe(false);
    expect(isSocketUpdateData({ type: "INVALID_RESPONSE" })).toBe(false);
    expect(isSocketUpdateData({ type: "SOMETHING", payload: {} })).toBe(false);
    expect(isSocketUpdateData("SCENE_UPDATE")).toBe(false);
  });
});

describe("files", () => {
  const file: BinaryFileData = {
    id: "file-1" as FileId,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,AAAA" as DataURL,
    created: 1,
  };

  test("compressData carries its metadata, encrypted and compressed, and decompressData reads them", async () => {
    const key = await generateEncryptionKey();
    const data = new TextEncoder().encode("hello ".repeat(100));
    const compressed = await compressData(data, { encryptionKey: key, metadata: { name: "x" } });
    expect(compressed.byteLength).toBeLessThan(data.byteLength);
    expect(new TextDecoder("latin1").decode(compressed)).not.toContain("hello");
    const { metadata, data: decoded } = await decompressData(compressed, {
      decryptionKey: key,
    });
    expect(metadata).toEqual({ name: "x" });
    expect(new TextDecoder().decode(decoded)).toBe("hello ".repeat(100));
  });

  test("a file goes up encrypted and comes back as it was", async () => {
    const key = await generateEncryptionKey();
    const [encoded] = await encodeFilesForUpload({
      files: new Map([[file.id, file]]),
      encryptionKey: key,
      maxBytes: 1024,
    });
    expect(encoded!.id).toBe(file.id);
    expect(new TextDecoder("latin1").decode(encoded!.buffer)).not.toContain("base64");
    expect(await decodeFileFromDownload(encoded!, key)).toMatchObject({
      id: file.id,
      mimeType: "image/png",
      dataURL: file.dataURL,
    });
  });

  test("a file over the size is refused with a message to show", async () => {
    const encoding = encodeFilesForUpload({
      files: new Map([[file.id, file]]),
      encryptionKey: await generateEncryptionKey(),
      maxBytes: 4,
    });
    await expect(encoding).rejects.toBeInstanceOf(LocalizedError);
  });
});

describe("which elements are sent", () => {
  test("not the invisibly small, and the deleted only for a day", () => {
    const now = Date.now();
    const visible = rect("visible", 0);
    const tiny = { ...rect("tiny", 0), width: 0, height: 0 };
    const deleted = { ...newElementWith(rect("deleted", 0), { isDeleted: true }), updated: now };
    const longGone = {
      ...newElementWith(rect("gone", 0), { isDeleted: true }),
      updated: now - DELETED_ELEMENT_TIMEOUT - 1,
    };
    expect(
      getSyncableElements([visible, tiny, deleted, longGone] as never).map((each) => each.id),
    ).toEqual(["visible", "deleted"]);
  });
});
