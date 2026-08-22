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
 * 1000 routes. `CODESIGN.md` §3.4's rule decided it — "a flag that moves neither
 * an allocation count nor a wall-clock number on a named benchmark is deleted,
 * not kept". A trie is the same idea as the bucket, one level deeper, and it is
 * built at runtime from data.
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

interface TrieNode<T> {
  /** Static edges, by segment text. */
  readonly statics: Map<string, TrieNode<T>>;
  /** The one parameter edge, if any route takes one here. */
  param: TrieNode<T> | null;
  /** Its name, needed to build `params` on the way out. */
  paramName: string;
  /** A route whose pattern ends here. */
  leaf: FlatRoute<T> | null;
  /** A route whose pattern ends in a splat here. */
  splat: FlatRoute<T> | null;
  splatName: string;
}

function node<T>(): TrieNode<T> {
  return {
    statics: new Map(),
    param: null,
    paramName: "",
    leaf: null,
    splat: null,
    splatName: SPLAT_KEY,
  };
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
        if (current.param === null) {
          current.param = node<T>();
          current.paramName = segment.name;
        } else if (current.paramName !== segment.name) {
          // Two routes naming the same position differently would make
          // `params` depend on which one matched, which is exactly the class of
          // bug the old matcher's pass-ordered `paramNames` shipped.
          throw new Error(
            `route ${route.fullPath} names a parameter $${segment.name} where ` +
              `another route names $${current.paramName}; one position, one name`,
          );
        }
        current = current.param;
      } else {
        if (current.splat !== null) {
          throw new Error(`two routes claim the splat at ${route.fullPath}`);
        }
        current.splat = route;
        current.splatName = segment.name;
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

    // Then a parameter, which is why the static attempt above must be able to
    // fail without ending the search.
    if (current.param !== null) {
      values[index] = decodeSegment(segment);
      names[index] = current.paramName;
      const found = walk(current.param, segments, index + 1, values, names);
      if (found !== null) return found;
    }

    // Then the splat, which takes everything that is left.
    if (current.splat !== null) {
      values[index] = segments.slice(index).map(decodeSegment).join("/");
      names[index] = current.splatName;
      return current.splat;
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
