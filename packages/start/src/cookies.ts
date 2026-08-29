/**
 * Cookies, parsed and serialized here rather than taken from a package.
 *
 * It is a hundred lines and the traps are all known, so a dependency buys
 * nothing this file does not — but the traps are REAL, and every one of them is
 * a rule a browser enforces SILENTLY. A cookie a browser drops looks exactly
 * like a cookie the server never set, so each rule below is a THROW rather than
 * a correction: being told the attribute combination is impossible beats
 * debugging a login that works on the server and not in Chrome.
 *
 * The rules, and where they come from:
 *
 *  - `SameSite=None` REQUIRES `Secure`. Chrome 80 made this a hard drop
 *    (RFC 6265bis §5.4.7); without it the cookie is not stored at all.
 *  - `__Host-` requires `Secure`, `Path=/`, and NO `Domain` (RFC 6265bis
 *    §4.1.3). `__Secure-` requires `Secure`.
 *  - `Max-Age` must be an INTEGER. A fractional one is ignored, which silently
 *    turns a dated cookie into a session one.
 *  - `Expires` is an IMF-fixdate, which is what `Date.toUTCString()` produces
 *    and what nothing else does.
 *  - A cookie NAME may not hold a separator or a control character (RFC 6265
 *    §4.1.1), and a VALUE is percent-encoded by default — a raw `;` in one
 *    truncates the cookie where the browser splits it.
 */

/** Attributes a `Set-Cookie` may carry. */
export interface CookieOptions {
  readonly domain?: string;
  readonly expires?: Date;
  readonly httpOnly?: boolean;
  /** Seconds. Must be an integer — a browser ignores anything else. */
  readonly maxAge?: number;
  /** CHIPS. Browsers that do not know it ignore it. */
  readonly partitioned?: boolean;
  readonly path?: string;
  readonly priority?: "low" | "medium" | "high";
  readonly sameSite?: "strict" | "lax" | "none";
  readonly secure?: boolean;
  /**
   * How the VALUE is encoded. `encodeURIComponent` by default, because a raw
   * `;` or `,` truncates the cookie where the browser splits it. Pass the
   * identity function for a value already in a cookie-safe alphabet — a
   * base64url session token, say — to keep it readable in devtools.
   */
  readonly encode?: (value: string) => string;
}

/**
 * A separator or a control character, neither of which a cookie NAME may hold
 * (RFC 6265 §4.1.1: a name is a `token`).
 *
 * The control range is the POINT of these three, so the rule is silenced rather
 * than worked around — they are already written as escapes, which is what it
 * asks for.
 */
// oxlint-disable-next-line no-control-regex -- the RFC defines the set by code point
const ILLEGAL_NAME = /[\u0000-\u0020()<>@,;:\\"/[\]?={}\u007f]/;

/** What a cookie VALUE may not hold (RFC 6265 §4.1.1: `cookie-octet`). */
// oxlint-disable-next-line no-control-regex -- as above
const ILLEGAL_VALUE = /[\u0000-\u0020",;\\\u007f]/;

/**
 * What an attribute value may not hold, since `;` ends it.
 *
 * The control-character range is the POINT of these three, so the rule is
 * silenced rather than worked around — they are already written as escapes.
 */
// oxlint-disable-next-line no-control-regex -- the RFC defines the set by code point
const ILLEGAL_ATTRIBUTE = /[\u0000-\u001f;\u007f]/;

/**
 * Every cookie on a request, by name.
 *
 * FIRST WINS on a duplicate, which is what a browser sends when one cookie
 * exists at two paths and is what every parser in the survey does. A value that
 * is not valid percent-encoding comes back RAW rather than throwing: it arrived
 * off the wire, a client may put anything there, and one malformed cookie must
 * not take the request down.
 */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  if (header === null || header === undefined || header === "") return out;

  for (const pair of header.split(";")) {
    const equals = pair.indexOf("=");
    if (equals < 0) continue;
    const name = pair.slice(0, equals).trim();
    if (name === "" || name in out) continue;
    let value = pair.slice(equals + 1).trim();
    // A quoted-string value keeps its quotes on the wire and loses them here.
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[name] = decode(value);
  }
  return out;
}

function decode(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding from a client is not this server's error.
    return value;
  }
}

