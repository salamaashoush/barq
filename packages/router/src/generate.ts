/**
 * File-based routes, turned into the code-based table.
 *
 * The generator emits calls into the runtime that already exists rather than a
 * second shape — the arrangement `@barqjs/start` used, where the contract
 * shipped before anything emitted into it. A hand-written table needs none of
 * this.
 *
 * GENERATION HAPPENS IN JS, NOT IN RUST, and `DESIGN-ROUTER.md` §3.1's "route
 * tree from the filesystem, generated in Rust" is withdrawn. The crate performs
 * zero filesystem reads outside `build.rs` and its own tests, `walkdir` is not a
 * dependency, all three napi entries are synchronous, and there is no `.d.ts`
 * emitter. A Rust `read_dir` would be a second source of truth about disk that
 * Vite's watcher does not invalidate — so discovery lives where `addWatchFile`
 * and `moduleGraph.invalidateModule` are.
 *
 * Naming is TanStack's flat convention. A dot is a slash, so the file name is
 * the route and nothing has to be inferred from directory depth:
 *
 *   index.tsx            ->  /
 *   about.tsx            ->  /about
 *   users.route.tsx      ->  the LAYOUT for /users
 *   users.index.tsx      ->  the index of /users
 *   users.$id.tsx        ->  /users/$id
 *   files.$.tsx          ->  /files/$   (splat)
 *   _shell.route.tsx     ->  a PATHLESS layout; children keep the parent's path
 */

/** One discovered file, before it becomes a route. */
export interface RouteFile {
  /** Project-relative, POSIX separators. What the generated module imports. */
  readonly file: string;
  /** The dotted name with its extension removed: `users.$id`. */
  readonly name: string;
}

export interface GeneratedRoute {
  readonly id: string;
  /** This route's pattern RELATIVE to its parent, as `RouteDefinition.path`. */
  readonly path: string | undefined;
  readonly file: string | null;
  readonly children: GeneratedRoute[];
  /** Pathless layouts contribute no segment. */
  readonly pathless: boolean;
}

const ROUTE_SUFFIX = ".route";
const INDEX = "index";

/** Strip the extension and any `/index` a directory layout implies. */
export function nameOf(file: string): string {
  const base = file.replace(/\.[jt]sx?$/, "");
  // A directory separator is the same thing as a dot, so both spellings of the
  // same route produce the same name and collide loudly rather than quietly.
  return base.replaceAll("/", ".");
}

/**
 * Build the nested table.
 *
 * A segment prefix that some file declares as `<prefix>.route` becomes a layout
 * and everything under it becomes its children. A prefix nobody declares stays
 * flat — there is no invisible layout.
 */
export function buildTree(files: readonly RouteFile[]): GeneratedRoute[] {
  const layouts = new Map<string, RouteFile>();
  const leaves: RouteFile[] = [];

  for (const file of files) {
    if (file.name.endsWith(ROUTE_SUFFIX)) {
      layouts.set(file.name.slice(0, -ROUTE_SUFFIX.length), file);
    } else {
      leaves.push(file);
    }
  }

  const nodeFor = (prefix: string, layout: RouteFile | null): GeneratedRoute => {
    const pathless = prefix.startsWith("_") || prefix.split(".").at(-1)?.startsWith("_") === true;
    return {
      id: prefix === "" ? "/" : `/${prefix.replaceAll(".", "/")}`,
      path: pathless ? undefined : segmentsOf(prefix),
      file: layout?.file ?? null,
      children: [],
      pathless,
    };
  };

  const roots: GeneratedRoute[] = [];
  const nodes = new Map<string, GeneratedRoute>();

  // Layouts first and shortest-first, so a child always finds its parent.
  for (const prefix of [...layouts.keys()].toSorted((a, b) => a.length - b.length)) {
    const node = nodeFor(prefix, layouts.get(prefix) as RouteFile);
    nodes.set(prefix, node);
    const parent = parentOf(prefix, nodes);
    if (parent === null) roots.push(node);
    else {
      parent.children.push(node);
      // A nested layout's own path is relative to its parent's.
      (node as { path: string | undefined }).path = node.pathless
        ? undefined
        : segmentsOf(prefix.slice(parentPrefix(prefix, nodes).length + 1));
    }
  }

  for (const leaf of leaves) {
    const isIndex = leaf.name === INDEX || leaf.name.endsWith(`.${INDEX}`);
    const prefix = isIndex ? leaf.name.slice(0, -INDEX.length).replace(/\.$/, "") : leaf.name;

    // An index's parent is the layout at its OWN prefix — `users.index` belongs
    // to `users.route`, not to whatever is above `users`. Looking only at
    // shorter prefixes missed it, and every index route came out a sibling of
    // the layout it should have been inside.
    const parentKey = isIndex && nodes.has(prefix) ? prefix : parentPrefix(prefix, nodes);
    const parent = parentKey === "" ? null : (nodes.get(parentKey) ?? null);
    const own = parentKey === "" ? prefix : prefix.slice(parentKey.length + 1);

    const node: GeneratedRoute = {
      // TanStack's convention: the index of `/users` is `/users/`, so it does
      // not collide with the layout's own `/users`.
      id: isIndex
        ? prefix === ""
          ? "/"
          : `/${prefix.replaceAll(".", "/")}/`
        : `/${leaf.name.replaceAll(".", "/")}`,
      // An index child's path is empty: it IS its parent's path. A root index
      // has no parent to inherit from, so it names the root itself.
      path: isIndex ? (parent === null ? "/" : "") : segmentsOf(own),
      file: leaf.file,
      children: [],
      pathless: false,
    };
    if (parent === null) roots.push(node);
    else parent.children.push(node);
  }

  return roots;
}

