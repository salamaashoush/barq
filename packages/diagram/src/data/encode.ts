import { deflate, inflate } from "pako";

import { decryptData, encryptData } from "./encryption.ts";

// -----------------------------------------------------------------------------
// byte (binary) strings
// -----------------------------------------------------------------------------

// Buffer-compatible implem.
//
// Note that in V8, spreading the uint8array (by chunks) into
// `String.fromCharCode(...uint8array)` tends to be faster for large
// strings/buffers, in case perf is needed in the future.
export function toByteString(data: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let bstring = "";
  for (const byte of bytes) {
    bstring += String.fromCharCode(byte);
  }
  return bstring;
}

function byteStringToArrayBuffer(byteString: string) {
  const buffer = new ArrayBuffer(byteString.length);
  const bufferView = new Uint8Array(buffer);
  for (let i = 0, len = byteString.length; i < len; i++) {
    bufferView[i] = byteString.charCodeAt(i);
  }
  return buffer;
}

function byteStringToString(byteString: string) {
  return new TextDecoder("utf-8").decode(byteStringToArrayBuffer(byteString));
}

// -----------------------------------------------------------------------------
// base64
// -----------------------------------------------------------------------------

/**
 * @param isByteString set to true if already byte string to prevent bloat
 *  due to reencoding
 */
export function stringToBase64(str: string, isByteString = false) {
  return isByteString ? btoa(str) : btoa(toByteString(str));
}

// async to align with stringToBase64
export function base64ToString(base64: string, isByteString = false) {
  return isByteString ? atob(base64) : byteStringToString(atob(base64));
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return byteStringToArrayBuffer(atob(base64));
}

// -----------------------------------------------------------------------------
// base64url
// -----------------------------------------------------------------------------

export function base64urlToString(str: string) {
  return atob(
    // normalize base64URL to base64
    str
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(str.length + ((4 - (str.length % 4)) % 4), "="),
  );
}

// -----------------------------------------------------------------------------
// text encoding
// -----------------------------------------------------------------------------

export type EncodedData = {
  encoded: string;
  encoding: "bstring";
  /** whether text is compressed (zlib) */
  compressed: boolean;
  /** version for potential migration purposes */
  version?: string;
};

export interface EncodeOptions {
  text: string;
  /** defaults to `true`. If compression fails, falls back to bstring alone. */
  compress?: boolean;
}

/**
 * Encodes (and potentially compresses via zlib) text to byte string
 */
export function encode({ text, compress }: EncodeOptions): EncodedData {
  let deflated!: string;
  if (compress !== false) {
    try {
      deflated = toByteString(deflate(text));
    } catch (error: unknown) {
      console.error("encode: cannot deflate", error);
    }
  }
  return {
    version: "1",
    encoding: "bstring",
    compressed: !!deflated,
    encoded: deflated || toByteString(text),
  };
}

export function decode(data: EncodedData): string {
  let decoded: string;

  switch (data.encoding) {
    case "bstring":
      // if compressed, do not double decode the bstring
      decoded = data.compressed ? data.encoded : byteStringToString(data.encoded);
      break;
    default:
      throw new Error(`decode: unknown encoding "${String(data.encoding)}"`);
  }

  if (data.compressed) {
    return inflate(new Uint8Array(byteStringToArrayBuffer(decoded)), {
      to: "string",
    });
  }

  return decoded;
}

// -----------------------------------------------------------------------------
// binary encoding
// -----------------------------------------------------------------------------

export type FileEncodingInfo = {
  /* version 2 is the version we're shipping the initial image support with.
    version 1 was a PR version that a lot of people were using anyway.
    Thus, if there are issues we can check whether they're not using the
    unoffic version */
  version: 1 | 2;
  compression: "pako@1" | null;
  encryption: "AES-GCM" | null;
};

// -----------------------------------------------------------------------------
const CONCAT_BUFFERS_VERSION = 1;
/** how many bytes we use to encode how many bytes the next chunk has.
 * Corresponds to DataView setter methods (setUint32, setUint16, etc).
 *
 * NOTE ! values must not be changed, which would be backwards incompatible !
 */
