//! File-based routes: the scan, the tree, and both emits.
//!
//! All of it is here rather than in the Vite plugin. The plugin's job is to ask
//! and to invalidate; it does not read the directory, does not derive a route
//! from a filename, and does not build a string. One implementation, in the
//! compiler, so a route table cannot mean two things.
//!
//! `DESIGN-ROUTER.md` §3.1 asked for exactly this and an earlier pass argued it
//! away on the grounds that the crate had never touched a filesystem outside
//! `build.rs`. That is a fact about the crate's history, not a reason: the
//! project owns the compiler and can give it a capability it needs. What the
//! plugin keeps is the WATCHER — Vite owns file events and `scan` returns the
//! file list so the plugin can register them — which is the one part that
//! genuinely cannot move.
//!
//! Naming is TanStack's flat convention. A dot is a slash, so the file name is
//! the route and nothing is inferred from directory depth:
//!
//! ```text
//! index.tsx            ->  /
//! about.tsx            ->  /about
//! users.route.tsx      ->  the LAYOUT for /users
//! users.index.tsx      ->  the index of /users, id `/users/`
//! users.$id.tsx        ->  /users/$id
//! files.$.tsx          ->  /files/$   (splat)
//! _shell.route.tsx     ->  a PATHLESS layout
//! ```

use std::path::Path;

/// One discovered file, before it becomes a route.
#[derive(Debug, Clone)]
pub struct RouteFile {
    /// Project-relative, POSIX separators. What the emitted module imports.
    pub file: String,
    /// The dotted name with its extension removed: `users.$id`.
    pub name: String,
    /// What the file says about itself, lifted from its own source.
    pub config: RouteConfig,
}

/// The two declarations a route makes that the TABLE has to carry.
///
/// Both are needed BEFORE the module loads, and the module is `lazy()` — so a
/// runtime read is not available at the moment either one is wanted. `ssr`
/// decides what the string backend renders for that depth, which the page
/// handler asks before it builds anything; `prerender` decides whether the
/// build writes the route out, which happens with no runtime at all.
///
/// LIFTED FROM SOURCE, and only from a literal. Astro requires exactly
/// `export const prerender = true` and says why in its own error: "Mutable
/// values declared at runtime are not supported." SvelteKit reaches the same
/// answer through a second forked pass that IMPORTS every node and reads its
/// exports, which is not available here — `routeTree` is a synchronous napi
/// call with no module loader.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RouteConfig {
    /// `export const ssr = false` / `= "data-only"`.
    pub ssr: Option<String>,
    /// `export const prerender = true`.
    pub prerender: Option<bool>,
    /// A declaration that is present but not a literal, for the caller to report.
    pub refused: Vec<String>,
}

/// Read `export const ssr` / `export const prerender` out of a route file.
///
/// A scan rather than a parse, and deliberately: the values it accepts are
/// `true`, `false` and one quoted string, so a regex-free character walk over
/// the two declarations is exact for everything it accepts and refuses
/// everything else. Anything more expressive would be a value the client and
/// the server could disagree about.
pub fn read_config(source: &str) -> RouteConfig {
    let mut config = RouteConfig::default();
    for (name, is_ssr) in [("ssr", true), ("prerender", false)] {
        let Some(raw) = declaration(source, name) else { continue };
        let value = raw.trim();
        if is_ssr {
            match value {
                "true" => config.ssr = Some("true".to_owned()),
                "false" => config.ssr = Some("false".to_owned()),
                "\"data-only\"" | "'data-only'" => config.ssr = Some("\"data-only\"".to_owned()),
                _ => config.refused.push(format!("ssr = {value}")),
            }
        } else {
            match value {
                "true" => config.prerender = Some(true),
                "false" => config.prerender = Some(false),
                _ => config.refused.push(format!("prerender = {value}")),
            }
        }
    }
    config
}

/// The initialiser of a top-level `export const <name> = …`, up to `;` or a newline.
fn declaration<'a>(source: &'a str, name: &str) -> Option<&'a str> {
    let needle = format!("export const {name}");
    let mut from = 0usize;
    while let Some(offset) = source[from..].find(&needle) {
        let start = from + offset;
        // Top level only: a match indented or inside a larger identifier is not
        // the declaration this is looking for.
        let at_line_start = start == 0 || source.as_bytes()[start - 1] == b'\n';
        let after = &source[start + needle.len()..];
        let boundary =
            after.chars().next().is_none_or(|c| c == ' ' || c == '=' || c == '\t' || c == ':');
        if at_line_start && boundary {
            let equals = after.find('=')?;
            let rest = &after[equals + 1..];
            let end = rest.find([';', '\n']).unwrap_or(rest.len());
            return Some(&rest[..end]);
        }
        from = start + needle.len();
    }
    None
}

