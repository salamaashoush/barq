import { ENCRYPTION_KEY_BITS } from "@excalidraw/common";

export const IV_LENGTH_BYTES = 12;

export function createIV(): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(IV_LENGTH_BYTES);
  return globalThis.crypto.getRandomValues(arr);
}

export async function generateEncryptionKey<T extends "string" | "cryptoKey" = "string">(
  returnAs?: T,
): Promise<T extends "cryptoKey" ? CryptoKey : string> {
  const key = await globalThis.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: ENCRYPTION_KEY_BITS,
    },
    true, // extractable
    ["encrypt", "decrypt"],
  );
  return (
    returnAs === "cryptoKey" ? key : (await globalThis.crypto.subtle.exportKey("jwk", key)).k
  ) as T extends "cryptoKey" ? CryptoKey : string;
}

export function getCryptoKey(key: string, usage: KeyUsage): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "jwk",
    {
      alg: "A128GCM",
      ext: true,
      k: key,
      key_ops: ["encrypt", "decrypt"],
      kty: "oct",
    },
    {
      name: "AES-GCM",
      length: ENCRYPTION_KEY_BITS,
    },
    false, // extractable
    [usage],
  );
}

export interface EncryptedData {
  encryptedBuffer: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
}

export async function encryptData(
  key: string | CryptoKey,
  data: Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | string,
): Promise<EncryptedData> {
  const importedKey = typeof key === "string" ? await getCryptoKey(key, "encrypt") : key;
  const iv = createIV();
  const buffer: ArrayBuffer | Uint8Array<ArrayBuffer> =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : data instanceof Blob
          ? await data.arrayBuffer()
          : data;

  // We use symmetric encryption. AES-GCM is the recommended algorithm and
  // includes checks that the ciphertext has not been modified by an attacker.
  const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    importedKey,
    buffer,
  );

  return { encryptedBuffer, iv };
}

export async function decryptData(
  iv: Uint8Array<ArrayBuffer>,
  encrypted: Uint8Array<ArrayBuffer> | ArrayBuffer,
  privateKey: string | CryptoKey,
): Promise<ArrayBuffer> {
  const key =
    typeof privateKey === "string" ? await getCryptoKey(privateKey, "decrypt") : privateKey;
  return globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encrypted,
  );
}
