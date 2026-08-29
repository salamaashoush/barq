//! File-based routes: the scan, the tree, and both emits.
//!
//! All of it is here rather than in the Vite plugin. The plugin's job is to ask
//! and to invalidate; it does not read the directory, does not derive a route
//! from a filename, and does not build a string. One implementation, in the
//! compiler, so a route table cannot mean two things. What the plugin keeps is
//! the WATCHER — Vite owns file events and `scan` returns the file list so the
//! plugin can register them — which is the one part that genuinely cannot move.
//!
//! Naming is TanStack's, and this is a port of their algorithm rather than a
//! paraphrase of their docs. Nesting is decided by walking the `/` SEGMENTS of
//! the absolute route path and taking the longest registered prefix
//! (`router-generator/src/utils.ts:47-62`, `RoutePrefixMap.findParent`), not by
//! comparing dotted filenames. That distinction is what makes the `_` suffix
//! work with no rule of its own — see `build_tree`.
//!
//! ```text
//! __root.tsx                ->  the root, `__root__`
//! index.tsx                 ->  /
//! posts.tsx                 ->  /posts, and the layout everything below nests in
//! posts.index.tsx           ->  /posts/
//! posts.$postId.tsx         ->  /posts/$postId
//! posts_.$postId.edit.tsx   ->  /posts/$postId/edit, NOT nested in posts.tsx
//! posts/route.tsx           ->  the same layout as posts.tsx, directory form
//! files.$.tsx               ->  /files/$   (splat)
//! _app.tsx                  ->  a PATHLESS layout
//! (marketing)/about.tsx     ->  /about     (the group is not in the URL)
//! script[.]js.tsx           ->  /script.js
//! -helpers.tsx              ->  not a route at all
//! ```

use std::path::Path;

pub use crate::route_source::{RouteConfig, RouteKind, RouteModule};

/// One discovered file, before it becomes a route.
#[derive(Debug, Clone)]
pub struct RouteFile {
    /// Project-relative, POSIX separators. What the emitted module imports.
    pub file: String,
    /// Relative to the ROUTES directory, extension removed, separators kept:
    /// `posts.$id`, `posts/$id`, `(marketing)/about`.
    pub name: String,
    /// What the file says about itself, lifted from its own AST.
    pub module: RouteModule,
}

#[derive(Debug, Clone)]
pub struct RouteNode {
    /// The ABSOLUTE route path, which is also the key everything addresses by:
    /// the loader cache, `routeAssets` and the route-action manifest. `__root__`
    /// for the root, which cannot be `/` because the root INDEX is.
    pub id: String,
    /// This route's pattern RELATIVE to its parent, with route groups and
    /// pathless segments removed. `None` is pathless — it contributes no URL,
    /// which is `path` being omitted entirely in theirs (`generator.ts:703-707`).
    pub path: Option<String>,
    pub file: Option<String>,
    pub children: Vec<RouteNode>,
    pub pathless: bool,
    /// What the file declared about itself. Empty for a node with no file.
    pub config: RouteConfig,
    /// The option keys the route WROTE, so the emit can leave out a picker for
    /// one it did not — see `RouteModule::props`.
    pub declared: Vec<String>,
}

const EXTENSIONS: [&str; 4] = [".tsx", ".jsx", ".ts", ".js"];
/// The layout for a directory: `posts/route.tsx` is `posts.tsx`.
const ROUTE_TOKEN: &str = "route";
const INDEX_TOKEN: &str = "index";
/// The root route's FILE, and its id, which differ because `/` is the root index.
const ROOT_FILE: &str = "__root";
const ROOT_ID: &str = "__root__";
/// A file or directory the route tree does not see, so logic can sit beside a
/// route (`routing-concepts.md:551`). Theirs is `routeFileIgnorePrefix`.
const IGNORE_PREFIX: char = '-';

/// Strip the extension. Separators are left alone — `derive` splits on both.
pub fn name_of(relative: &str) -> String {
    let mut base = relative;
    for extension in EXTENSIONS {
        if let Some(stripped) = base.strip_suffix(extension) {
            base = stripped;
            break;
        }
    }
    base.replace('\\', "/")
}

fn is_route_file(name: &str) -> bool {
    if !EXTENSIONS.iter().any(|extension| name.ends_with(extension)) {
        return false;
    }
    // A test or a story beside a route is not a route.
    !(name.contains(".test.") || name.contains(".spec.") || name.contains(".stories."))
}

/// A name the tree does not see at all: `-helpers.tsx`, `-components/`, dotfiles.
fn is_ignored(name: &str) -> bool {
    name.starts_with(IGNORE_PREFIX) || name.starts_with('.')
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
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else { continue };
        // The ignore prefix applies to DIRECTORIES too, which is what makes
        // `-components/` a place to put things (`getRouteNodes.ts:70-74`).
        if is_ignored(file_name) {
            continue;
        }
        if path.is_dir() {
            walk(&path, base, root, out);
            continue;
        }
        if !is_route_file(file_name) {
            continue;
        }
        let Ok(from_root) = path.strip_prefix(root) else { continue };
        let Ok(from_base) = path.strip_prefix(base) else { continue };
        let file = from_root.to_string_lossy().replace('\\', "/");
        // `ssr` and `prerender` have to be in the table, the table is built
        // before anything runs, and the module is `lazy()` — so there is no
        // later moment to ask. See `route_source`.
        let module = std::fs::read_to_string(&path)
            .map(|text| crate::route_source::read_module(&text, &file))
            .unwrap_or_default();
        out.push(RouteFile {
            file,
            name: name_of(&from_base.to_string_lossy().replace('\\', "/")),
            module,
        });
    }
}