#[derive(Debug, Clone)]
pub struct RouteNode {
    pub id: String,
    /// This route's pattern RELATIVE to its parent. `None` is pathless.
    pub path: Option<String>,
    pub file: Option<String>,
    pub children: Vec<RouteNode>,
    pub pathless: bool,
    /// What the file declared about itself. Empty for a node with no file.
    pub config: RouteConfig,
}

const EXTENSIONS: [&str; 4] = [".tsx", ".jsx", ".ts", ".js"];
const ROUTE_SUFFIX: &str = ".route";
/// The layout for the empty prefix: `src/routes/route.tsx`.
const ROOT_LAYOUT: &str = "route";
/// Its id, which cannot be `/` because the root index is.
const ROOT_ID: &str = "__root__";
const INDEX: &str = "index";

/// Strip the extension; a directory separator is the same thing as a dot.
pub fn name_of(relative: &str) -> String {
    let mut base = relative;
    for extension in EXTENSIONS {
        if let Some(stripped) = base.strip_suffix(extension) {
            base = stripped;
            break;
        }
    }
    base.replace(['/', '\\'], ".")
}

fn is_route_file(name: &str) -> bool {
    if !EXTENSIONS.iter().any(|extension| name.ends_with(extension)) {
        return false;
    }
    // A test or a story beside a route is not a route.
    !(name.contains(".test.") || name.contains(".spec.") || name.contains(".stories."))
}