const VERSION_DATAVIEW_BYTES = 4;
const NEXT_CHUNK_SIZE_DATAVIEW_BYTES = 4;
// -----------------------------------------------------------------------------

const DATA_VIEW_BITS_MAP = { 1: 8, 2: 16, 4: 32 } as const;

// getter
function dataView(buffer: Uint8Array, bytes: 1 | 2 | 4, offset: number): number;
// setter
function dataView(buffer: Uint8Array, bytes: 1 | 2 | 4, offset: number, value: number): Uint8Array;
/**
 * abstraction over DataView that serves as a typed getter/setter in case
 * you're using constants for the byte size and want to ensure there's no
 * discrepenancy in the encoding across refactors.
 *
 * DataView serves for an endian-agnostic handling of numbers in ArrayBuffers.
 */
function dataView(
  buffer: Uint8Array,
  bytes: 1 | 2 | 4,
  offset: number,
  value?: number,
): Uint8Array | number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (value !== undefined) {
    if (value > Math.pow(2, DATA_VIEW_BITS_MAP[bytes]) - 1) {
      throw new Error(
        `attempting to set value higher than the allocated bytes (value: ${value}, bytes: ${bytes})`,
      );
    }
    const method = `setUint${DATA_VIEW_BITS_MAP[bytes]}` as const;
    view[method](offset, value);
    return buffer;
  }
  const method = `getUint${DATA_VIEW_BITS_MAP[bytes]}` as const;
  return view[method](offset);
}

// -----------------------------------------------------------------------------

/**
 * Resulting concatenated buffer has this format:
 *
 * [
 *   VERSION chunk (4 bytes)
 *   LENGTH chunk 1 (4 bytes)
 *   DATA chunk 1 (up to 2^32 bits)
 *   LENGTH chunk 2 (4 bytes)
 *   DATA chunk 2 (up to 2^32 bits)
 *   ...
 * ]
 *
 * @param buffers each buffer (chunk) must be at most 2^32 bits large (~4GB)
 */
function concatBuffers(...buffers: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bufferView = new Uint8Array(
    VERSION_DATAVIEW_BYTES +
      NEXT_CHUNK_SIZE_DATAVIEW_BYTES * buffers.length +
      buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0),
  );

  let cursor = 0;

  // as the first chunk we'll encode the version for backwards compatibility
  dataView(bufferView, VERSION_DATAVIEW_BYTES, cursor, CONCAT_BUFFERS_VERSION);
  cursor += VERSION_DATAVIEW_BYTES;

  for (const buffer of buffers) {
    dataView(bufferView, NEXT_CHUNK_SIZE_DATAVIEW_BYTES, cursor, buffer.byteLength);
    cursor += NEXT_CHUNK_SIZE_DATAVIEW_BYTES;

    bufferView.set(buffer, cursor);
    cursor += buffer.byteLength;
  }

  return bufferView;
}