/// Split a name into route segments.
///
/// A `/` is a separator, and so is a `.` — except one written `[.]`, which is a
/// literal dot in the URL. Their rule is a lookaround pair,
/// `SPLIT_REGEX = /(?<!\[)\.(?!\])/g` (`utils.ts:168`): a dot is a separator
/// unless a `[` is immediately before it or a `]` immediately after. Ported as
/// the same test rather than as bracket NESTING, because that is what theirs
/// does and the two disagree on `foo[a.b]`.
fn split_parts(name: &str) -> Vec<&str> {
    let bytes = name.as_bytes();
    let mut parts = Vec::new();
    let mut start = 0usize;
    for (index, character) in name.char_indices() {
        let separator = match character {
            '/' => true,
            '.' => bytes[..index].last() != Some(&b'[') && bytes.get(index + 1) != Some(&b']'),
            _ => false,
        };
        if separator {
            parts.push(&name[start..index]);
            start = index + character.len_utf8();
        }
    }
    parts.push(&name[start..]);
    parts.retain(|part| !part.is_empty());
    parts
}

/// `[x]` -> `x`, which is how a segment escapes a character that would
/// otherwise route (`BRACKET_CONTENT_RE`, `utils.ts:167`).
fn unbracket(part: &str) -> String {
    let mut out = String::with_capacity(part.len());
    let mut rest = part;
    while let Some(open) = rest.find('[') {
        let Some(close) = rest[open..].find(']') else { break };
        out.push_str(&rest[..open]);
        out.push_str(&rest[open + 1..open + close]);
        rest = &rest[open + close + 1..];
    }
    out.push_str(rest);
    out
}

/// Entirely wrapped, with no nesting: `[index]` yes, `foo[.]bar` no.
fn is_fully_escaped(segment: &str) -> bool {
    segment.len() >= 2
        && segment.starts_with('[')
        && segment.ends_with(']')
        && !segment[1..segment.len() - 1].contains(['[', ']'])
}

/// `[_]layout` and `[_1nd3x]` mean a LITERAL leading underscore (`utils.ts:267`).
fn has_escaped_leading_underscore(original: &str) -> bool {
    original.starts_with("[_]") || (original.starts_with("[_") && is_fully_escaped(original))
}

/// `blog[_]` and `[_r0ut3_]` mean a LITERAL trailing underscore (`utils.ts:281`).
fn has_escaped_trailing_underscore(original: &str) -> bool {
    original.ends_with("[_]") || (original.ends_with("_]") && is_fully_escaped(original))
}

/// The inner text of a fully wrapped segment, else the segment.
fn unwrap_bracket_segment(segment: &str) -> &str {
    if is_fully_escaped(segment) { &segment[1..segment.len() - 1] } else { segment }
}

/// A token spelled `[index]` / `[route]` is the WORD, not the token.
fn is_escaped_token(original: &str, token: &str) -> bool {
    unwrap_bracket_segment(original) != original && unwrap_bracket_segment(original) == token
}

/// A segment that contributes no URL: an unescaped leading underscore.
fn is_segment_pathless(segment: &str, original: &str) -> bool {
    segment.starts_with('_') && !has_escaped_leading_underscore(original)
}

/// What a filename says, before anything is nested.
///
/// Segments rather than a joined string because the parent's prefix has to be
/// cut off the child, and the two spellings differ in LENGTH wherever a bracket
/// was resolved — so the cut can only be by segment count, which they share.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Derived {
    /// Brackets resolved, underscores and route groups INTACT: nesting keys on
    /// these, which is theirs `routePath` split up.
    segments: Vec<String>,
    /// The same segments, brackets intact, so an escape is still visible.
    original: Vec<String>,
    index: bool,
    pathless: bool,
    root: bool,
}

impl Derived {
    /// The absolute route path. An index's trailing `/` is what keeps it from
    /// colliding with its own layout: `/posts/` beside `/posts`.
    fn route_path(&self) -> String {
        let mut path = format!("/{}", self.segments.join("/"));
        if self.index && !path.ends_with('/') {
            path.push('/');
        }
        path
    }
}

fn derive(name: &str) -> Derived {
    let parts = split_parts(name);
    let mut segments: Vec<String> = parts.iter().map(|part| unbracket(part)).collect();
    let mut original: Vec<String> = parts.into_iter().map(str::to_owned).collect();

    let root = segments.len() == 1 && segments[0] == ROOT_FILE;
    // BEFORE the tokens are stripped, which is where theirs asks it too
    // (`getRouteNodes.ts:209`) — `_layout/route.tsx` is a pathless layout, and
    // that is only visible while `route` is still the last segment.
    let pathless = is_pathless(&segments, &original);

    // `posts/route.tsx` is the layout at `/posts`, exactly as `posts.tsx` is.
    if segments.len() > 1
        && segments.last().is_some_and(|last| last == ROUTE_TOKEN)
        && !original.last().is_some_and(|last| is_escaped_token(last, ROUTE_TOKEN))
    {
        segments.pop();
        original.pop();
    }

    // The index of `/posts` is `/posts/`, which cannot collide with `/posts`.
    let mut index = false;
    if segments.last().is_some_and(|last| last == INDEX_TOKEN)
        && !original.last().is_some_and(|last| is_escaped_token(last, INDEX_TOKEN))
    {
        segments.pop();
        original.pop();
        index = true;
    }

    Derived { segments, original, index, pathless, root }
}