/// Every route file under `root/dir`, sorted so the emit is deterministic.
///
/// A missing directory is not an error: a project without routes yet still has
/// to start, and it gets an empty table.
pub fn scan(root: &Path, dir: &str) -> Vec<RouteFile> {
    let base = root.join(dir);
    let mut out = Vec::new();
    walk(&base, &base, root, &mut out);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn walk(current: &Path, base: &Path, root: &Path, out: &mut Vec<RouteFile>) {
    let Ok(entries) = std::fs::read_dir(current) else { return };
    let mut paths: Vec<_> = entries.filter_map(Result::ok).map(|entry| entry.path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            walk(&path, base, root, out);
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else { continue };
        if !is_route_file(file_name) {
            continue;
        }
        let Ok(from_root) = path.strip_prefix(root) else { continue };
        let Ok(from_base) = path.strip_prefix(base) else { continue };
        // The FIRST read of a route file's contents in this crate, and the
        // reason is `emit_node`: `ssr` and `prerender` have to be in the table,
        // the table is built before anything runs, and the module is `lazy()`
        // so nothing can ask it later without defeating the split.
        let config =
            std::fs::read_to_string(&path).map(|text| read_config(&text)).unwrap_or_default();
        out.push(RouteFile {
            file: from_root.to_string_lossy().replace('\\', "/"),
            name: name_of(&from_base.to_string_lossy().replace('\\', "/")),
            config,
        });
    }
}

/// `users.$id` -> `users/$id`. A segment beginning `_` is pathless and is dropped.
fn segments_of(prefix: &str) -> String {
    if prefix.is_empty() {
        return String::new();
    }
    prefix.split('.').filter(|segment| !segment.starts_with('_')).collect::<Vec<_>>().join("/")
}

fn parent_prefix(prefix: &str, known: &[String]) -> String {
    let parts: Vec<&str> = prefix.split('.').collect();
    let mut take = parts.len().saturating_sub(1);
    while take > 0 {
        let candidate = parts[..take].join(".");
        if known.contains(&candidate) {
            return candidate;
        }
        take -= 1;
    }
    String::new()
}

/// Build the nested table.
///
/// A prefix some file declares as `<prefix>.route` becomes a layout and
/// everything under it becomes its children. A prefix nobody declares stays
/// flat — there is no invisible layout.
pub fn build_tree(files: &[RouteFile]) -> Vec<RouteNode> {
    let mut layout_prefixes: Vec<String> = Vec::new();
    let mut layout_files: Vec<(String, String)> = Vec::new();
    let mut layout_configs: Vec<(String, RouteConfig)> = Vec::new();
    let mut leaves: Vec<&RouteFile> = Vec::new();

    for file in files {
        // `route.tsx` at the top of the directory is the layout for the EMPTY
        // prefix — the one every route is under. `<prefix>.route` needs a prefix
        // by construction, so without this there was no way to write a layout
        // that wraps the whole app, and a file named `route.tsx` became a route
        // at `/route` — which is not what anyone naming it that means, and the
        // `.route` suffix is already reserved by the convention.
        let prefix =
            if file.name == ROOT_LAYOUT { Some("") } else { file.name.strip_suffix(ROUTE_SUFFIX) };
        if let Some(prefix) = prefix {
            layout_prefixes.push(prefix.to_string());
            layout_files.push((prefix.to_string(), file.file.clone()));
            layout_configs.push((prefix.to_string(), file.config.clone()));
        } else {
            leaves.push(file);
        }
    }
    // Shortest first, so a nested layout always finds its parent already built.
    layout_prefixes.sort_by_key(String::len);

    let mut roots: Vec<RouteNode> = Vec::new();
    // Paths into `roots`, by prefix, so a child can be pushed into its parent.
    let mut located: Vec<(String, Vec<usize>)> = Vec::new();

    for prefix in &layout_prefixes {
        let pathless = prefix.split('.').next_back().is_some_and(|last| last.starts_with('_'));
        let file =
            layout_files.iter().find(|(candidate, _)| candidate == prefix).map(|(_, f)| f.clone());
        let config = layout_configs
            .iter()
            .find(|(candidate, _)| candidate == prefix)
            .map_or_else(RouteConfig::default, |(_, c)| c.clone());
        let known: Vec<String> = located.iter().map(|(p, _)| p.clone()).collect();
        let parent = parent_prefix(prefix, &known);

        let own =
            if parent.is_empty() { prefix.clone() } else { prefix[parent.len() + 1..].to_string() };
        let node = RouteNode {
            // `__root__` rather than `/`, which the root INDEX already claims.
            // A route id is a key — the loader cache, `routeAssets` and the
            // route-action manifest all address by it — so two routes cannot
            // share one. TanStack spells the root route the same way.
            id: if prefix.is_empty() {
                ROOT_ID.to_owned()
            } else {
                format!("/{}", prefix.replace('.', "/"))
            },
            // The ROOT layout spans everything, so it takes `/`; `segments_of`
            // answers "" for the empty prefix, which would be a route with no
            // path at all.
            path: if pathless {
                None
            } else if prefix.is_empty() {
                Some("/".to_owned())
            } else {
                Some(segments_of(&own))
            },
            file,
            children: Vec::new(),
            pathless,
            config,
        };

        // `parent.is_empty()` is not the same question as "has no parent" once a
        // ROOT layout exists: `route.tsx` claims the empty prefix, so the
        // sentinel and a real key collide. Ask `located` instead.
        let route = if !located.iter().any(|(p, _)| *p == parent) {
            roots.push(node);
            vec![roots.len() - 1]
        } else {
            let parent_route = located
                .iter()
                .find(|(p, _)| *p == parent)
                .map(|(_, r)| r.clone())
                .unwrap_or_default();
            let target = node_at_mut(&mut roots, &parent_route);
            target.children.push(node);
            let mut route = parent_route;
            route.push(target.children.len() - 1);
            route
        };
        located.push((prefix.clone(), route));
    }

    for leaf in leaves {
        let is_index = leaf.name == INDEX || leaf.name.ends_with(&format!(".{INDEX}"));
        let prefix = if is_index {
            leaf.name[..leaf.name.len() - INDEX.len()].trim_end_matches('.').to_string()
        } else {
            leaf.name.clone()
        };

        // An index's parent is the layout at its OWN prefix — `users.index`
        // belongs to `users.route`. Looking only at shorter prefixes finds
        // nothing and makes every index a sibling of its own layout.
        let known: Vec<String> = located.iter().map(|(p, _)| p.clone()).collect();
        let parent_key = if is_index && known.contains(&prefix) {
            prefix.clone()
        } else {
            parent_prefix(&prefix, &known)
        };
        // An index's parent key IS its prefix, so there is nothing left over.
        let own = if parent_key.is_empty() {
            prefix.clone()
        } else if parent_key.len() >= prefix.len() {
            String::new()
        } else {
            prefix[parent_key.len() + 1..].to_string()
        };

        let node = RouteNode {
            // TanStack's convention: the index of `/users` is `/users/`, which
            // cannot collide with the layout's own `/users`.
            id: if is_index {
                if prefix.is_empty() {
                    "/".to_string()
                } else {
                    format!("/{}/", prefix.replace('.', "/"))
                }
            } else {
                format!("/{}", leaf.name.replace('.', "/"))
            },
            // An index child's path is empty: it IS its parent's path. A root
            // index has no parent to inherit from, so it names the root.
            path: Some(if is_index {
                // An index under a layout IS its parent's path. Only an index
                // with no layout above it has to name the root itself.
                if located.iter().any(|(p, _)| *p == parent_key) {
                    String::new()
                } else {
                    "/".to_string()
                }
            } else {
                segments_of(&own)
            }),
            file: Some(leaf.file.clone()),
            children: Vec::new(),
            pathless: false,
            config: leaf.config.clone(),
        };

        if !located.iter().any(|(p, _)| *p == parent_key) {
            roots.push(node);
        } else {
            let parent_route = located
                .iter()
                .find(|(p, _)| *p == parent_key)
                .map(|(_, r)| r.clone())
                .unwrap_or_default();
            node_at_mut(&mut roots, &parent_route).children.push(node);
        }
    }

    roots
}

fn node_at_mut<'a>(roots: &'a mut [RouteNode], route: &[usize]) -> &'a mut RouteNode {
    let (first, rest) = route.split_first().expect("a located route is never empty");
    let mut node = &mut roots[*first];
    for step in rest {
        node = &mut node.children[*step];
    }
    node
}

