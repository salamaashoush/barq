/**
 * The matcher this project used to ship, preserved as a benchmark COMPARAND.
 *
 * `packages/extra/src/router.ts` is deleted. This is the part of it the router
 * measurement is against — `compilePath` builds a `RegExp` per route into a
 * `Map` and `matchRoutes` scans the table linearly — copied here verbatim so the
 * numbers that chose a trie over a generated switch stay reproducible after the
 * original is gone.
 *
 * It is not a fallback and nothing imports it but the benchmarks. Its bugs are
 * preserved too, deliberately: `paramNames` is built in PASS order rather than
 * positional order, and `compilePath("/c++")` throws, because a comparand that
 * has been quietly improved is not the thing that was measured.
 */

export interface RouteLike {
  path: string;
  children?: RouteLike[];
  /** Carried by a caller building a real table; the matcher never reads it. */
  component?: unknown;
}
type Params = Record<string, string>;
interface MatchedRoute {
  route: RouteLike;
  params: Params;
  parents: RouteLike[];
}

interface PathPattern {
  regex: RegExp;
  paramNames: string[];
  path: string;
}

const compiledPathCache = new Map<string, PathPattern>();

export function compilePath(path: string): PathPattern {
  const cached = compiledPathCache.get(path);
  if (cached) return cached;

  const paramNames: string[] = [];

  const SPLAT = "\x00SPLAT\x00";
  const PLUS = "\x00PLUS\x00";
  const OPT = "\x00OPT\x00";
  const PARAM = "\x00PARAM\x00";
  const WILD = "\x00WILD\x00";

  let pattern = path.replace(/[.^${}()|[\]\\]/g, "\\$&");

  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\*/g, (_: string, name: string) => {
    paramNames.push(name);
    return SPLAT;
  });
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\+/g, (_: string, name: string) => {
    paramNames.push(name);
    return PLUS;
  });
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\?/g, (_: string, name: string) => {
    paramNames.push(name);
    return OPT;
  });
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, name: string) => {
    paramNames.push(name);
    return PARAM;
  });
  pattern = pattern.replace(/\*/g, () => {
    paramNames.push("*");
    return WILD;
  });

  pattern = pattern.split(SPLAT).join("(.*)");
  pattern = pattern.split(PLUS).join("(.+)");
  pattern = pattern.split(OPT).join("([^/]*)");
  pattern = pattern.split(PARAM).join("([^/]+)");
  pattern = pattern.split(WILD).join("(.*)");

  const compiled: PathPattern = { regex: new RegExp(`^${pattern}$`), paramNames, path };
  compiledPathCache.set(path, compiled);
  return compiled;
}

export function matchPath(pathname: string, pattern: PathPattern): Params | null {
  const match = pathname.match(pattern.regex);
  if (!match) return null;

  const params: Params = {};
  pattern.paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });
  return params;
}

function prefixPattern(path: string): PathPattern {
  return compilePath(path.endsWith("/") ? `${path}*` : `${path}/*`);
}

function splitPrefix(pathname: string, path: string): { params: Params; rest: string } | null {
  const matched = matchPath(pathname, prefixPattern(path));
  if (!matched) return null;
  const rest = matched["*"] ?? "";
  const params: Params = { ...matched };
  delete params["*"];
  return { params, rest: rest === "" ? "/" : `/${rest}` };
}

export function matchRoutes(
  pathname: string,
  routes: RouteLike[],
  parents: RouteLike[] = [],
): MatchedRoute | null {
  for (const route of routes) {
    const children = route.children;
    const isLayout = children !== undefined && children.length > 0;
    const exact = matchPath(pathname, compilePath(route.path));

    if (!isLayout) {
      if (exact) return { route, params: exact, parents };
      continue;
    }

    if (exact) {
      // An exact hit on a layout renders its index child when it has one.
      const index = matchRoutes("/", children, [...parents, route]);
      if (index) return { ...index, params: { ...exact, ...index.params } };
      return { route, params: exact, parents };
    }

    const split = splitPrefix(pathname, route.path);
    if (split) {
      const child = matchRoutes(split.rest, children, [...parents, route]);
      if (child) return { ...child, params: { ...split.params, ...child.params } };
    }
  }
  return null;
}