/// Ported from `isValidPathlessLayoutRoute` (`getRouteNodes.ts:501-559`).
fn is_pathless(segments: &[String], original: &[String]) -> bool {
    let Some(last) = segments.last() else { return false };
    if last == ROOT_FILE {
        return false;
    }
    // `/foo/_layout/route.tsx` IS `/foo/_layout.tsx`, so the underscore to read
    // is the one on the segment BEFORE the token.
    if last == ROUTE_TOKEN && segments.len() >= 2 {
        let previous = &segments[segments.len() - 2];
        let previous_original = &original[original.len() - 2];
        if has_escaped_leading_underscore(previous_original) {
            return false;
        }
        return previous.starts_with('_');
    }
    let last_original = original.last().map_or("", String::as_str);
    if has_escaped_leading_underscore(last_original) {
        return false;
    }
    last != INDEX_TOKEN && last != ROUTE_TOKEN && last.starts_with('_')
}

/// `(marketing)/about` -> `about`. The group organises files, not URLs
/// (`possiblyNestedRouteGroupPatternRegex = /\([^/]+\)\/?/g`, `utils.ts:845`).
fn remove_groups(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut rest = path;
    while let Some(open) = rest.find('(') {
        let Some(close) = rest[open..].find(')') else { break };
        // `[^/]+` — a group never spans a separator, so a `(` that does is text.
        if rest[open..open + close].contains('/') {
            out.push_str(&rest[..=open]);
            rest = &rest[open + 1..];
            continue;
        }
        out.push_str(&rest[..open]);
        rest = &rest[open + close + 1..];
        rest = rest.strip_prefix('/').unwrap_or(rest);
    }
    out.push_str(rest);
    out
}

/// The URL a run of segments contributes.
///
/// A pathless segment is DROPPED whole; a segment that merely ends in `_` keeps
/// its text and loses the underscore. One pass over both spellings, so removing
/// a segment cannot desync the escape check —
/// `removeLayoutSegmentsAndUnderscoresWithEscape` (`utils.ts:568-599`).
fn clean_path(segments: &[String], original: &[String]) -> String {
    let mut out: Vec<&str> = Vec::new();
    for (index, segment) in segments.iter().enumerate() {
        let original = original.get(index).map_or("", String::as_str);
        if is_segment_pathless(segment, original) {
            continue;
        }
        let mut kept = segment.as_str();
        if kept.ends_with('_') && !has_escaped_trailing_underscore(original) {
            kept = &kept[..kept.len() - 1];
        }
        out.push(kept);
    }
    remove_groups(&out.join("/"))
}

/// Build the nested table.
///
/// Nesting is a walk up the `/` segments of the absolute route path, longest
/// registered prefix wins (`RoutePrefixMap.findParent`, `utils.ts:47-62`). The
/// `_` SUFFIX needs no rule of its own because of it: `posts_.$postId.edit.tsx`
/// is `/posts_/$postId/edit`, nothing ever registers `/posts_`, so the walk
/// finds no parent and the route lands at the top — un-nested, which is the
/// whole point of the suffix. The underscore then leaves through `clean_path`.
pub fn build_tree(files: &[RouteFile]) -> Vec<RouteNode> {
    let derived: Vec<(&RouteFile, Derived)> =
        files.iter().map(|file| (file, derive(&file.name))).collect();

    // Every route path that can BE a parent. The root is not one: it is the
    // tree's root and everything is under it, which a prefix walk would not say
    // (`RoutePrefixMap`'s constructor skips `/${rootPathId}` for the same reason).
    let registered: Vec<String> =
        derived.iter().filter(|(_, node)| !node.root).map(|(_, node)| node.route_path()).collect();

    let mut roots: Vec<RouteNode> = Vec::new();
    // Absolute route path -> the route into `roots`, so a child can be pushed
    // into its parent. Built shallowest-first, so a parent is always there.
    let mut located: Vec<(String, Vec<usize>)> = Vec::new();

    if let Some((file, _)) = derived.iter().find(|(_, node)| node.root) {
        roots.push(RouteNode {
            id: ROOT_ID.to_owned(),
            // The root layout spans everything, so it takes `/`.
            path: Some("/".to_owned()),
            file: Some(file.file.clone()),
            children: Vec::new(),
            pathless: false,
            config: file.module.config.clone(),
            declared: file.module.props.clone(),
        });
        located.push((ROOT_ID.to_owned(), vec![0]));
    }

    let mut ordered: Vec<&(&RouteFile, Derived)> =
        derived.iter().filter(|(_, node)| !node.root).collect();
    // Shallowest first, so a parent is always already located. Ties broken by
    // path so the emit is deterministic.
    ordered.sort_by(|a, b| {
        a.1.segments
            .len()
            .cmp(&b.1.segments.len())
            .then_with(|| a.1.route_path().cmp(&b.1.route_path()))
    });

    for (file, node) in ordered {
        let route_path = node.route_path();
        let parent = find_parent(&registered, &route_path);
        let taken = parent.map_or(0, |parent| {
            derived
                .iter()
                .find(|(_, candidate)| !candidate.root && candidate.route_path() == parent)
                .map_or(0, |(_, candidate)| candidate.segments.len())
        });
        let cleaned = clean_path(&node.segments[taken..], &node.original[taken..]);

        let parent_route = parent
            .and_then(|parent| located.iter().find(|(path, _)| path == parent))
            .or_else(|| located.iter().find(|(path, _)| path == ROOT_ID))
            .map(|(_, route)| route.clone());

        let child = RouteNode {
            id: route_path.clone(),
            path: if node.pathless {
                None
            } else if cleaned.is_empty() {
                // An index under something IS its parent's path. Only one with
                // nothing above it has to name the root itself.
                Some(if parent_route.is_some() { String::new() } else { "/".to_owned() })
            } else {
                Some(cleaned)
            },
            file: Some(file.file.clone()),
            children: Vec::new(),
            pathless: node.pathless,
            config: file.module.config.clone(),
            declared: file.module.props.clone(),
        };

        let route = match parent_route {
            Some(parent_route) => {
                let target = node_at_mut(&mut roots, &parent_route);
                target.children.push(child);
                let mut route = parent_route;
                route.push(target.children.len() - 1);
                route
            }
            None => {
                roots.push(child);
                vec![roots.len() - 1]
            }
        };
        located.push((route_path, route));
    }

    roots
}