/// The virtual module.
///
/// Every component is a `lazy()` over a dynamic import, so a route is its own
/// chunk by construction rather than by a bundler heuristic — the emitted module
/// has exactly one static import and it is the runtime's.
pub fn generate_module(tree: &[RouteNode]) -> String {
    let mut out =
        String::from("import { lazy } from \"@barqjs/core\";\n\nconst Empty = () => null;\n\n");
    out.push_str(
        "/** A loader that lives in the route module, reached without loading it eagerly. */\n",
    );
    out.push_str("const lazyLoader = (load) => async (context) => {\n");
    out.push_str("  const module = await load();\n");
    out.push_str("  return module.loader === undefined ? undefined : module.loader(context);\n");
    out.push_str("};\n\n");
    out.push_str(
        "/** `middleware` is a BUILD-time claim, checked by identity — so it is a thunk. */\n",
    );
    out.push_str("const lazyMiddleware = (load) => async () => (await load()).middleware;\n");
    out.push_str("\nexport const routes = [\n");

    for (index, node) in tree.iter().enumerate() {
        emit_node(&mut out, node, 1);
        if index + 1 < tree.len() {
            out.push(',');
        }
        out.push('\n');
    }
    out.push_str("];\n\nexport default routes;\n");
    out
}

fn emit_node(out: &mut String, node: &RouteNode, depth: usize) {
    let pad = "  ".repeat(depth);
    out.push_str(&pad);
    out.push_str("{ ");
    let mut parts: Vec<String> = Vec::new();
    if let Some(path) = &node.path {
        parts.push(format!("path: {}", json_string(path)));
    }
    parts.push(format!("id: {}", json_string(&node.id)));
    if let Some(file) = &node.file {
        let specifier = json_string(&format!("/{file}"));
        // The SOURCE path, emitted beside the lazy component because nothing at
        // runtime can recover it: `lazy()` keeps the specifier inside its
        // closure and the returned function carries only `preload`. Without it
        // there is no way to ask a bundler manifest which chunk a route is in,
        // which is what `<link rel="modulepreload">` needs and what the
        // route-action manifest needs to walk the graph from a route.
        parts.push(format!("src: {specifier}"));
        parts.push(format!("component: lazy(() => import({specifier}))"));
        parts.push(format!("loader: lazyLoader(() => import({specifier}))"));
        parts.push(format!("middleware: lazyMiddleware(() => import({specifier}))"));
        parts.push(format!("pending: lazy(() => import({specifier}), (m) => m.Pending ?? Empty)"));
        // LIFTED, not imported. Both are wanted before the module loads, and the
        // module is `lazy()`.
        if let Some(ssr) = &node.config.ssr {
            parts.push(format!("ssr: {ssr}"));
        }
        if let Some(prerender) = node.config.prerender {
            parts.push(format!("prerender: {prerender}"));
        }
    }
    out.push_str(&parts.join(", "));
    if !node.children.is_empty() {
        out.push_str(", children: [\n");
        for (index, child) in node.children.iter().enumerate() {
            emit_node(out, child, depth + 1);
            if index + 1 < node.children.len() {
                out.push(',');
            }
            out.push('\n');
        }
        out.push_str(&pad);
        out.push(']');
    }
    out.push_str(" }");
}

/// Route id to source file, for EVERY node including layouts.
///
/// Layouts are included on purpose, unlike `patterns` and the `.d.ts` rows: a
/// modulepreload set is the whole matched CHAIN, and the route-action manifest
/// walks from every module a route renders, not only from its leaf.
pub fn entries(tree: &[RouteNode]) -> Vec<(String, String)> {
    let mut out = Vec::new();
    fn walk(node: &RouteNode, out: &mut Vec<(String, String)>) {
        if let Some(file) = &node.file {
            out.push((node.id.clone(), file.clone()));
        }
        for child in &node.children {
            walk(child, out);
        }
    }
    for node in tree {
        walk(node, &mut out);
    }
    out
}