/**
 * One `Set-Cookie` line.
 *
 * Throws on any combination a browser would drop in silence — see the header
 * for which, and why a throw is the kinder answer.
 */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  if (name === "" || ILLEGAL_NAME.test(name)) {
    throw new TypeError(`[barq] ${JSON.stringify(name)} is not a valid cookie name`);
  }

  const secure = options.secure ?? false;
  const path = options.path;

  if (options.sameSite === "none" && !secure) {
    throw new TypeError(
      `[barq] cookie "${name}" sets SameSite=None without Secure, and every modern browser ` +
        "drops it silently (RFC 6265bis §5.4.7). Add `secure: true`, or use SameSite=Lax.",
    );
  }
  if (name.startsWith("__Host-")) {
    if (!secure || path !== "/" || options.domain !== undefined) {
      throw new TypeError(
        `[barq] cookie "${name}" uses the __Host- prefix, which requires \`secure: true\`, ` +
          '`path: "/"` and no `domain` (RFC 6265bis §4.1.3). A browser rejects it otherwise.',
      );
    }
  } else if (name.startsWith("__Secure-") && !secure) {
    throw new TypeError(
      `[barq] cookie "${name}" uses the __Secure- prefix, which requires \`secure: true\` ` +
        "(RFC 6265bis §4.1.3). A browser rejects it otherwise.",
    );
  }

  const encoded = (options.encode ?? encodeURIComponent)(value);
  if (ILLEGAL_VALUE.test(encoded)) {
    throw new TypeError(
      `[barq] the value for cookie "${name}" holds a character a cookie cannot carry. ` +
        "Leave `encode` at its default, which percent-encodes it.",
    );
  }

  const parts = [`${name}=${encoded}`];

  if (options.maxAge !== undefined) {
    if (!Number.isInteger(options.maxAge)) {
      throw new TypeError(
        `[barq] cookie "${name}" has a non-integer maxAge (${options.maxAge}); a browser ` +
          "ignores the attribute entirely rather than rounding it.",
      );
    }
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.domain !== undefined) {
    assertAttribute(name, "domain", options.domain);
    parts.push(`Domain=${options.domain}`);
  }
  if (path !== undefined) {
    assertAttribute(name, "path", path);
    parts.push(`Path=${path}`);
  }
  if (options.expires !== undefined) {
    if (Number.isNaN(options.expires.getTime())) {
      throw new TypeError(`[barq] cookie "${name}" has an invalid \`expires\` date`);
    }
    // IMF-fixdate, the only format RFC 6265 §5.1.1 requires a browser to parse
    // and the only one `toUTCString` produces.
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly === true) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (options.partitioned === true) parts.push("Partitioned");
  if (options.priority !== undefined) parts.push(`Priority=${capitalize(options.priority)}`);
  if (options.sameSite !== undefined) parts.push(`SameSite=${capitalize(options.sameSite)}`);

  return parts.join("; ");
}

function assertAttribute(cookie: string, attribute: string, value: string): void {
  if (ILLEGAL_ATTRIBUTE.test(value)) {
    throw new TypeError(
      `[barq] cookie "${cookie}" has a \`${attribute}\` holding a character that would ` +
        "terminate the attribute list",
    );
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The line that DELETES a cookie.
 *
 * A cookie is deleted by being set again, expired — and the `path` and `domain`
 * must MATCH the ones it was set with, or the browser deletes nothing and keeps
 * the original. That is why both ride through rather than being dropped: a
 * `deleteCookie("sid")` against a cookie set at `path: "/app"` is a no-op, and
 * a silent one.
 */
export function deleteCookieLine(name: string, options: CookieOptions = {}): string {
  return serializeCookie(name, "", { ...options, expires: new Date(0), maxAge: 0 });
}