/// The longest registered strict prefix, walking up whole segments.
fn find_parent<'a>(registered: &'a [String], route_path: &str) -> Option<&'a str> {
    if route_path.is_empty() || route_path == "/" {
        return None;
    }
    let mut search = route_path;
    while !search.is_empty() {
        let Some(slash) = search.rfind('/') else { break };
        if slash == 0 {
            break;
        }
        search = &search[..slash];
        if let Some(found) = registered
            .iter()
            .find(|candidate| candidate.as_str() == search && *candidate != route_path)
        {
            return Some(found);
        }
    }
    None
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
    let mut out = String::from("import { lazy } from \"@barqjs/core\";\n");
    // `@barqjs/router`, never `@barqjs/router/server`: this module is imported
    // by the browser, and the server entry reaches `node:async_hooks`.
    out.push_str("import { Outlet } from \"@barqjs/router\";\n\n");
    out.push_str("const Empty = () => null;\n\n");
    out.push_str("/** A route module has ONE export and it is called `Route`. */\n");
    out.push_str("const optionsOf = (module) => module.Route?.options ?? {};\n\n");
    out.push_str(
        "/** A loader that lives in the route module, reached without loading it eagerly. */\n",
    );
    out.push_str("const lazyLoader = (load) => async (context) => {\n");
    out.push_str("  const { loader } = optionsOf(await load());\n");
    out.push_str("  return loader === undefined ? undefined : loader(context);\n");
    out.push_str("};\n\n");
    out.push_str("/** `head` and `scripts`, reached the same way and accepting an object. */\n");
    out.push_str("const lazyAsset = (load, pick) => async (context) => {\n");
    out.push_str("  const declared = optionsOf(await load())[pick];\n");
    out.push_str("  return typeof declared === \"function\" ? declared(context) : declared;\n");
    out.push_str("};\n\n");
    out.push_str(
        "/** `middleware` is a BUILD-time claim, checked by identity — so it is a thunk. */\n",
    );
    out.push_str(
        "const lazyMiddleware = (load) => async () => optionsOf(await load()).middleware;\n",
    );
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