/** `users.$id` -> `users/$id`. A leading `_` marks a segment pathless and is dropped. */
function segmentsOf(prefix: string): string {
  if (prefix === "") return "";
  return prefix
    .split(".")
    .filter((segment) => !segment.startsWith("_"))
    .join("/");
}

function parentPrefix(prefix: string, nodes: Map<string, GeneratedRoute>): string {
  const parts = prefix.split(".");
  for (let take = parts.length - 1; take > 0; take--) {
    const candidate = parts.slice(0, take).join(".");
    if (nodes.has(candidate)) return candidate;
  }
  return "";
}

function parentOf(prefix: string, nodes: Map<string, GeneratedRoute>): GeneratedRoute | null {
  const found = parentPrefix(prefix, nodes);
  return found === "" ? null : (nodes.get(found) ?? null);
}

/**
 * The virtual module.
 *
 * Every route component is `lazy()`, so a route is its own chunk and the
 * generated module imports none of them eagerly. `loader` and `pending` come off
 * the same module, which is why `pick` exists on `lazy`.
 */
export function generateModule(tree: readonly GeneratedRoute[], routerSource: string): string {
  const lines = [`import { lazy } from "@barqjs/core";`, ""];

  const emit = (node: GeneratedRoute, indent: string): string => {
    const parts: string[] = [];
    if (node.path !== undefined) parts.push(`path: ${JSON.stringify(node.path)}`);
    parts.push(`id: ${JSON.stringify(node.id)}`);
    if (node.file !== null) {
      const specifier = JSON.stringify(`/${node.file}`);
      parts.push(`component: lazy(() => import(${specifier}))`);
      parts.push(`loader: lazyLoader(() => import(${specifier}))`);
      parts.push(`pending: lazy(() => import(${specifier}), (m) => m.Pending ?? Empty)`);
    }
    if (node.children.length > 0) {
      const kids = node.children.map((child) => emit(child, `${indent}    `)).join(",\n");
      parts.push(`children: [\n${kids}\n${indent}  ]`);
    }
    return `${indent}  { ${parts.join(", ")} }`;
  };

  lines.push(
    "const Empty = () => null;",
    "",
    "/** A loader that lives in the route module, reached without loading it eagerly. */",
    "const lazyLoader = (load) => async (context) => {",
    "  const module = await load();",
    "  return module.loader === undefined ? undefined : module.loader(context);",
    "};",
    "",
    "export const routes = [",
    tree.map((node) => emit(node, "")).join(",\n"),
    "];",
    "",
    `export { routes as default };`,
  );
  void routerSource;
  return lines.join("\n");
}

/**
 * The `.d.ts`.
 *
 * Plain interfaces, one member per route. §3.1's tsc argument was measured and
 * it holds — against TanStack's real `Extract`-over-a-union lookup, generated
 * interfaces cost 8-15x less check time and the union arm stops compiling
 * entirely at 5000 routes (22,949 x TS2859). What the interfaces buy that type
 * level parsing cannot at any speed is `loaderData` per route id, which is not
 * derivable from a path string.
 */
export function generateTypes(tree: readonly GeneratedRoute[]): string {
  const rows: string[] = [];

  const walk = (node: GeneratedRoute, parentPath: string): void => {
    const full = joinForTypes(parentPath, node.path);
    if (node.children.length === 0) {
      const params = [...full.matchAll(/\$(\w*)/g)].map((m) =>
        m[1] === "" ? '"_splat": string' : `${m[1]}: string`,
      );
      rows.push(
        `  ${JSON.stringify(node.id)}: { path: ${JSON.stringify(full)}; params: { ${params.join("; ")} } };`,
      );
    }
    for (const child of node.children) walk(child, full);
  };
  for (const node of tree) walk(node, "");

  return [
    "// Generated by @barqjs/router. Do not edit.",
    'declare module "virtual:barq-routes" {',
    "  export interface RouteMap {",
    ...rows.map((row) => `  ${row}`),
    "  }",
    '  export type RoutePath = RouteMap[keyof RouteMap]["path"];',
    "  export type RouteId = keyof RouteMap & string;",
    "  export const routes: unknown[];",
    "  export default routes;",
    "}",
    "",
  ].join("\n");
}

function joinForTypes(parent: string, path: string | undefined): string {
  if (path === undefined || path === "") return parent === "" ? "/" : parent;
  if (path.startsWith("/")) return path;
  return `${parent === "/" ? "" : parent}/${path}`;
}
