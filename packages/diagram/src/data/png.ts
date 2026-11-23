/**
 * The PNG chunk stream, read and written: enough to carry a scene in a
 * `tEXt` chunk the way Excalidraw's exports do. The format is the one
 * `png-chunks-extract`, `png-chunks-encode` and `png-chunk-text` read and
 * write, so a PNG from either side opens on the other.
 */

export interface PngChunk {
  name: string;
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function extractChunks(bytes: Uint8Array): PngChunk[] {
  if (bytes.length < 8 || SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
    throw new Error("Invalid .png file header");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let cursor = 8;
  while (cursor + 12 <= bytes.length) {
    const length = view.getUint32(cursor);
    const typeStart = cursor + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error("Truncated .png chunk");
    const name = String.fromCharCode(...bytes.subarray(typeStart, dataStart));
    if (view.getUint32(dataEnd) !== crc32(bytes, typeStart, dataEnd)) {
      throw new Error(`CRC values for ${name} chunk do not match`);
    }
    chunks.push({ name, data: bytes.slice(dataStart, dataEnd) });
    cursor = dataEnd + 4;
    if (name === "IEND") return chunks;
  }
  throw new Error(".png file ended prematurely: no IEND header was found");
}

export function encodeChunks(chunks: readonly PngChunk[]): Uint8Array<ArrayBuffer> {
  const size = chunks.reduce((total, chunk) => total + chunk.data.length + 12, 8);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(SIGNATURE, 0);
  let cursor = 8;
  for (const chunk of chunks) {
    view.setUint32(cursor, chunk.data.length);
    const typeStart = cursor + 4;
    for (let i = 0; i < 4; i++) out[typeStart + i] = chunk.name.charCodeAt(i);
    out.set(chunk.data, typeStart + 4);
    const dataEnd = typeStart + 4 + chunk.data.length;
    view.setUint32(dataEnd, crc32(out, typeStart, dataEnd));
    cursor = dataEnd + 4;
  }
  return out;
}

function isLatin1(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
}

/** A `tEXt` chunk: a Latin-1 keyword, a NUL, then Latin-1 text. */
export function encodeTextChunk(keyword: string, text: string): PngChunk {
  if (!isLatin1(keyword) || !isLatin1(text)) {
    throw new Error("Only Latin-1 characters are permitted in PNG tEXt chunks");
  }
  if (keyword.length === 0 || keyword.length >= 80) {
    throw new Error("A tEXt keyword must be 1 to 79 characters long");
  }
  const data = new Uint8Array(keyword.length + 1 + text.length);
  for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i);
  for (let i = 0; i < text.length; i++) data[keyword.length + 1 + i] = text.charCodeAt(i);
  return { name: "tEXt", data };
}

export function decodeTextChunk(data: Uint8Array): { keyword: string; text: string } {
  const separator = data.indexOf(0);
  if (separator === -1) return { keyword: latin1(data, 0, data.length), text: "" };
  return {
    keyword: latin1(data, 0, separator),
    text: latin1(data, separator + 1, data.length),
  };
}

function latin1(data: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) out += String.fromCharCode(data[i]!);
  return out;
}
