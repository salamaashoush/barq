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
  /**
   * Has this session been revoked? Asked on every unseal.
   *
   * THE ONE THING A SEALED COOKIE CANNOT DO BY ITSELF. Nothing on the server is
   * consulted to open one, so "log out everywhere" and "ban this account now"
   * are otherwise impossible — an issued cookie is valid until it expires, and
   * that is the trade the whole design makes.
   *
   * This is the smallest seam that closes it. The fast path stays stateless:
   * without the hook there is no lookup, and with it an application keeps only a
   * set of revoked IDS until they expire, which `maxAge` bounds. That is a much
   * smaller thing to store than a session per user, and it is only ever written
   * when somebody signs out or is banned.
   *
   * A REVOKED SESSION READS AS ABSENT, like every other reason a cookie will not
   * open — see `unsealSession`. Throwing here would tell a caller the difference
   * between "forged" and "revoked", which is an oracle.
   *
   * It is asked AFTER the cookie is authenticated, so an unauthenticated client
   * cannot make the application do a lookup by sending a garbage cookie.
   */
  readonly isRevoked?: (id: string) => boolean | Promise<boolean>;
}

const DEFAULT_NAME = "barq-session";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7;
/** Below this a password is not a key, whatever the KDF does with it. */
const MINIMUM_PASSWORD = 32;
/** Recognises our own envelope, and refuses another version rather than guessing. */
const VERSION = "b1";
const IV_BYTES = 12;
const SALT_BYTES = 16;
/** Domain separation for the KDF — see `deriveKey`. */
const HKDF_INFO = new TextEncoder().encode("barq.session.v1");
/**
 * What a browser will actually store.
 *
 * RFC 6265 §6.1 requires at least 4096 bytes per cookie, and every browser
 * treats that as the limit — over it the cookie is DROPPED, silently, which
 * looks exactly like a user who is not signed in. A session that quietly stops
 * working once a field grows is the worst failure this file could have, so the
 * seal refuses instead and says what to do.
 */
const MAX_COOKIE_BYTES = 4096;

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
 * HKDF AND NOT PBKDF2, and the reason is correctness AND a denial of service.
 *
 * PBKDF2 exists to STRETCH a low-entropy secret — a human password — so that
 * guessing it costs an attacker real time. This input is not that: `password` is
 * refused below 32 characters and is documented as a key. Stretching something
 * already high-entropy buys nothing, and HKDF is the KDF for exactly this case.
 *
 * The cost of getting it wrong was MEASURED on this machine: PBKDF2 at 100,000
 * iterations is 7.93 ms and HKDF is 0.014 ms — 566x — per REQUEST, on every
 * request that touches a session. Worse, it is per request an ATTACKER makes:
 * the salt comes out of the cookie, so an unauthenticated client sending garbage
 * cookies chooses how much CPU each packet costs. Eight milliseconds a packet is
 * an amplifier, and HKDF removes it rather than bounding it.
 *
 * A fresh salt per seal still keeps two seals of the same data under the same
 * password from sharing a key, so the ciphertexts stay incomparable.
 */
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    // `info` DOMAIN-SEPARATES the output, so a key derived here is not the key
    // the same secret would derive for anything else.
    { name: "HKDF", salt, info: HKDF_INFO, hash: "SHA-256" },
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
  const value = [VERSION, base64url(salt), base64url(iv), base64url(sealed)].join(".");
  if (value.length > MAX_COOKIE_BYTES) {
    throw new RangeError(
      `[barq] this session seals to ${value.length} bytes and a browser drops any cookie over ` +
        `${MAX_COOKIE_BYTES} — silently, which reads as a user who is not signed in. Keep an id ` +
        "in the session and the rest in a store.",
    );
  }
  return value;
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
    // AFTER the tag has verified, never before: asking first would let an
    // unauthenticated client drive a lookup with a garbage cookie, which is the
    // same amplifier the KDF used to be.
    if (config.isRevoked !== undefined && (await config.isRevoked(session.id))) return null;
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
