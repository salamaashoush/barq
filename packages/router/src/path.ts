/**
 * Paths, as segments.
 *
 * Everything downstream — the matcher, `<Link>`, the loader cache key — works on
 * a parsed segment list rather than on a string or a regex. The old router
 * compiled a `RegExp` per route and scanned linearly; measured at 200 routes
 * that cost 3.3 µs on a last-position hit, against 14 ns for one regex exec, so
 * the cost was never the regexes and a segment list is what removes it.
 *
 * Syntax is TanStack's: `$name` is a parameter, a bare `$` is a splat.
 */

/** One piece of a path pattern. */
export type Segment =
  | { readonly kind: "static"; readonly value: string }
  | { readonly kind: "param"; readonly name: string }
  | { readonly kind: "splat"; readonly name: string };

/** The splat's key in `params`, matching the pattern that produced it. */
export const SPLAT_KEY = "_splat";

/**
 * Split a pathname or a pattern into its segments.
 *
 * A trailing slash is dropped, so `/users` and `/users/` are the same route.
 * The old router anchored `^…$` per route and treated them as different
 * strings, so serving both meant declaring both — recorded as a wart rather
 * than reproduced.
 */
export function splitPath(path: string): string[] {
  const out: string[] = [];
  let from = 0;
  const end = path.length;
  for (let i = 0; i <= end; i++) {
    if (i === end || path.charCodeAt(i) === 47 /* / */) {
      if (i > from) out.push(path.slice(from, i));
      from = i + 1;
    }
  }
  return out;
}

/** Parse a path PATTERN into segments. */
export function parsePattern(pattern: string): Segment[] {
  return splitPath(pattern).map((raw) => {
    if (raw === "$") return { kind: "splat", name: SPLAT_KEY } as const;
    if (raw.charCodeAt(0) === 36 /* $ */) return { kind: "param", name: raw.slice(1) } as const;
    return { kind: "static", value: raw } as const;
  });
}

/**
 * Join a parent pattern with a child's.
 *
 * A child pattern beginning with `/` is absolute and replaces the parent's,
 * which is how a route escapes its layout without leaving it.
 */
export function joinPattern(parent: string, child: string | undefined): string {
  if (child === undefined || child === "") return parent;
  if (child.charCodeAt(0) === 47) return normalize(child);
  return normalize(`${parent}/${child}`);
}

/** One leading slash, no trailing slash, no empty segments. */
export function normalize(path: string): string {
  const segments = splitPath(path);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Fill a pattern's parameters from a params record.
 *
 * The inverse of matching, and what `<Link to>` uses to build an href from a
 * route id plus params.
 */
export function interpolate(pattern: string, params: Readonly<Record<string, string>>): string {
  const parts: string[] = [];
  for (const segment of parsePattern(pattern)) {
    if (segment.kind === "static") {
      parts.push(segment.value);
      continue;
    }
    const value = params[segment.name];
    if (value === undefined) {
      throw new Error(`missing route parameter ${JSON.stringify(segment.name)} for ${pattern}`);
    }
    // A splat's value is many segments and is spliced in whole; a parameter's
    // is one segment and is encoded, so a `/` inside it cannot invent one.
    if (segment.kind === "splat") parts.push(...splitPath(value));
    else parts.push(encodeURIComponent(value));
  }
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

/** Whether `to` addresses something outside the application entirely. */
export function leavesTheApp(to: string): boolean {
  return to.startsWith("#") || to.startsWith("//") || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(to);
}

/**
 * Is this somewhere a browser may be SENT?
 *
 * A path, a relative path, a protocol-relative URL and an `http(s)` URL: yes.
 * Any other scheme: no. `javascript:` is the one that matters and `data:` is the
 * one after it.
 *
 * MEASURED, in a real browser, because the answer is not obvious: a 302 whose
 * `Location` is `javascript:…` is INERT — no browser follows it — but barq's
 * streaming redirect cannot be a 302, and
 * `<script>location.replace("javascript:…")</script>` EXECUTES. So a route doing
 * the ordinary `redirect(searchParams.get("next"))` has an open redirect on the
 * pre-shell path and a cross-site scripting hole on the streamed one. The
 * severity escalation is barq's, so the refusal is barq's.
 *
 * A protocol-relative `//host` and an absolute `https://host` are ALLOWED. They
 * are an open redirect if an application forwards user input into one, which is
 * that application's bug and is what every framework's `redirect` does — and
 * refusing them would break the OAuth hand-off that is the main reason to
 * redirect off-origin at all.
 */
export function isNavigable(to: string): boolean {
  const scheme = /^([a-zA-Z][a-zA-Z\d+\-.]*):/.exec(to);
  if (scheme === null) return true;
  const name = (scheme[1] ?? "").toLowerCase();
  return name === "http" || name === "https";
}

/**
 * Resolve `to` against `from`.
 *
 * `from` is treated as a directory, so `resolvePath("child", "/parent")` is
 * `/parent/child`. Over-popping is clamped rather than throwing: `../../../x`
 * from `/a` is `/x`, because a link that walks off the root is a mistake in the
 * link and not a reason to break the page.
 */
export function resolvePath(to: string, from: string): string {
  if (leavesTheApp(to)) return to;
  if (to.charCodeAt(0) === 47) return normalize(to);

  const base = splitPath(from);
  let rest = to;
  while (rest.startsWith("./")) rest = rest.slice(2);
  while (rest.startsWith("../")) {
    base.pop();
    rest = rest.slice(3);
  }
  if (rest === "..") {
    base.pop();
    rest = "";
  }
  return normalize([...base, ...splitPath(rest)].join("/"));
}

/**
 * Whether `pathname` is at or under `prefix`, on a SEGMENT boundary.
 *
 * `/user-settings` is not under `/user`, which a `startsWith` gets wrong and
 * which is what `<NavLink>`'s active state turns on.
 */
export function isUnder(pathname: string, prefix: string): boolean {
  if (prefix === "/") return true;
  if (!pathname.startsWith(prefix)) return false;
  return pathname.length === prefix.length || pathname.charCodeAt(prefix.length) === 47;
}