fn declares(node: &RouteNode, option: &str) -> bool {
    node.declared.iter().any(|declared| declared == option)
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
        // A route that declares no component renders its child, not nothing —
        // `route.options.component ?? defaultComponent` falling through to
        // `<Outlet />` in theirs (`react-router/src/Match.tsx:211-212`). A layout
        // that declares only a loader would otherwise swallow its whole subtree.
        parts.push(format!(
            "component: lazy(() => import({specifier}), (m) => optionsOf(m).component ?? Outlet)"
        ));
        parts.push(format!("loader: lazyLoader(() => import({specifier}))"));
        // The DOCUMENT, and only the root has one: `shellComponent` renders
        // `<html>` around everything, so a nested route declaring one would be
        // a second document inside the first.
        if node.id == ROOT_ID && declares(node, "shellComponent") {
            parts.push(format!(
                "shellComponent: lazy(() => import({specifier}), (m) => optionsOf(m).shellComponent ?? Empty)"
            ));
        }
        parts.push(format!("head: lazyAsset(() => import({specifier}), \"head\")"));
        parts.push(format!("scripts: lazyAsset(() => import({specifier}), \"scripts\")"));
        parts.push(format!("middleware: lazyMiddleware(() => import({specifier}))"));
        // ONLY when the route wrote one. An absent `pendingComponent` means
        // "this boundary shows nothing" (`router/src/route.ts:257`), and a
        // `lazy()` resolving to an empty component is a different answer: a cold
        // `lazy()` throws `NotReadyError`, which PARKS the loading boundary onto
        // exactly this fallback — so every page rendered empty.
        if declares(node, "pendingComponent") {
            parts.push(format!(
                "pendingComponent: lazy(() => import({specifier}), (m) => optionsOf(m).pendingComponent ?? Empty)"
            ));
        }
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
    // A route module has ONE export and it is called `Route`, so every lookup
    // goes through its options rather than through the module's own members.
    out.push_str("  type OptionsOf<M> = M extends { Route: { options: infer O } } ? O : never;\n");
    out.push_str(
        "  type SearchOf<M> = OptionsOf<M> extends { validateSearch: infer V } ? ValidatedBy<V> : Record<string, unknown>;\n",
    );
    out.push_str(
        "  type DataOf<M> = OptionsOf<M> extends { loader: infer L } ? (L extends (...args: never) => infer R ? Awaited<R> : never) : undefined;\n\n",
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

/// The id a filename derives, which is what `createFileRoute`'s literal must say.
pub fn route_id(name: &str) -> String {
    let derived = derive(name);
    if derived.root { ROOT_ID.to_owned() } else { derived.route_path() }
}

/// A route file whose declared id disagrees with the one its NAME derives.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdMismatch {
    /// Project-relative source path.
    pub file: String,
    pub declared: String,
    pub expected: String,
}

/// Every route file whose id literal is out of date.
///
/// The literal is GENERATOR-OWNED. It is derived from the filename, so a rename
/// makes every one of them wrong at once, and hand-maintaining it is the chore
/// `createFileRoute` exists to remove — their plugin rewrites it in place
/// (`transform.ts:133-140`). Only a file route has one: the root's constructor
/// takes no id.
pub fn id_mismatches(files: &[RouteFile]) -> Vec<IdMismatch> {
    let mut out = Vec::new();
    for file in files {
        if file.module.kind != Some(RouteKind::File) {
            continue;
        }
        let Some(declared) = &file.module.id else { continue };
        let expected = route_id(&file.name);
        if declared.value != expected {
            out.push(IdMismatch {
                file: file.file.clone(),
                declared: declared.value.clone(),
                expected,
            });
        }
    }
    out
}

/// Rewrite one file's id literal on disk, returning whether anything changed.
///
/// A byte splice on the parsed span, so comments, formatting and the author's
/// quote style survive a rename untouched.
pub fn write_id(root: &Path, file: &RouteFile) -> std::io::Result<bool> {
    let Some(declared) = &file.module.id else { return Ok(false) };
    let expected = route_id(&file.name);
    if declared.value == expected {
        return Ok(false);
    }
    let path = root.join(&file.file);
    let source = std::fs::read_to_string(&path)?;
    // Re-read rather than trusting the span against a file that may have been
    // edited since the scan: a stale offset would splice into the middle of
    // something else.
    let fresh = crate::route_source::read_module(&source, &file.file);
    let Some(declared) = fresh.id else { return Ok(false) };
    if declared.value == expected {
        return Ok(false);
    }
    std::fs::write(&path, crate::route_source::rewrite_id(&source, &declared, &expected))?;
    Ok(true)
}

/// Every declaration a route made that the table cannot carry.
///
/// Reported rather than ignored, and rather than guessed at. A `prerender` the
/// scan cannot read is the difference between a page that exists on the CDN and
/// one that 404s, so answering "false, probably" would be the silent failure
/// this whole channel exists to avoid — and the same is true of the OLD
/// spelling, which is why a leftover `export const ssr` is reported here
/// instead of being quietly dropped.
pub fn refusals(files: &[RouteFile]) -> Vec<String> {
    let mut out = Vec::new();
    for file in files {
        for refused in &file.module.config.refused {
            out.push(format!(
                "{}: `{refused}` is not a literal, so the route table cannot carry it — write \
                 `true`, `false` or (for `ssr`) \"data-only\"",
                file.file
            ));
        }
        if file.module.kind.is_none() {
            out.push(format!(
                "{}: exports no `Route`, so it declares nothing — write \
                 `export const Route = createFileRoute(\"{}\")({{…}})`, or rename it with a \
                 leading `-` to keep it out of the route tree",
                file.file,
                route_id(&file.name)
            ));
        }
        for legacy in &file.module.legacy {
            out.push(format!(
                "{}: `export const {legacy}` is no longer read — move it into the route's \
                 options, `createFileRoute(id)({{ {legacy}: … }})`",
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
                module: RouteModule::default(),
            })
            .collect()
    }

    /// Files that DECLARE options, since the emit now asks what was written.
    fn declaring(entries: &[(&str, &[&str])]) -> Vec<RouteFile> {
        entries
            .iter()
            .map(|(name, props)| RouteFile {
                file: format!("src/routes/{name}"),
                name: name_of(name),
                module: RouteModule {
                    props: props.iter().map(|prop| (*prop).to_owned()).collect(),
                    ..RouteModule::default()
                },
            })
            .collect()
    }

    fn ids(tree: &[RouteNode]) -> Vec<&str> {
        tree.iter().map(|node| node.id.as_str()).collect()
    }

    #[test]
    fn a_directory_separator_and_a_dot_name_the_same_route() {
        assert_eq!(ids(&build_tree(&files(&["users.$id.tsx"]))), ["/users/$id"]);
        assert_eq!(ids(&build_tree(&files(&["users/$id.tsx"]))), ["/users/$id"]);
    }

    #[test]
    fn flat_files_become_flat_routes() {
        let tree = build_tree(&files(&["index.tsx", "about.tsx", "users.$id.tsx"]));
        assert_eq!(ids(&tree), ["/", "/about", "/users/$id"]);
        // A root index names the root rather than `/index`.
        let root = tree.iter().find(|node| node.id == "/").expect("a root index");
        assert_eq!(root.path.as_deref(), Some("/"));
    }

    /// A BARE name is the layout, which is the convention change: `posts.tsx`
    /// parents `posts.*` with no `.route` suffix to ask for it
    /// (`routing-concepts.md:548`).
    #[test]
    fn a_bare_name_is_the_layout_its_siblings_nest_under() {
        let tree = build_tree(&files(&["users.tsx", "users.index.tsx", "users.$id.tsx"]));
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].path.as_deref(), Some("users"));
        let children: Vec<(&str, Option<&str>)> =
            tree[0].children.iter().map(|c| (c.id.as_str(), c.path.as_deref())).collect();
        assert_eq!(children, [("/users/", Some("")), ("/users/$id", Some("$id"))]);
    }

    /// `posts/route.tsx` and `posts.tsx` are the same route, which is what makes
    /// a directory a place to put a layout (`routing-concepts.md:412`).
    #[test]
    fn the_route_token_is_the_directory_form_of_the_same_layout() {
        let dotted = build_tree(&files(&["users.tsx", "users.$id.tsx"]));
        let nested = build_tree(&files(&["users/route.tsx", "users/$id.tsx"]));
        assert_eq!(ids(&dotted), ids(&nested));
        assert_eq!(dotted[0].path, nested[0].path);
        assert_eq!(nested[0].children[0].path.as_deref(), Some("$id"));
    }

    #[test]
    fn a_prefix_nobody_declares_stays_flat() {
        let tree = build_tree(&files(&["users.index.tsx", "users.$id.tsx"]));
        assert_eq!(tree.len(), 2);
        assert!(tree.iter().all(|node| node.children.is_empty()));
    }

    #[test]
    fn a_leading_underscore_is_a_pathless_layout() {
        let tree = build_tree(&files(&["_shell.tsx", "_shell.dashboard.tsx"]));
        assert!(tree[0].pathless);
        assert!(tree[0].path.is_none());
        assert_eq!(tree[0].children[0].path.as_deref(), Some("dashboard"));
    }

    /// `_layout/route.tsx` IS `_layout.tsx`, so the underscore to read is the one
    /// on the segment BEFORE the token (`getRouteNodes.ts:536-545`).
    #[test]
    fn the_directory_form_of_a_pathless_layout_is_also_pathless() {
        let tree = build_tree(&files(&["_shell/route.tsx", "_shell/dashboard.tsx"]));
        assert!(tree[0].pathless);
        assert!(tree[0].path.is_none());
    }

    #[test]
    fn nested_layouts_compose_and_a_child_path_is_relative() {
        let tree = build_tree(&files(&["users.tsx", "users.$id.tsx", "users.$id.edit.tsx"]));
        assert_eq!(tree[0].path.as_deref(), Some("users"));
        assert_eq!(tree[0].children[0].path.as_deref(), Some("$id"));
        assert_eq!(tree[0].children[0].children[0].path.as_deref(), Some("edit"));
    }

    /// The `_` SUFFIX un-nests, and it needs no rule of its own: `/posts_` is
    /// never registered, so the prefix walk finds no parent
    /// (`routing-concepts.md:535-548`).
    #[test]
    fn a_trailing_underscore_escapes_the_nesting_and_keeps_the_url() {
        let tree =
            build_tree(&files(&["posts.tsx", "posts.$postId.tsx", "posts_.$postId.edit.tsx"]));
        let nested: Vec<&str> = tree
            .iter()
            .find(|node| node.id == "/posts")
            .expect("the layout")
            .children
            .iter()
            .map(|child| child.id.as_str())
            .collect();
        assert_eq!(nested, ["/posts/$postId"]);

        // Top level, and the underscore is gone from the URL it contributes.
        let escaped = tree
            .iter()
            .find(|node| node.id == "/posts_/$postId/edit")
            .expect("the un-nested route");
        assert_eq!(escaped.path.as_deref(), Some("posts/$postId/edit"));
    }

    /// A route group organises FILES, not URLs (`routing-concepts.md`, and
    /// `possiblyNestedRouteGroupPatternRegex` at `utils.ts:845`).
    #[test]
    fn a_route_group_is_not_in_the_url() {
        let tree = build_tree(&files(&["(marketing)/about.tsx", "(marketing)/pricing.tsx"]));
        let paths: Vec<Option<&str>> = tree.iter().map(|node| node.path.as_deref()).collect();
        assert_eq!(paths, [Some("about"), Some("pricing")]);
    }

    /// `script[.]js.tsx` is `/script.js`: the bracket escapes a character that
    /// would otherwise separate (`SPLIT_REGEX`, `utils.ts:168`).
    #[test]
    fn brackets_escape_a_character_that_would_otherwise_route() {
        let tree = build_tree(&files(&["script[.]js.tsx", "api[.]v1.tsx"]));
        assert_eq!(ids(&tree), ["/api.v1", "/script.js"]);

        // And a token spelled in brackets is the WORD, not the token: `[index]`
        // is a route literally at `/index`.
        let literal = build_tree(&files(&["[index].tsx"]));
        assert_eq!(ids(&literal), ["/index"]);
    }

    /// `[_]` is a literal underscore, so the segment is NOT a pathless layout.
    #[test]
    fn an_escaped_underscore_is_a_path_segment() {
        let tree = build_tree(&files(&["[_]private.tsx"]));
        assert!(!tree[0].pathless);
        assert_eq!(tree[0].path.as_deref(), Some("_private"));
    }

    /// `__root.tsx` is the root, and everything is under it.
    #[test]
    fn the_root_file_is_the_root_and_parents_everything() {
        let tree = build_tree(&files(&["__root.tsx", "index.tsx", "about.tsx", "users.$id.tsx"]));
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].id, "__root__");
        assert_eq!(tree[0].path.as_deref(), Some("/"));
        let children: Vec<(&str, Option<&str>)> =
            tree[0].children.iter().map(|c| (c.id.as_str(), c.path.as_deref())).collect();
        assert_eq!(
            children,
            [("/", Some("")), ("/about", Some("about")), ("/users/$id", Some("users/$id"))]
        );
    }

    #[test]
    fn the_emitted_module_imports_nothing_eagerly_and_parses() {
        let tree = build_tree(&files(&[
            "index.tsx",
            "users.tsx",
            "users.index.tsx",
            "users.$id.tsx",
            "files.$.tsx",
        ]));
        let module = generate_module(&tree);
        // Two static imports and both are the runtime's — every route module is
        // reached through `import()`.
        assert_eq!(
            module.matches("\nimport ").count() + usize::from(module.starts_with("import ")),
            2,
            "{module}"
        );
        assert!(module.contains("import { lazy } from \"@barqjs/core\";"), "{module}");
        // NEVER `@barqjs/router/server`: this module is imported by the browser
        // and the server entry reaches `node:async_hooks`.
        assert!(module.contains("import { Outlet } from \"@barqjs/router\";"), "{module}");
        assert!(!module.contains("@barqjs/router/server"), "{module}");

        assert!(module.contains("lazy(() => import(\"/src/routes/users.$id.tsx\")"), "{module}");

        // The SOURCE path rides beside the lazy component. Nothing at runtime
        // can recover it — `lazy()` keeps the specifier inside its closure —
        // and a bundler manifest is keyed by exactly this string, so
        // modulepreload and the route-action manifest both start here.
        assert!(module.contains("src: \"/src/routes/users.$id.tsx\""));
        // A layout gets one too, so a chain can be walked whole.
        assert!(module.contains("src: \"/src/routes/users.tsx\""));

        // A generated module nothing parses is how `export const default =` — a
        // syntax error — shipped in the client stubs. Parse it for real.
        let allocator = oxc::allocator::Allocator::new();
        let parsed =
            oxc::parser::Parser::new(&allocator, &module, oxc::span::SourceType::mjs()).parse();
        assert!(parsed.diagnostics.is_empty(), "{module}\n{:?}", parsed.diagnostics);
    }

    /// Every picker reaches through `Route.options`, because a route module has
    /// ONE export and it is called `Route`.
    #[test]
    fn every_picker_reads_the_route_export() {
        let module = generate_module(&build_tree(&declaring(&[
            ("__root.tsx", &["shellComponent"]),
            ("about.tsx", &["component", "pendingComponent"]),
        ])));
        assert!(module.contains("const optionsOf = (module) => module.Route?.options ?? {};"));
        assert!(module.contains("optionsOf(m).component ?? Outlet"), "{module}");
        assert!(module.contains("optionsOf(m).pendingComponent ?? Empty"), "{module}");
        assert!(module.contains("optionsOf(m).shellComponent ?? Empty"), "{module}");
        assert!(module.contains("const { loader } = optionsOf(await load());"), "{module}");
        assert!(module.contains("const declared = optionsOf(await load())[pick];"), "{module}");

        // The old spellings are gone, not merely unused.
        assert!(!module.contains("m.Pending"), "{module}");
        assert!(!module.contains("m.shellComponent"), "{module}");
        assert!(!module.contains("pending: lazy("), "{module}");
    }

    /// A route that declares no component renders its CHILD, not nothing —
    /// `route.options.component ?? defaultComponent` falling through to
    /// `<Outlet />` (`react-router/src/Match.tsx:211-212`). With `Empty` there, a
    /// layout that declares only a loader would swallow its whole subtree.
    #[test]
    fn a_route_without_a_component_falls_through_to_its_child() {
        let module = generate_module(&build_tree(&files(&["users.tsx", "users.$id.tsx"])));
        assert_eq!(module.matches("optionsOf(m).component ?? Outlet").count(), 2, "{module}");
        assert!(!module.contains("component: lazy(() => import(\"/src/routes/users.tsx\"))"));
    }

    #[test]
    fn head_and_scripts_are_reached_without_loading_the_module() {
        // Both are wanted before the shell and the route module is `lazy()`, so
        // they go through the same wrapper `loader` does. `lazyAsset` accepts a
        // function OR a plain object, which is what lets a static head be an
        // ordinary property of the options.
        let module = generate_module(&build_tree(&files(&["index.tsx", "about.tsx"])));
        assert!(
            module.contains("const lazyAsset = (load, pick) => async (context) => {"),
            "{module}"
        );
        assert_eq!(module.matches("head: lazyAsset(() => import(").count(), 2, "{module}");
        assert_eq!(module.matches("scripts: lazyAsset(() => import(").count(), 2, "{module}");
        assert!(
            module.contains("typeof declared === \"function\" ? declared(context) : declared"),
            "{module}"
        );
    }

    #[test]
    fn only_a_root_route_declares_the_document() {
        // `shellComponent` renders `<html>` around everything, so a nested route
        // declaring one would be a second document inside the first.
        let flat = generate_module(&build_tree(&declaring(&[
            ("index.tsx", &["shellComponent"]),
            ("about.tsx", &["shellComponent"]),
        ])));
        assert_eq!(flat.matches("shellComponent: lazy(").count(), 0, "{flat}");
        let rooted = generate_module(&build_tree(&declaring(&[
            ("__root.tsx", &["shellComponent"]),
            ("index.tsx", &[]),
        ])));
        assert_eq!(rooted.matches("shellComponent: lazy(").count(), 1, "{rooted}");
    }

    /// A picker for an option the route did not write is not harmless.
    ///
    /// The router reads an absent `pendingComponent` as "this boundary shows
    /// nothing"; a `lazy()` resolving to an empty component is a DIFFERENT
    /// answer, because a cold `lazy()` throws `NotReadyError` and parks the
    /// loading boundary onto exactly that fallback. Emitting it unconditionally
    /// rendered the whole reference application as an empty `<div id="app">`.
    #[test]
    fn an_option_the_route_did_not_declare_gets_no_picker() {
        let bare = generate_module(&build_tree(&declaring(&[("about.tsx", &["component"])])));
        assert!(!bare.contains("pendingComponent:"), "{bare}");
        assert!(!bare.contains("shellComponent:"), "{bare}");

        let declared = generate_module(&build_tree(&declaring(&[(
            "about.tsx",
            &["component", "pendingComponent"],
        )])));
        assert!(declared.contains("pendingComponent:"), "{declared}");
    }

    #[test]
    fn middleware_is_a_thunk_because_it_is_compared_by_identity() {
        // `ssr` and `prerender` are lifted as LITERALS; `middleware` cannot be —
        // it is an anonymous closure the build compares with `===`, so it goes
        // through the same lazy import `loader` uses.
        let module = generate_module(&build_tree(&files(&["index.tsx", "about.tsx"])));
        assert!(
            module.contains(
                "const lazyMiddleware = (load) => async () => optionsOf(await load()).middleware;"
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
        let tree = build_tree(&files(&["index.tsx", "users.tsx", "users.$id.tsx", "files.$.tsx"]));
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
            "\"/users\": { search: SearchOf<typeof import(\"../src/routes/users.tsx\")>"
        ));
        assert!(data.contains(
            "\"/users/$id\": { search: SearchOf<typeof import(\"../src/routes/users.$id.tsx\")>"
        ));

        // Every lookup goes through `Route`'s options, since that is the module's
        // one export.
        assert!(types.contains(
            "type OptionsOf<M> = M extends { Route: { options: infer O } } ? O : never;"
        ));
        assert!(types.contains("type DataOf<M> = OptionsOf<M> extends { loader: infer L }"));
        assert!(
            types.contains("type SearchOf<M> = OptionsOf<M> extends { validateSearch: infer V }")
        );

        // Every arm fails CLOSED: an unreadable validator or loader shape
        // resolves to `never`, not to a permissive record. A wrong type that
        // admits anything is worse than no type.
        assert!(types.contains(": never;"));
        assert!(types.contains("Record<string, unknown>"));
    }

    #[test]
    fn entries_map_every_route_id_to_its_file_including_layouts() {
        let tree =
            build_tree(&files(&["index.tsx", "users.tsx", "users.index.tsx", "users.$id.tsx"]));
        let map = entries(&tree);
        assert!(map.contains(&("/users/$id".to_string(), "src/routes/users.$id.tsx".to_string())));
        // The LAYOUT is here even though it is not addressable on its own: a
        // modulepreload set is the whole chain.
        assert!(map.contains(&("/users".to_string(), "src/routes/users.tsx".to_string())));
    }

    #[test]
    fn patterns_are_what_barq013_checks_against() {
        let tree =
            build_tree(&files(&["index.tsx", "users.tsx", "users.index.tsx", "users.$id.tsx"]));
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

    /// A `-` prefix takes a file OR A DIRECTORY out of the tree, which is what
    /// makes a route directory a place to colocate its own parts
    /// (`getRouteNodes.ts:70-74`).
    #[test]
    fn a_dash_prefix_is_not_a_route_and_hides_a_whole_directory() {
        let base = std::env::temp_dir().join("barq-routes-ignore-prefix");
        let routes = base.join("routes");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(routes.join("-components")).expect("a scratch directory");
        for (path, body) in [
            ("posts.tsx", "export const Route = createFileRoute('/posts')({});"),
            ("-posts-table.tsx", "export const PostsTable = () => null;"),
            ("-components/header.tsx", "export const Header = () => null;"),
        ] {
            std::fs::write(routes.join(path), body).expect("a scratch file");
        }

        let found: Vec<String> = scan(&base, "routes").into_iter().map(|file| file.name).collect();
        assert_eq!(found, ["posts"]);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// The scan reads what the module DECLARES, and the table carries it.
    #[test]
    fn the_emitted_table_carries_what_the_route_declared() {
        let base = std::env::temp_dir().join("barq-routes-declarations");
        let routes = base.join("routes");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&routes).expect("a scratch directory");
        std::fs::write(
            routes.join("about.tsx"),
            "export const Route = createFileRoute('/about')({ ssr: false, prerender: true });",
        )
        .expect("a scratch file");
        std::fs::write(
            routes.join("live.tsx"),
            "export const Route = createFileRoute('/live')({ component: Live });",
        )
        .expect("a scratch file");

        let files = scan(&base, "routes");
        let module = generate_module(&build_tree(&files));
        assert!(module.contains("ssr: false"), "{module}");
        assert!(module.contains("prerender: true"), "{module}");
        // A route that declares nothing emits nothing, so the runtime default
        // stays the runtime's to decide.
        let live = module.lines().find(|line| line.contains("/live")).unwrap_or_default();
        assert!(!live.contains("ssr:"), "{live}");
        assert!(!live.contains("prerender:"), "{live}");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// The OLD spelling is reported, not honoured. A half-migrated file that
    /// silently lost its `ssr: false` is exactly the failure this channel exists
    /// to prevent.
    #[test]
    fn a_top_level_export_is_reported_rather_than_read() {
        let base = std::env::temp_dir().join("barq-routes-legacy-export");
        let routes = base.join("routes");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&routes).expect("a scratch directory");
        std::fs::write(
            routes.join("admin.tsx"),
            "export const ssr = false;\nexport const Route = createFileRoute('/admin')({});",
        )
        .expect("a scratch file");

        let files = scan(&base, "routes");
        let reported = refusals(&files);
        assert_eq!(reported.len(), 1, "{reported:?}");
        assert!(reported[0].contains("`export const ssr` is no longer read"), "{reported:?}");

        let module = generate_module(&build_tree(&files));
        assert!(!module.contains("ssr:"), "{module}");
        let _ = std::fs::remove_dir_all(&base);
    }
}