/** can only be used on buffers created via `concatBuffers()` */
function splitBuffers(concatenatedBuffer: Uint8Array): Uint8Array<ArrayBuffer>[] {
  const buffers: Uint8Array<ArrayBuffer>[] = [];

  let cursor = 0;

  // first chunk is the version
  const version = dataView(concatenatedBuffer, NEXT_CHUNK_SIZE_DATAVIEW_BYTES, cursor);
  // If version is outside of the supported versions, throw an error.
  // This usually means the buffer wasn't encoded using this API, so we'd only
  // waste compute.
  if (version > CONCAT_BUFFERS_VERSION) {
    throw new Error(`invalid version ${version}`);
  }

  cursor += VERSION_DATAVIEW_BYTES;

  while (true) {
    const chunkSize = dataView(concatenatedBuffer, NEXT_CHUNK_SIZE_DATAVIEW_BYTES, cursor);
    cursor += NEXT_CHUNK_SIZE_DATAVIEW_BYTES;

    buffers.push(concatenatedBuffer.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
    if (cursor >= concatenatedBuffer.byteLength) {
      break;
    }
  }

  return buffers;
}

// helpers for (de)compressing data with JSON metadata including encryption
// -----------------------------------------------------------------------------

/** @private */
async function _encryptAndCompress(
  data: Uint8Array<ArrayBuffer> | string,
  encryptionKey: string | CryptoKey,
) {
  const { encryptedBuffer, iv } = await encryptData(encryptionKey, deflate(data));

  return { iv, buffer: new Uint8Array(encryptedBuffer) };
}

export interface CompressionKey {
  encryptionKey: string | CryptoKey;
}

export interface OptionalMetadata<T extends Record<string, unknown>> {
  metadata?: T;
}

export interface RequiredMetadata<T extends Record<string, unknown>> {
  metadata: T;
}

/**
 * The returned buffer has following format:
 * `[]` refers to a buffers wrapper (see `concatBuffers`)
 *
 * [
 *   encodingMetadataBuffer,
 *   iv,
 *   [
 *      contentsMetadataBuffer
 *      contentsBuffer
 *   ]
 * ]
 */
export async function compressData<T extends Record<string, unknown> = never>(
  dataBuffer: Uint8Array,
  options: CompressionKey & ([T] extends [never] ? OptionalMetadata<T> : RequiredMetadata<T>),
): Promise<Uint8Array<ArrayBuffer>> {
  const fileInfo: FileEncodingInfo = {
    version: 2,
    compression: "pako@1",
    encryption: "AES-GCM",
  };

  const encodingMetadataBuffer = new TextEncoder().encode(JSON.stringify(fileInfo));

  const contentsMetadataBuffer = new TextEncoder().encode(JSON.stringify(options.metadata || null));

  const { iv, buffer } = await _encryptAndCompress(
    concatBuffers(contentsMetadataBuffer, dataBuffer),
    options.encryptionKey,
  );

  return concatBuffers(encodingMetadataBuffer, iv, buffer);
}

/** @private */
async function _decryptAndDecompress(
  iv: Uint8Array<ArrayBuffer>,
  decryptedBuffer: Uint8Array<ArrayBuffer>,
  decryptionKey: string | CryptoKey,
  isCompressed: boolean,
): Promise<Uint8Array> {
  decryptedBuffer = new Uint8Array(await decryptData(iv, decryptedBuffer, decryptionKey));

  if (isCompressed) {
    return inflate(decryptedBuffer);
  }

  return decryptedBuffer;
}

export interface DecompressDataOptions {
  decryptionKey: string | CryptoKey;
}

export interface DecompressedData {
  /** metadata source is always JSON so we can decode it here */
  metadata: unknown;
  /** data can be anything so the caller must decode it */
  data: Uint8Array<ArrayBuffer>;
}

export async function decompressData(
  bufferView: Uint8Array,
  options: DecompressDataOptions,
): Promise<DecompressedData> {
  // first chunk is encoding metadata (ignored for now)
  const [encodingMetadataBuffer, iv, buffer] = splitBuffers(bufferView);
  if (!encodingMetadataBuffer || !iv || !buffer) {
    throw new Error("decompressData: the buffer is not compressed data");
  }

  const encodingMetadata = JSON.parse(
    new TextDecoder().decode(encodingMetadataBuffer),
  ) as FileEncodingInfo;

  try {
    const [contentsMetadataBuffer, contentsBuffer] = splitBuffers(
      await _decryptAndDecompress(
        iv,
        buffer,
        options.decryptionKey,
        !!encodingMetadata.compression,
      ),
    );
    if (!contentsMetadataBuffer || !contentsBuffer) {
      throw new Error("decompressData: the contents are incomplete");
    }

    const metadata: unknown = JSON.parse(new TextDecoder().decode(contentsMetadataBuffer));

    return {
      metadata,
      data: contentsBuffer,
    };
  } catch (error: unknown) {
    console.error(`Error during decompressing and decrypting the file.`, encodingMetadata);
    throw error;
  }
}