/// The `.d.ts`: one plain interface member per LEAF route.
///
/// Measured against TanStack's real `Extract`-over-a-union lookup, generated
/// interfaces cost 8-15x less check time, and at 5000 routes the union arm does
/// not get slow — it stops checking (22,949 x TS2859). What they buy that
/// type-level parsing cannot at any speed is `loaderData` per route id, which is
/// not derivable from a path string.
/// Where the `.d.ts` will be written, project-relative, so the type references
/// it emits can RESOLVE.
///
/// The runtime module uses root-absolute specifiers (`/src/routes/x.tsx`) because
/// that is what Vite resolves. TypeScript does not: a leading `/` is the
/// filesystem root, so `typeof import("/src/routes/x.tsx")` silently resolved to
/// `any` and every generated type became permissive — with the `@ts-expect-error`
/// directives in the check file going UNUSED, which is how it was caught.
///
/// So a type reference is relative to the emitted file's own directory.
fn specifier_from(types_dir: &str, file: &str) -> String {
    let up = types_dir.split('/').filter(|part| !part.is_empty()).count();
    let mut out = String::new();
    for _ in 0..up {
        out.push_str("../");
    }
    if out.is_empty() {
        out.push_str("./");
    }
    out.push_str(file);
    out
}

pub fn generate_types(tree: &[RouteNode], types_dir: &str) -> String {
    let mut rows = Vec::new();
    let mut data_rows = Vec::new();
    for node in tree {
        collect_rows(node, "", &mut rows);
        collect_data_rows(node, types_dir, &mut data_rows);
    }
    let mut out = String::from("// Generated by @barqjs/router. Do not edit.\n");
    out.push_str("declare module \"virtual:barq-routes\" {\n");

    // The inference helpers. `routes.rs` reads no route file — only filenames —
    // and it does not have to: naming the module is enough, and TypeScript does
    // the rest. That is what keeps a second parser over the same files out of
    // this crate.
    //
    // Every arm FAILS CLOSED. An adversarial review found the first version
    // resolving a Standard Schema and a `.parse` object to `Record<string,
    // string>` — silently, with no error — so a route whose runtime validated to
    // a precise record was typed as "any string map". A wrong type that admits
    // anything is worse than no type: `never` makes the mistake loud.
    out.push_str("  type StandardOut<R> = R extends { value: infer S } ? S : never;\n");
    out.push_str(
        "  type ValidatedBy<V> = V extends { \"~standard\": { validate: (value: never) => infer R } }\n",
    );
    out.push_str("    ? StandardOut<Awaited<R>>\n");
    out.push_str("    : V extends { parse: (input: never) => infer S }\n");
    out.push_str("      ? S\n");
    out.push_str("      : V extends (input: never) => infer S\n");
    out.push_str("        ? S\n");
    out.push_str("        : never;\n");
    // A Standard Schema is probed FIRST because a zod v4 schema has both
    // `~standard` and `parse`, and the runtime probes it in that order too.
    out.push_str(
        "  type SearchOf<M> = M extends { validateSearch: infer V } ? ValidatedBy<V> : Record<string, unknown>;\n",
    );
    out.push_str(
        "  type DataOf<M> = M extends { loader: infer L } ? (L extends (...args: never) => infer R ? Awaited<R> : never) : undefined;\n\n",
    );

    out.push_str("  export interface RouteMap {\n");
    for row in &rows {
        out.push_str(row);
        out.push('\n');
    }
    out.push_str("  }\n\n");

    // Keyed by EVERY route with a module, layouts included — unlike `RouteMap`,
    // which is addressable routes only. A layout has a loader and a search of
    // its own, and typing only the leaves left them out of exactly the nested
    // chains the feature exists to serve.
    out.push_str("  export interface RouteData {\n");
    for row in &data_rows {
        out.push_str(row);
        out.push('\n');
    }
    out.push_str("  }\n\n");

    out.push_str("  export type RouteId = keyof RouteMap & string;\n");
    out.push_str("  export type RoutePath = RouteMap[RouteId][\"path\"];\n");
    out.push_str(
        "  export type SearchFor<Id extends keyof RouteData> = RouteData[Id][\"search\"];\n",
    );
    out.push_str("  export type DataFor<Id extends keyof RouteData> = RouteData[Id][\"data\"];\n");
    // `AnyRouteDefinition[]`, not `unknown[]`. The table is handed straight to
    // `createRouter` and `createPageHandler`, both of which take that type, so
    // `unknown[]` made every entry point in every app a type error the author
    // had to cast away — which is the "resolves to any" failure D5 already
    // recorded once, in a different spelling.
    out.push_str(
        "  export const routes: import(\"@barqjs/router\").AnyRouteDefinition[];\n  export default routes;\n}\n",
    );
    out
}

