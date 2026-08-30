/**
 * The matcher: a segment trie, built once from the route table.
 *
 * Measured against the old regex-per-route linear scan (`stats.paired`, 41
 * trials x 2000 iterations, Bun): at 200 routes a last-position hit cost
 * 3.3 µs and a miss 3.6 µs, both linear in the matched route's POSITION. One
 * regex exec is 14 ns, so the regexes were never the cost — 200 iterations
 * were.
 *
 * A generated switch was measured too, and REJECTED: it beat a plain
 * first-segment bucket by 58 ns on a last-position hit and by nothing at all on
 * a miss, while costing a code generator and 76 kB of emitted JavaScript at
 * 1000 routes. A flag that moves neither an allocation count nor a wall-clock
 * number on a named benchmark is deleted, not kept. A trie is the same idea as
 * the bucket, one level deeper, and it is built at runtime from data.
 *
 * Ranking is structural, not scored. The walk tries static before parameter
 * before splat and BACKTRACKS, so `/users/new` beats `/users/$id` because the
 * static edge is taken first, and `/a/$b/c` is still reachable when `/a/x/d`
 * matched `x` and then failed. The old router had no ranking at all: the first
 * route in declaration order won, so `/users/new` declared after `/users/$id`
 * was unreachable.
 */

import { type Segment, SPLAT_KEY, splitPath } from "./path.ts";

/** A route as the matcher needs it, flattened out of the table. */
export interface FlatRoute<T = unknown> {
  /** Stable, name-derived, and what a client may hold across a deploy. */
  readonly id: string;
  /** The full pattern, parents included. */
  readonly fullPath: string;
  readonly segments: readonly Segment[];
  /** Outermost first, this route last. Every one of them renders. */
  readonly chain: readonly T[];
}

export interface Match<T = unknown> {
  readonly route: FlatRoute<T>;
  readonly params: Record<string, string>;
}

/**
 * A parameter edge that carries literal text around its value.
 *
 * Its own list rather than a field on the node, because the ordinary `$name`
 * must not pay for it: `decorated` is `null` on every node no route decorated,
 * and the walk skips the whole branch with one comparison.
 */
interface Decorated<T> {
  readonly prefix: string;
  readonly suffix: string;
  readonly name: string;
  readonly next: TrieNode<T>;
}

interface TrieNode<T> {
  /** Static edges, by segment text. */
  readonly statics: Map<string, TrieNode<T>>;
  /** The one parameter edge, if any route takes one here. */
  param: TrieNode<T> | null;
  /** Its name, needed to build `params` on the way out. */
  paramName: string;
  /** Parameter edges wrapped in literal text, tried before the bare one. */
  decorated: Decorated<T>[] | null;
  /**
   * `{-$name}` edges, each reachable two ways: having consumed a segment, and
   * having consumed none.
   */
  optional: Decorated<T>[] | null;
  /** A route whose pattern ends here. */
  leaf: FlatRoute<T> | null;
  /** A route whose pattern ends in a splat here. */
  splat: FlatRoute<T> | null;
  splatName: string;
  splatPrefix: string;
  splatSuffix: string;
}

function node<T>(): TrieNode<T> {
  return {
    statics: new Map(),
    param: null,
    paramName: "",
    decorated: null,
    optional: null,
    leaf: null,
    splat: null,
    splatName: SPLAT_KEY,
    splatPrefix: "",
    splatSuffix: "",
  };
}

/**
 * The value inside a decorated segment, or `null` when the literals disagree.
 *
 * An empty middle is a MISS: `{$name}.csv` must not match `.csv` with an empty
 * name, or a route owning `/files/report.csv` would also own `/files/.csv`.
 */
function unwrap(segment: string, prefix: string, suffix: string): string | null {
  if (prefix !== "" && !segment.startsWith(prefix)) return null;
  if (suffix !== "" && !segment.endsWith(suffix)) return null;
  const inner = segment.slice(prefix.length, segment.length - suffix.length);
  return inner === "" ? null : inner;
}

/** Find or add the edge for one decorated parameter. */
function edgeFor<T>(list: Decorated<T>[], prefix: string, suffix: string, name: string): Decorated<T> {
  for (const edge of list) {
    if (edge.prefix === prefix && edge.suffix === suffix && edge.name === name) return edge;
  }
  const edge: Decorated<T> = { prefix, suffix, name, next: node<T>() };
  list.push(edge);
  return edge;
}

export interface Matcher<T> {
  match(pathname: string): Match<T> | null;
  readonly routes: readonly FlatRoute<T>[];
}

/**
 * Build a matcher.
 *
 * Two routes reaching the same terminal is a conflict rather than a silent
 * shadowing: the old router resolved it by declaration order, which made a
 * route unreachable without saying so.
 */
