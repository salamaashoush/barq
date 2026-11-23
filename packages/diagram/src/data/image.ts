import { EXPORT_DATA_TYPES, MIME_TYPES } from "@excalidraw/common";

import { blobToArrayBuffer } from "./blob.ts";
import { encode, decode } from "./encode.ts";
import type { EncodedData } from "./encode.ts";
import { decodeTextChunk, encodeChunks, encodeTextChunk, extractChunks } from "./png.ts";

// -----------------------------------------------------------------------------
// PNG
// -----------------------------------------------------------------------------

export const getTEXtChunk = async (
  blob: Blob,
): Promise<{ keyword: string; text: string } | null> => {
  const chunks = extractChunks(new Uint8Array(await blobToArrayBuffer(blob)));
  const metadataChunk = chunks.find((chunk) => chunk.name === "tEXt");
  if (metadataChunk) {
    return decodeTextChunk(metadataChunk.data);
  }
  return null;
};

export const encodePngMetadata = async ({ blob, metadata }: { blob: Blob; metadata: string }) => {
  const chunks = extractChunks(new Uint8Array(await blobToArrayBuffer(blob)));

  const metadataChunk = encodeTextChunk(
    MIME_TYPES.excalidraw,
    JSON.stringify(
      encode({
        text: metadata,
        compress: true,
      }),
    ),
  );
  // insert metadata before last chunk (iEND)
  chunks.splice(-1, 0, metadataChunk);

  return new Blob([encodeChunks(chunks)], { type: MIME_TYPES.png });
};

export const decodePngMetadata = async (blob: Blob) => {
  const metadata = await getTEXtChunk(blob);
  if (metadata?.keyword === MIME_TYPES.excalidraw) {
    try {
      const encodedData = JSON.parse(metadata.text) as EncodedData | { type?: unknown };
      if (!("encoded" in encodedData)) {
        // legacy, un-encoded scene JSON
        if ("type" in encodedData && encodedData.type === EXPORT_DATA_TYPES.excalidraw) {
          return metadata.text;
        }
        throw new Error("FAILED");
      }
      return decode(encodedData);
    } catch (error) {
      console.error(error);
      throw new Error("FAILED", { cause: error });
    }
  }
  throw new Error("INVALID");
};
