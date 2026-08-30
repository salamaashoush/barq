/**
 * Paths, as segments.
 *
 * Everything downstream — the matcher, `<Link>`, the loader cache key — works on
 * a parsed segment list rather than on a string or a regex. The old router
 * compiled a `RegExp` per route and scanned linearly; measured at 200 routes
 * that cost 3.3 µs on a last-position hit, against 14 ns for one regex exec, so
 * the cost was never the regexes and a segment list is what removes it.
 *
 * Syntax is TanStack's: `$name` is a parameter, a bare `$` is a splat, and the
 * braced forms `{$name}`, `{-$name}` and `{$}` add a prefix, a suffix, or
 * optionality. `parsePattern` carries the grammar.
 */

/**
 * One piece of a path pattern.
 *
 * `prefix` and `suffix` are the literal text a braced segment wraps its
 * parameter in — `files/{$name}.csv` is one segment with suffix `.csv`, not two
 * — and they are `""` for the ordinary `$name`, which is what nearly every
 * route writes. Keeping them as fields rather than as a separate kind means the
 * matcher tests one string comparison it can skip, instead of branching on a
 * shape.
 */
export type Segment =
  | { readonly kind: "static"; readonly value: string }
  | {
      readonly kind: "param";
      readonly name: string;
      readonly prefix: string;
      readonly suffix: string;
    }
  /**
   * `{-$name}` — matches a segment or NO segment at all.
   *
   * The route is reachable both ways and `params[name]` is absent when it was
   * skipped, which is TanStack's rule. One pattern therefore covers
   * `/posts/detail` and `/posts/tech/detail`, where barq previously needed two
   * routes and a shared component.
   */
  | {
      readonly kind: "optional";
      readonly name: string;
      readonly prefix: string;
      readonly suffix: string;
    }
  | {
      readonly kind: "splat";
      readonly name: string;
      readonly prefix: string;
      readonly suffix: string;
    };

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

/**
 * Parse a path PATTERN into segments.
 *
 * The grammar is TanStack's, and the braced forms are the ones barq did not
 * have (`new-process-route-tree.ts:61`):
 *
 * ```text
 * $            a splat, taking every remaining segment
 * $name        a parameter
 * {$name}      the same, so a prefix or a suffix can be written around it
 * {-$name}     OPTIONAL: matches one segment, or none at all
 * {$}          a splat, braced, so it too may carry a prefix and a suffix
 * anything     a literal
 * ```
 *
 * A prefix or a suffix is the literal text OUTSIDE the braces and inside the
 * segment: `{$name}.csv` has suffix `.csv`, and `on-{$id}` has prefix `on-`.
 * That is what lets a route own `/files/report.csv` without owning
 * `/files/report`.
 *
 * A malformed brace falls back to a LITERAL rather than throwing. A pattern is
 * usually derived from a filename, so the failure a throw would produce is a
 * build that dies on a file somebody named oddly, where treating it as text
 * gives a route that simply does not match — visible, and local to itself.
 */
export function parsePattern(pattern: string): Segment[] {
  return splitPath(pattern).map(parseSegment);
}

function parseSegment(raw: string): Segment {
  // The common cases first, and neither allocates: a literal never reaches the
  // brace scan, and `$name` is the spelling nearly every route uses.
  if (raw === "$") return { kind: "splat", name: SPLAT_KEY, prefix: "", suffix: "" };
  if (raw.charCodeAt(0) === 36 /* $ */ && !raw.includes("{")) {
    return { kind: "param", name: raw.slice(1), prefix: "", suffix: "" };
  }
  const open = raw.indexOf("{");
  if (open === -1) return { kind: "static", value: raw };
  const close = raw.indexOf("}", open);
  if (close === -1) return { kind: "static", value: raw };

  const prefix = raw.slice(0, open);
  const suffix = raw.slice(close + 1);
  const inner = raw.slice(open + 1, close);

  if (inner === "$") return { kind: "splat", name: SPLAT_KEY, prefix, suffix };
  if (inner.startsWith("-$")) {
    const name = inner.slice(2);
    return name === ""
      ? { kind: "static", value: raw }
      : { kind: "optional", name, prefix, suffix };
  }
  if (inner.startsWith("$")) {
    const name = inner.slice(1);
    return name === "" ? { kind: "static", value: raw } : { kind: "param", name, prefix, suffix };
  }
  return { kind: "static", value: raw };
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
 *
 * An OPTIONAL parameter with no value contributes no segment at all, which is
 * the whole point of one: `{-$category}` given nothing produces
 * `/posts/detail`, not `/posts//detail` and not a throw. A required parameter
 * with no value is still an error, because the link would silently address
 * somewhere else.
 */
export function interpolate(pattern: string, params: Readonly<Record<string, string>>): string {
  const parts: string[] = [];
  for (const segment of parsePattern(pattern)) {
    if (segment.kind === "static") {
      parts.push(segment.value);
      continue;
    }
    const value = params[segment.name];
    if (value === undefined || value === "") {
      if (segment.kind === "optional") continue;
      if (segment.kind === "splat" && value === "") continue;
      throw new Error(`missing route parameter ${JSON.stringify(segment.name)} for ${pattern}`);
    }
    // A splat's value is many segments and is spliced in whole; a parameter's
    // is one segment and is encoded, so a `/` inside it cannot invent one.
    if (segment.kind === "splat") {
      const inner = splitPath(value);
      // A prefix and a suffix belong to the FIRST and LAST segment the splat
      // expands to, so `x{$}y` over `a/b` is `xa/by` — the same text the
      // matcher stripped on the way in.
      if (segment.prefix !== "" && inner.length > 0) inner[0] = segment.prefix + inner[0];
      if (segment.suffix !== "" && inner.length > 0) {
        inner[inner.length - 1] += segment.suffix;
      }
      parts.push(...inner);
      continue;
    }
    parts.push(segment.prefix + encodeURIComponent(value) + segment.suffix);
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
