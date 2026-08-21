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
}

#[derive(Debug, Clone)]
pub struct RouteNode {
    pub id: String,
    /// This route's pattern RELATIVE to its parent. `None` is pathless.
    pub path: Option<String>,
    pub file: Option<String>,
    pub children: Vec<RouteNode>,
    pub pathless: bool,
}

const EXTENSIONS: [&str; 4] = [".tsx", ".jsx", ".ts", ".js"];
const ROUTE_SUFFIX: &str = ".route";
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
        out.push(RouteFile {
            file: from_root.to_string_lossy().replace('\\', "/"),
            name: name_of(&from_base.to_string_lossy().replace('\\', "/")),
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
    let mut leaves: Vec<&RouteFile> = Vec::new();

    for file in files {
        if let Some(prefix) = file.name.strip_suffix(ROUTE_SUFFIX) {
            layout_prefixes.push(prefix.to_string());
            layout_files.push((prefix.to_string(), file.file.clone()));
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
        let file = layout_files
            .iter()
            .find(|(candidate, _)| candidate == prefix)
            .map(|(_, file)| file.clone());
        let known: Vec<String> = located.iter().map(|(p, _)| p.clone()).collect();
        let parent = parent_prefix(prefix, &known);

        let own =
            if parent.is_empty() { prefix.clone() } else { prefix[parent.len() + 1..].to_string() };
        let node = RouteNode {
            id: if prefix.is_empty() {
                "/".to_string()
            } else {
                format!("/{}", prefix.replace('.', "/"))
            },
            path: if pathless { None } else { Some(segments_of(&own)) },
            file,
            children: Vec::new(),
            pathless,
        };

        let route = if parent.is_empty() {
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
                if parent_key.is_empty() { "/".to_string() } else { String::new() }
            } else {
                segments_of(&own)
            }),
            file: Some(leaf.file.clone()),
            children: Vec::new(),
            pathless: false,
        };

        if parent_key.is_empty() {
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
    out.push_str("};\n\nexport const routes = [\n");

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
        parts.push(format!("pending: lazy(() => import({specifier}), (m) => m.Pending ?? Empty)"));
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
    out.push_str("  export const routes: unknown[];\n  export default routes;\n}\n");
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
            .map(|name| RouteFile { file: format!("src/routes/{name}"), name: name_of(name) })
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
}
