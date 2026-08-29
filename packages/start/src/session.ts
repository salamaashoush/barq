/**
 * Sealed-cookie sessions, on WebCrypto and nothing else.
 *
 * The session lives in the cookie, encrypted and authenticated, so there is no
 * store to run and no sticky routing to arrange. That is h3's design and
 * therefore TanStack's (`start-server-core/src/session.ts`), and the interface
 * below is theirs — `{ id, data, update, clear }` from `useSession({ password
 * })` — so the shape a reader already knows is the shape here.
 *
 * THE SEALING IS NOT THEIRS, and the divergence is deliberate. h3 uses iron,
 * which is AES-256-CBC for confidentiality plus a separate HMAC-SHA256 for
 * integrity, composed by hand. barq uses AES-GCM, which is AEAD: one primitive,
 * authenticated by construction, with no encrypt-then-MAC composition to get
 * wrong and no separate integrity key to derive. It is in WebCrypto, which Node,
 * Bun, Deno and workerd all have, so it costs no dependency. The consequence is
 * stated rather than hidden: a cookie sealed by h3 does not open here and one
 * sealed here does not open there.
 *
 * WHAT A SEALED COOKIE IS AND IS NOT. It is tamper-proof and unreadable by the
 * client. It is NOT revocable — a cookie already issued stays valid until it
 * expires, because nothing on the server is consulted to open it. That is the
 * trade the whole design makes, and an application that needs revocation needs a
 * store; `maxAge` bounds the damage and is enforced on unseal, not merely on the
 * cookie, so a client that keeps replaying an expired token gets nothing.
 */

import { getCookie, getRequest, setCookie } from "./context.ts";
import type { CookieOptions } from "./cookies.ts";

/** What a session holds. An application narrows it with the type argument. */
export type SessionData = Record<string, unknown>;

export interface Session<T extends SessionData = SessionData> {
  /** Stable for the life of the session. Useful as a log correlation key. */
  readonly id: string;
  /** When it was first sealed, as a millisecond timestamp. */
  readonly createdAt: number;
  readonly data: Partial<T>;
}

export interface SessionManager<T extends SessionData = SessionData> {
  readonly id: string;
  /** When the session was first sealed, as a millisecond timestamp. */
  readonly createdAt: number;
  readonly data: Partial<T>;
  /** Merge and re-seal. A function receives the current data. */
  update(
    patch: Partial<T> | ((current: Partial<T>) => Partial<T> | undefined),
  ): Promise<SessionManager<T>>;
  /** Drop it and expire the cookie. */
  clear(): Promise<SessionManager<T>>;
}

export interface SessionConfig {
  /**
   * The key the cookie is sealed with. At least 32 characters.
   *
   * It is a SECRET and belongs in the environment, never in source. Rotating it
   * invalidates every live session, which is the intended way to log everyone
   * out.
   */
  readonly password: string;
  /** Cookie name. Default `barq-session`. */
  readonly name?: string;
  /**
   * How long a sealed cookie stays valid, in seconds. Default 7 days.
   *
   * Enforced on UNSEAL as well as on the cookie, because the cookie's own expiry
   * is a request the client is free to ignore — the timestamp inside the sealed
   * payload is the one that cannot be edited.
   */
  readonly maxAge?: number;
  /**
   * Cookie attributes. The defaults are the strict ones — `httpOnly`, `secure`,
   * `sameSite: "lax"`, `path: "/"` — because a session cookie readable from
   * script is a session cookie an XSS takes.
   */
  readonly cookie?: CookieOptions;
}

const DEFAULT_NAME = "barq-session";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7;
/** Below this a password is not a key, whatever the KDF does with it. */
const MINIMUM_PASSWORD = 32;
/** Recognises our own envelope, and refuses another version rather than guessing. */
const VERSION = "b1";
const IV_BYTES = 12;
const SALT_BYTES = 16;