fn collect_rows(node: &RouteNode, parent: &str, rows: &mut Vec<String>) {
    let full = join_for_types(parent, node.path.as_deref());
    if node.children.is_empty() {
        let params: Vec<String> = full
            .split('/')
            .filter(|segment| segment.starts_with('$'))
            .map(|segment| {
                if segment == "$" {
                    "\"_splat\": string".to_string()
                } else {
                    format!("{}: string", &segment[1..])
                }
            })
            .collect();
        rows.push(format!(
            "    {}: {{ path: {}; params: {{ {} }} }};",
            json_string(&node.id),
            json_string(&full),
            params.join("; ")
        ));
    }
    for child in &node.children {
        collect_rows(child, &full, rows);
    }
}

/// One row per route that HAS a module, layouts included.
fn collect_data_rows(node: &RouteNode, types_dir: &str, rows: &mut Vec<String>) {
    if let Some(file) = &node.file {
        let specifier = json_string(&specifier_from(types_dir, file));
        rows.push(format!(
            "    {}: {{ search: SearchOf<typeof import({specifier})>; data: DataOf<typeof import({specifier})> }};",
            json_string(&node.id),
        ));
    }
    for child in &node.children {
        collect_data_rows(child, types_dir, rows);
    }
}

fn join_for_types(parent: &str, path: Option<&str>) -> String {
    match path {
        None | Some("") => {
            if parent.is_empty() {
                "/".to_string()
            } else {
                parent.to_string()
            }
        }
        Some(path) if path.starts_with('/') => path.to_string(),
        Some(path) => {
            let head = if parent == "/" { "" } else { parent };
            format!("{head}/{path}")
        }
    }
}

/// Every declaration a route made that is present but not a literal.
///
/// Reported rather than ignored, and rather than guessed at. A `prerender` the
/// scan cannot read is the difference between a page that exists on the CDN and
/// one that 404s, so answering "false, probably" would be the silent failure
/// this whole channel exists to avoid.
pub fn refusals(files: &[RouteFile]) -> Vec<String> {
    let mut out = Vec::new();
    for file in files {
        for refused in &file.config.refused {
            out.push(format!(
                "{}: `export const {refused}` is not a literal, so the route table cannot carry \
                 it — write `true`, `false` or (for `ssr`) \"data-only\"",
                file.file
            ));
        }
    }
    out
}

/// Every LEAF pattern, which is what `BARQ013` checks a `<Link to>` against.
pub fn patterns(tree: &[RouteNode]) -> Vec<String> {
    let mut out = Vec::new();
    for node in tree {
        collect_patterns(node, "", &mut out);
    }
    out
}

fn collect_patterns(node: &RouteNode, parent: &str, out: &mut Vec<String>) {
    let full = join_for_types(parent, node.path.as_deref());
    if node.children.is_empty() {
        out.push(full.clone());
    }
    for child in &node.children {
        collect_patterns(child, &full, out);
    }
}

fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            _ => out.push(character),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(names: &[&str]) -> Vec<RouteFile> {
        names
            .iter()
            .map(|name| RouteFile {
                file: format!("src/routes/{name}"),
                name: name_of(name),
                config: RouteConfig::default(),
            })
            .collect()
    }

    #[test]
    fn a_directory_separator_and_a_dot_name_the_same_route() {
        assert_eq!(name_of("users.$id.tsx"), "users.$id");
        assert_eq!(name_of("users/$id.tsx"), "users.$id");
        assert_eq!(name_of("index.jsx"), "index");
    }

    #[test]
    fn flat_files_become_flat_routes() {
        let tree = build_tree(&files(&["index.tsx", "about.tsx", "users.$id.tsx"]));
        let ids: Vec<&str> = tree.iter().map(|n| n.id.as_str()).collect();
        // Declaration order; only `scan` sorts, and this builds the list by hand.
        assert_eq!(ids, ["/", "/about", "/users/$id"]);
        // A root index names the root rather than `/index`.
        let root = tree.iter().find(|n| n.id == "/").expect("a root index");
        assert_eq!(root.path.as_deref(), Some("/"));
    }

    #[test]
    fn a_route_file_becomes_the_layout_its_siblings_nest_under() {
        let tree = build_tree(&files(&["users.route.tsx", "users.index.tsx", "users.$id.tsx"]));
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].path.as_deref(), Some("users"));
        let children: Vec<(&str, Option<&str>)> =
            tree[0].children.iter().map(|c| (c.id.as_str(), c.path.as_deref())).collect();
        assert_eq!(children, [("/users/", Some("")), ("/users/$id", Some("$id"))]);
    }

    #[test]
    fn a_prefix_nobody_declares_stays_flat() {
        let tree = build_tree(&files(&["users.index.tsx", "users.$id.tsx"]));
        assert_eq!(tree.len(), 2);
        assert!(tree.iter().all(|n| n.children.is_empty()));
    }

    #[test]
    fn a_leading_underscore_is_a_pathless_layout() {
        let tree = build_tree(&files(&["_shell.route.tsx", "_shell.dashboard.tsx"]));
        assert!(tree[0].pathless);
        assert!(tree[0].path.is_none());
        assert_eq!(tree[0].children[0].path.as_deref(), Some("dashboard"));
    }

    #[test]
    fn nested_layouts_compose_and_a_child_path_is_relative() {
        let tree =
            build_tree(&files(&["users.route.tsx", "users.$id.route.tsx", "users.$id.edit.tsx"]));
        assert_eq!(tree[0].path.as_deref(), Some("users"));
        assert_eq!(tree[0].children[0].path.as_deref(), Some("$id"));
        assert_eq!(tree[0].children[0].children[0].path.as_deref(), Some("edit"));
    }

    #[test]
    fn the_emitted_module_imports_nothing_eagerly_and_parses() {
        let tree = build_tree(&files(&[
            "index.tsx",
            "users.route.tsx",
            "users.index.tsx",
            "users.$id.tsx",
            "files.$.tsx",
        ]));
        let module = generate_module(&tree);
        assert_eq!(
            module.matches("\nimport ").count() + usize::from(module.starts_with("import ")),
            1
        );
        assert!(module.contains("lazy(() => import(\"/src/routes/users.$id.tsx\"))"));

        // The SOURCE path rides beside the lazy component. Nothing at runtime
        // can recover it — `lazy()` keeps the specifier inside its closure —
        // and a bundler manifest is keyed by exactly this string, so
        // modulepreload and the route-action manifest both start here.
        assert!(module.contains("src: \"/src/routes/users.$id.tsx\""));
        // A layout gets one too, so a chain can be walked whole.
        assert!(module.contains("src: \"/src/routes/users.route.tsx\""));

        // A generated module nothing parses is how `export const default =` — a
        // syntax error — shipped in the client stubs. Parse it for real.
        let allocator = oxc::allocator::Allocator::new();
        let parsed =
            oxc::parser::Parser::new(&allocator, &module, oxc::span::SourceType::mjs()).parse();
        assert!(parsed.diagnostics.is_empty(), "{module}\n{:?}", parsed.diagnostics);
    }

    #[test]
    fn middleware_is_a_thunk_because_it_is_compared_by_identity() {
        // `ssr` and `prerender` are lifted as LITERALS; `middleware` cannot be —
        // it is an anonymous closure the build compares with `===`, so it goes
        // through the same lazy import `loader` uses.
        let module = generate_module(&build_tree(&files(&["index.tsx", "about.tsx"])));
        assert!(
            module.contains(
                "const lazyMiddleware = (load) => async () => (await load()).middleware;"
            ),
            "{module}"
        );
        assert_eq!(
            module.matches("middleware: lazyMiddleware(() => import(").count(),
            2,
            "{module}"
        );
    }

    #[test]
    fn a_types_specifier_is_relative_to_where_the_file_is_written() {
        let tree = build_tree(&files(&["users.$id.tsx"]));
        // At the project root, a plain relative path.
        assert!(generate_types(&tree, "").contains("import(\"./src/routes/users.$id.tsx\")"));
        // One directory down, one `../`.
        assert!(generate_types(&tree, "src").contains("import(\"../src/routes/users.$id.tsx\")"));
        // Two down, two.
        assert!(
            generate_types(&tree, "src/types")
                .contains("import(\"../../src/routes/users.$id.tsx\")")
        );
    }

    #[test]
    fn the_types_carry_one_member_per_leaf_with_its_params() {
        let tree =
            build_tree(&files(&["index.tsx", "users.route.tsx", "users.$id.tsx", "files.$.tsx"]));
        let types = generate_types(&tree, "src");
        assert!(types.contains("\"/users/$id\": { path: \"/users/$id\"; params: { id: string } }"));
        assert!(types.contains("\"_splat\": string"));

        // A layout is not addressable on its own, so it is not a `RouteMap`
        // member — but it HAS a loader and a search, so it is a `RouteData` one.
        // Typing only the leaves left layouts out of exactly the nested chains
        // the feature exists to serve.
        let (map, data) =
            types.split_once("export interface RouteData").expect("a RouteData block");
        assert!(!map.contains("\"/users\": {"));
        // RELATIVE to where the `.d.ts` is written, not root-absolute: a leading
        // `/` is the filesystem ROOT to TypeScript, so a root-absolute specifier
        // resolved to `any` and every generated type became permissive.
        assert!(data.contains(
            "\"/users\": { search: SearchOf<typeof import(\"../src/routes/users.route.tsx\")>"
        ));
        assert!(data.contains(
            "\"/users/$id\": { search: SearchOf<typeof import(\"../src/routes/users.$id.tsx\")>"
        ));

        // Every arm fails CLOSED: an unreadable validator or loader shape
        // resolves to `never`, not to a permissive record. A wrong type that
        // admits anything is worse than no type.
        assert!(types.contains(": never;"));
        assert!(types.contains("Record<string, unknown>"));
    }

    #[test]
    fn entries_map_every_route_id_to_its_file_including_layouts() {
        let tree = build_tree(&files(&[
            "index.tsx",
            "users.route.tsx",
            "users.index.tsx",
            "users.$id.tsx",
        ]));
        let map = entries(&tree);
        assert!(map.contains(&("/users/$id".to_string(), "src/routes/users.$id.tsx".to_string())));
        // The LAYOUT is here even though it is not addressable on its own: a
        // modulepreload set is the whole chain.
        assert!(map.contains(&("/users".to_string(), "src/routes/users.route.tsx".to_string())));
    }

    #[test]
    fn patterns_are_what_barq013_checks_against() {
        let tree = build_tree(&files(&[
            "index.tsx",
            "users.route.tsx",
            "users.index.tsx",
            "users.$id.tsx",
        ]));
        let mut found = patterns(&tree);
        found.sort();
        assert_eq!(found, ["/", "/users", "/users/$id"]);
    }

    #[test]
    fn a_missing_directory_is_an_empty_table_rather_than_an_error() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        assert!(scan(root, "no-such-directory-here").is_empty());
    }

    #[test]
    fn scanning_this_crate_finds_its_own_docs_free_of_route_files() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        // `docs/` holds only markdown, so the extension filter is doing its job.
        assert!(scan(root, "docs").is_empty());
    }

    #[test]
    fn a_route_declares_its_own_render_mode_and_the_table_carries_it() {
        // Both are wanted BEFORE the module loads and the module is `lazy()`, so
        // a runtime read is not available at the moment either is asked for.
        let config = read_config("export const ssr = false\nexport default function P() {}\n");
        assert_eq!(config.ssr.as_deref(), Some("false"));
        assert_eq!(config.prerender, None);

        let config =
            read_config("export const ssr = \"data-only\";\nexport const prerender = true;\n");
        assert_eq!(config.ssr.as_deref(), Some("\"data-only\""));
        assert_eq!(config.prerender, Some(true));
    }

    #[test]
    fn a_non_literal_declaration_is_refused_rather_than_guessed_at() {
        // Astro's rule, and its reason: "Mutable values declared at runtime are
        // not supported." A `prerender` the scan cannot read decides whether a
        // page exists on the CDN, so answering "false, probably" is the silent
        // failure this channel exists to avoid.
        let config = read_config("export const prerender = shouldPrerender();\n");
        assert_eq!(config.prerender, None);
        assert_eq!(config.refused, vec!["prerender = shouldPrerender()".to_owned()]);

        let config = read_config("export const ssr = MODE;\n");
        assert_eq!(config.ssr, None);
        assert_eq!(config.refused, vec!["ssr = MODE".to_owned()]);
    }

    #[test]
    fn only_a_top_level_export_counts() {
        // An indented match is inside something, and a longer identifier is a
        // different declaration entirely.
        assert_eq!(read_config("  export const ssr = false\n"), RouteConfig::default());
        assert_eq!(read_config("export const ssrMode = false\n"), RouteConfig::default());
    }

    #[test]
    fn the_emitted_table_carries_the_declarations() {
        let files = vec![
            RouteFile {
                file: "src/routes/about.tsx".to_owned(),
                name: "about".to_owned(),
                config: RouteConfig {
                    ssr: Some("false".to_owned()),
                    prerender: Some(true),
                    refused: Vec::new(),
                },
            },
            RouteFile {
                file: "src/routes/live.tsx".to_owned(),
                name: "live".to_owned(),
                config: RouteConfig::default(),
            },
        ];
        let module = generate_module(&build_tree(&files));
        assert!(module.contains("ssr: false"), "{module}");
        assert!(module.contains("prerender: true"), "{module}");
        // A route that declares nothing emits nothing, so the runtime default
        // stays the runtime's to decide.
        let live = module.lines().find(|line| line.contains("/live")).unwrap_or_default();
        assert!(!live.contains("ssr:"), "{live}");
        assert!(!live.contains("prerender:"), "{live}");
    }
}