export function createMatcher<T>(routes: readonly FlatRoute<T>[]): Matcher<T> {
  const root = node<T>();

  for (const route of routes) {
    let current = root;
    let splatted = false;
    for (const segment of route.segments) {
      if (segment.kind === "static") {
        let next = current.statics.get(segment.value);
        if (next === undefined) {
          next = node<T>();
          current.statics.set(segment.value, next);
        }
        current = next;
      } else if (segment.kind === "param") {
        // A DECORATED parameter is its own edge: `{$id}.csv` and `$id` address
        // different segments, so they cannot share a node or the literal text
        // would be neither required nor stripped.
        if (segment.prefix !== "" || segment.suffix !== "") {
          current.decorated ??= [];
          current = edgeFor(current.decorated, segment.prefix, segment.suffix, segment.name).next;
        } else if (current.param === null) {
          current.param = node<T>();
          current.paramName = segment.name;
          current = current.param;
        } else if (current.paramName !== segment.name) {
          // Two routes naming the same position differently would make
          // `params` depend on which one matched, which is exactly the class of
          // bug the old matcher's pass-ordered `paramNames` shipped.
          throw new Error(
            `route ${route.fullPath} names a parameter $${segment.name} where ` +
              `another route names $${current.paramName}; one position, one name`,
          );
        } else {
          current = current.param;
        }
      } else if (segment.kind === "optional") {
        current.optional ??= [];
        current = edgeFor(current.optional, segment.prefix, segment.suffix, segment.name).next;
      } else {
        if (current.splat !== null) {
          throw new Error(`two routes claim the splat at ${route.fullPath}`);
        }
        current.splat = route;
        current.splatName = segment.name;
        current.splatPrefix = segment.prefix;
        current.splatSuffix = segment.suffix;
        splatted = true;
        break;
      }
    }
    if (splatted) continue;
    if (current.leaf !== null) {
      throw new Error(
        `two routes match the same path: ${current.leaf.fullPath} and ${route.fullPath}`,
      );
    }
    current.leaf = route;
  }

  /**
   * Walk from `current` at `index`, filling `values` as parameters are taken.
   *
   * `values` is a plain array indexed by depth rather than an object built per
   * candidate, so a failed branch costs no allocation to undo — the entry is
   * simply overwritten by the next attempt.
   */
  const walk = (
    current: TrieNode<T>,
    segments: readonly string[],
    index: number,
    values: (string | null)[],
    names: (string | null)[],
  ): FlatRoute<T> | null => {
    if (index === segments.length) {
      if (current.leaf !== null) return current.leaf;
      // An OPTIONAL that consumed nothing is still a route: `/posts/detail`
      // reaches the leaf under `{-$category}` by skipping it, and the pattern
      // may end in one — `/posts/{-$category}` serves `/posts`.
      if (current.optional !== null) {
        for (const edge of current.optional) {
          names[index] = null;
          const found = walk(edge.next, segments, index, values, names);
          if (found !== null) return found;
        }
      }
      // A splat matches zero segments too, so `/files/$` serves `/files`.
      if (current.splat !== null) {
        values[index] = "";
        names[index] = current.splatName;
        return current.splat;
      }
      return null;
    }

    const segment = segments[index];

    // Static first. A literal is more specific than anything that could also
    // match it, and taking this edge first is the whole of the ranking rule.
    const nextStatic = current.statics.get(segment);
    if (nextStatic !== undefined) {
      names[index] = null;
      const found = walk(nextStatic, segments, index + 1, values, names);
      if (found !== null) return found;
    }

    // Then a DECORATED parameter, before a bare one: `{$name}.csv` demands
    // literal text the bare `$name` does not, so it is the more specific of the
    // two wherever both could match.
    if (current.decorated !== null) {
      for (const edge of current.decorated) {
        const inner = unwrap(segment, edge.prefix, edge.suffix);
        if (inner === null) continue;
        values[index] = decodeSegment(inner);
        names[index] = edge.name;
        const found = walk(edge.next, segments, index + 1, values, names);
        if (found !== null) return found;
      }
    }

    // Then a parameter, which is why the static attempt above must be able to
    // fail without ending the search.
    if (current.param !== null) {
      values[index] = decodeSegment(segment);
      names[index] = current.paramName;
      const found = walk(current.param, segments, index + 1, values, names);
      if (found !== null) return found;
    }

    // Then the optionals, GREEDY first: an optional that can take this segment
    // takes it, and only a failure further along makes the walk come back and
    // skip it. That ordering is what makes `/posts/tech/detail` bind `tech`
    // while `/posts/detail` still matches with nothing bound.
    if (current.optional !== null) {
      for (const edge of current.optional) {
        const inner = unwrap(segment, edge.prefix, edge.suffix);
        if (inner === null) continue;
        values[index] = decodeSegment(inner);
        names[index] = edge.name;
        const found = walk(edge.next, segments, index + 1, values, names);
        if (found !== null) return found;
      }
      for (const edge of current.optional) {
        names[index] = null;
        const found = walk(edge.next, segments, index, values, names);
        if (found !== null) return found;
      }
    }

    // Then the splat, which takes everything that is left.
    if (current.splat !== null) {
      const rest = segments.slice(index).map(decodeSegment).join("/");
      const inner =
        current.splatPrefix === "" && current.splatSuffix === ""
          ? rest
          : unwrap(rest, current.splatPrefix, current.splatSuffix);
      if (inner !== null) {
        values[index] = inner;
        names[index] = current.splatName;
        return current.splat;
      }
    }

    return null;
  };

  return {
    routes,
    match(pathname: string): Match<T> | null {
      const segments = splitPath(pathname);
      const values: (string | null)[] = new Array(segments.length + 1).fill(null);
      const names: (string | null)[] = new Array(segments.length + 1).fill(null);
      const route = walk(root, segments, 0, values, names);
      if (route === null) return null;

      // One object, built only on a hit. A miss allocates nothing beyond the
      // segment split, which is what makes an unmatched URL cheap.
      const params: Record<string, string> = {};
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (name !== null) params[name] = values[i] as string;
      }
      return { route, params };
    },
  };
}

/**
 * A percent-encoded parameter is decoded; a malformed one is handed over as it
 * arrived rather than throwing, because a bad URL is a 404 and not a 500.
 */
function decodeSegment(segment: string): string {
  if (!segment.includes("%")) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