interface Sealed {
  readonly id: string;
  readonly createdAt: number;
  readonly data: SessionData;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

// `Uint8Array<ArrayBuffer>`, not the default `ArrayBufferLike`: WebCrypto's
// `BufferSource` requires the narrower one, and typing it here is what keeps a
// cast off every call site — where the lint rightly objects to one that does not
// change the type.
function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The key, derived per SALT rather than used raw.
 *
 * PBKDF2 because it is the KDF WebCrypto has everywhere; a fresh salt per seal
 * means two seals of the same data under the same password share no key, which
 * is what keeps the ciphertexts from being comparable.
 */
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function assertPassword(password: string): void {
  if (password.length < MINIMUM_PASSWORD) {
    throw new TypeError(
      `[barq] a session password must be at least ${MINIMUM_PASSWORD} characters; this one is ` +
        `${password.length}. It is a key, not a passphrase — generate one with ` +
        "`crypto.randomUUID()` twice, and keep it in the environment.",
    );
  }
}

/** Encrypt and sign a session. Exported for code that seals outside a request. */
export async function sealSession(config: SessionConfig, session: Sealed): Promise<string> {
  assertPassword(config.password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(config.password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return [VERSION, base64url(salt), base64url(iv), base64url(sealed)].join(".");
}

/**
 * Decrypt and verify, or `null`.
 *
 * `null` for EVERY failure — a wrong password, a tampered ciphertext, an expired
 * timestamp, a envelope from a future version — and never a throw. A session
 * that will not open is not an error the request should fail on; it is a visitor
 * who is not signed in, and the two must be indistinguishable to the caller so
 * that a forged cookie cannot be told apart from an absent one.
 */
export async function unsealSession(config: SessionConfig, sealed: string): Promise<Sealed | null> {
  assertPassword(config.password);
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const key = await deriveKey(config.password, fromBase64url(parts[1]));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(parts[2]) },
      key,
      fromBase64url(parts[3]),
    );
    const session = JSON.parse(new TextDecoder().decode(plaintext)) as Sealed;
    if (typeof session.id !== "string" || typeof session.createdAt !== "number") return null;
    // The cookie's own expiry is a REQUEST the client is free to ignore. The
    // timestamp inside the sealed payload is the one that cannot be edited, so
    // it is the one that decides.
    const maxAge = config.maxAge ?? DEFAULT_MAX_AGE;
    if (Date.now() - session.createdAt > maxAge * 1000) return null;
    return session;
  } catch {
    // AES-GCM's tag failed, or the envelope was not ours. Same answer either way.
    return null;
  }
}

function cookieOptions(config: SessionConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: config.maxAge ?? DEFAULT_MAX_AGE,
    ...config.cookie,
    // The sealed value is base64url and a `.` separator, every character of
    // which a cookie carries as it stands — so it stays readable in devtools
    // rather than becoming a wall of `%3D`.
    encode: (value) => value,
  };
}

/**
 * The session for this request, opening the cookie if there is one.
 *
 * Always answers a manager, never `null`: a visitor with no session has an empty
 * one, which is the same thing from the application's side and removes the
 * branch that is easy to get backwards.
 *
 * NOTHING IS WRITTEN until `update` is called. Reading a session must not
 * re-issue its cookie, or every page render would refresh an expiry the user did
 * not earn — and on a page that also sets `Cache-Control: public` that
 * `Set-Cookie` is a cache poisoning waiting to happen.
 */
export async function useSession<T extends SessionData = SessionData>(
  config: SessionConfig,
): Promise<SessionManager<T>> {
  assertPassword(config.password);
  const name = config.name ?? DEFAULT_NAME;
  // `getRequest` first, so the error outside a request names the real problem
  // rather than surfacing as an empty session.
  getRequest();

  const existing = getCookie(name);
  const opened = existing === undefined ? null : await unsealSession(config, existing);
  const current: Sealed = opened ?? {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    data: {},
  };

  const manage = (session: Sealed): SessionManager<T> => ({
    id: session.id,
    createdAt: session.createdAt,
    data: session.data as Partial<T>,
    async update(patch) {
      const next = typeof patch === "function" ? patch(session.data as Partial<T>) : patch;
      const merged: Sealed = {
        ...session,
        data: { ...session.data, ...next },
      };
      setCookie(name, await sealSession(config, merged), cookieOptions(config));
      return manage(merged);
    },
    async clear() {
      const empty: Sealed = { id: crypto.randomUUID(), createdAt: Date.now(), data: {} };
      // EXPIRED, not re-sealed empty: an empty session cookie is still a cookie
      // the browser sends, and the user asked for it to be gone.
      setCookie(name, "", { ...cookieOptions(config), maxAge: 0, expires: new Date(0) });
      return manage(empty);
    },
  });

  return manage(current);
}

/** The session's data, for code that only reads. */
export async function getSession<T extends SessionData = SessionData>(
  config: SessionConfig,
): Promise<Session<T>> {
  const manager = await useSession<T>(config);
  // The SEALED timestamp, not now. `Date.now()` here reported every session as
  // brand new, which is exactly wrong for the one thing `createdAt` is for —
  // deciding how old a session is.
  return { id: manager.id, createdAt: manager.createdAt, data: manager.data };
}

/** Merge into the session and re-seal it. */
export async function updateSession<T extends SessionData = SessionData>(
  config: SessionConfig,
  patch: Partial<T> | ((current: Partial<T>) => Partial<T> | undefined),
): Promise<SessionManager<T>> {
  return (await useSession<T>(config)).update(patch);
}

/** Drop the session and expire its cookie. */
export async function clearSession(config: SessionConfig): Promise<void> {
  await (await useSession(config)).clear();
}
