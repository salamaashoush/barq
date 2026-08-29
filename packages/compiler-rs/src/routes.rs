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

/// `routeTree.gen.ts` — the route table AND the route types, in one real module.
///
/// THE ROUTE MODULES ARE IMPORTED STATICALLY, and that is the whole design.
/// The table this emits carries `...Route.options`, so every option a route
/// declares reaches the router: `validateSearch` (`router.ts:531`),
/// `loaderDeps` (`:575`), `beforeLoad`/`context` (`:915`), `staleTime`,
/// `gcTime`, `shouldReload`, `pendingMs` and `errorComponent`/
/// `notFoundComponent` (`errors.ts:86-87`) are ALL read synchronously off
/// `route.definition`, and the previous emit — one `lazy()` per option — could
/// not answer synchronously, so it emitted nine options and dropped the rest on
/// the floor. A file route accepted the whole surface and honoured a third of
/// it.
///
/// Code splitting is not lost by this; it MOVES, to where TanStack puts it. The
/// components come out of the route module into a chunk of their own at compile
/// time (`router-plugin/src/core/constants.ts:4-16`, whose default groupings
/// are `component`, `errorComponent`, `notFoundComponent` — note `loader` is
/// splittable there and deliberately not in the default set).
///
/// `out_dir` is the directory the file will be written to, project-relative,
/// and the import specifiers are relative to it. That is not cosmetic: a
/// root-absolute `import("/src/routes/x.tsx")` is the FILESYSTEM root to
/// TypeScript and silently resolves to `any`, which is how every generated type
/// became permissive once already. `src:` stays root-absolute — it is a
/// bundler manifest key, not an import.
pub fn generate_route_tree(tree: &[RouteNode], out_dir: &str) -> String {
    let names = variable_names(tree);

    let mut out = String::from(
        "// Generated by @barqjs/router. Do not edit.\n\
         //\n\
         // The route table and the route types, in one module the application imports by\n\
         // PATH — TanStack Start's `routeTree.gen.ts` arrangement, and for their reason:\n\
         // a generated file that a project can open, typecheck and read is worth more\n\
         // than a virtual specifier only the bundler can resolve.\n\
         //\n\
         // Every route module is imported STATICALLY, so `...Route.options` carries the\n\
         // whole option set. The components are split out of the route module by the\n\
         // compiler, not by this table.\n\n",
    );
    // `Outlet` is a VALUE and is imported only where a route needs one — a
    // route that declares no component renders its child. An unconditional
    // import would be an unused binding in the common case, which every linter
    // a project points at its own source would then report against a generated
    // file. NEVER `@barqjs/router/server`: this file is imported by the browser
    // and the server entry reaches `node:async_hooks`.
    let needs_outlet = any_node(tree, &|node| node.file.is_some() && !declares(node, "component"));
    if needs_outlet {
        out.push_str("import { Outlet } from \"@barqjs/router\";\n");
    }
    out.push_str("import type { AnyRouteDefinition } from \"@barqjs/router\";\n\n");

    for (id, name) in &names {
        let Some(file) = file_of(tree, id) else { continue };
        out.push_str(&format!(
            "import {{ Route as {name} }} from {};\n",
            json_string(&import_specifier(out_dir, &file)),
        ));
    }

    out.push_str(
        "\n/**\n * The table, exactly the shape `createRouter` and `createPageHandler` take.\n",
    );
    out.push_str(
        " *\n * `...Route.options` FIRST, so the generator's `id`, `path` and `src` win over\n",
    );
    out.push_str(" * anything a route module happens to spell for itself — the filename is what\n");
    out.push_str(
        " * decides those, and a route that disagrees is already refused by the id check.\n */\n",
    );
    out.push_str("export const routeTree: AnyRouteDefinition[] = [\n");
    for (index, node) in tree.iter().enumerate() {
        emit_node(&mut out, node, 1, &names);
        if index + 1 < tree.len() {
            out.push(',');
        }
        out.push('\n');
    }
    out.push_str("];\n\nexport default routeTree;\n\n");

    emit_types(&mut out, tree, &names);
    out
}

/// Whether any node in the tree satisfies a predicate.
fn any_node(tree: &[RouteNode], predicate: &dyn Fn(&RouteNode) -> bool) -> bool {
    fn walk(node: &RouteNode, predicate: &dyn Fn(&RouteNode) -> bool) -> bool {
        predicate(node) || node.children.iter().any(|child| walk(child, predicate))
    }
    tree.iter().any(|node| walk(node, predicate))
}

/// The file of a node, by id.
fn file_of(tree: &[RouteNode], id: &str) -> Option<String> {
    fn walk(node: &RouteNode, id: &str) -> Option<String> {
        if node.id == id {
            return node.file.clone();
        }
        node.children.iter().find_map(|child| walk(child, id))
    }
    tree.iter().find_map(|node| walk(node, id))
}

/// Route id -> the identifier the generated file imports it as, in emit order.
///
/// A `Vec` rather than a map so the import block is deterministic, which is what
/// keeps `writeOnChange` from rewriting a file that did not change.
fn variable_names(tree: &[RouteNode]) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut taken: Vec<String> = Vec::new();
    fn walk(node: &RouteNode, out: &mut Vec<(String, String)>, taken: &mut Vec<String>) {
        if node.file.is_some() {
            let base = variable_name(&node.id);
            // Two ids CAN derive one identifier — `/a-b` and `/a/b` both lose
            // their separator — so the second takes a suffix. Theirs collides
            // silently; the file would not compile, so this is a divergence in
            // barq's favour and is cheap.
            let mut name = base.clone();
            let mut nth = 1;
            while taken.iter().any(|used| used == &name) {
                nth += 1;
                name = format!("{base}{nth}");
            }
            taken.push(name.clone());
            out.push((node.id.clone(), name));
        }
        for child in &node.children {
            walk(child, out, taken);
        }
    }
    for node in tree {
        walk(node, &mut out, &mut taken);
    }
    out
}

/// The identifier for one route id.
///
/// Ported from `routePathToVariable` (`router-generator/src/utils.ts:490-511`)
/// including its character table, with the INDEX case made explicit: theirs
/// derives the name from the file path so `/` happens to become `Index`, and
/// barq derives it from the id, where `/` is the empty string. Spelling the
/// index out is what keeps `/` and `/posts/` from both collapsing to nothing.
fn variable_name(id: &str) -> String {
    if id == ROOT_ID {
        return "rootRoute".to_owned();
    }
    // An index id ends in `/` — `/` itself, or `/posts/`. Name it.
    let spelled = if id.ends_with('/') { format!("{id}{INDEX_TOKEN}") } else { id.to_owned() };
    let cleaned = remove_underscores(&spelled);
    // `/$/` is a splat between segments, a trailing `$` is a trailing splat,
    // and every other `$` is a param sigil that contributes no text.
    let cleaned = cleaned.replace("/$/", "/splat/");
    let cleaned = if cleaned.ends_with('$') {
        format!("{}splat", &cleaned[..cleaned.len() - 1])
    } else {
        cleaned
    };
    let cleaned = cleaned.replace('$', "");

    let mut result = String::new();
    for (index, part) in cleaned.split(['/', '-']).enumerate() {
        let segment = if index > 0 { capitalize(part) } else { part.to_owned() };
        for character in segment.chars() {
            result.push_str(&variable_safe_char(character));
        }
    }
    let result = capitalize(&result);
    // An identifier cannot start with a digit.
    let result = if result.starts_with(|c: char| c.is_ascii_digit()) {
        format!("R{result}")
    } else {
        result
    };
    format!("{result}Route")
}

/// `^_`, `_$`, `/_` and `_/` all go (`utils.ts:515-521`).
fn remove_underscores(value: &str) -> String {
    let trimmed = value.strip_prefix('_').unwrap_or(value);
    let trimmed = trimmed.strip_suffix('_').unwrap_or(trimmed);
    trimmed.replace("/_", "/").replace("_/", "/")
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// `toVariableSafeChar` (`utils.ts:465-488`), character for character.
fn variable_safe_char(character: char) -> String {
    if character.is_ascii_alphanumeric() || character == '_' {
        return character.to_string();
    }
    match character {
        '.' => "Dot".to_owned(),
        '-' => "Dash".to_owned(),
        '@' => "At".to_owned(),
        '(' | ')' | ' ' => String::new(),
        other => format!("Char{}", other as u32),
    }
}

/// The import specifier for a route file, relative to the generated file.
///
/// The COMMON PREFIX is cut first, so a tree written to `src/routeTree.gen.ts`
/// imports `./routes/about` rather than the `../src/routes/about` that walking
/// blindly up and back down produces. Both resolve; only one is readable, and
/// this file is meant to be opened.
fn import_specifier(out_dir: &str, file: &str) -> String {
    let from: Vec<&str> = out_dir.split('/').filter(|part| !part.is_empty()).collect();
    let to: Vec<&str> = file.split('/').filter(|part| !part.is_empty()).collect();
    let shared = from
        .iter()
        .zip(to.iter())
        // Never the LAST element of `to`: it is the filename, not a directory.
        .take(to.len().saturating_sub(1))
        .take_while(|(left, right)| left == right)
        .count();

    let mut out = String::new();
    for _ in shared..from.len() {
        out.push_str("../");
    }
    if out.is_empty() {
        out.push_str("./");
    }
    out.push_str(&to[shared..].join("/"));
    // Extension-less, as theirs is (`addExtensions` defaults to false,
    // `router-generator/src/config.ts:52-60`): a `.tsx` in an import needs
    // `allowImportingTsExtensions`, which a project is not obliged to set.
    for extension in EXTENSIONS {
        if let Some(stripped) = out.strip_suffix(extension) {
            return stripped.to_owned();
        }
    }
    out
}

fn declares(node: &RouteNode, option: &str) -> bool {
    node.declared.iter().any(|declared| declared == option)
}

fn emit_node(out: &mut String, node: &RouteNode, depth: usize, names: &[(String, String)]) {
    let pad = "  ".repeat(depth);
    out.push_str(&pad);
    out.push_str("{ ");
    let mut parts: Vec<String> = Vec::new();
    if let Some(file) = &node.file {
        let name = names
            .iter()
            .find(|(id, _)| id == &node.id)
            .map_or_else(|| variable_name(&node.id), |(_, name)| name.clone());
        // FIRST, so the generator's own keys below override anything the module
        // spells for itself.
        parts.push(format!("...{name}.options"));
        parts.push(format!("id: {}", json_string(&node.id)));
        if let Some(path) = &node.path {
            parts.push(format!("path: {}", json_string(path)));
        } else {
            // A pathless layout contributes no segment, and a module that
            // declared a `path` must not reintroduce one through the spread.
            parts.push("path: undefined".to_owned());
        }
        // The SOURCE path, root-absolute, because nothing at runtime can recover
        // it and a bundler manifest is keyed by exactly this string. It is what
        // maps a route to its chunk for `<link rel="modulepreload">` and what
        // the route-action manifest walks the module graph from.
        parts.push(format!("src: {}", json_string(&format!("/{file}"))));
        // A route that declares no component renders its child, not nothing —
        // `route.options.component ?? defaultComponent` falling through to
        // `<Outlet />` in theirs (`react-router/src/Match.tsx:211-212`). A layout
        // that declares only a loader would otherwise swallow its whole subtree.
        if !declares(node, "component") {
            // `as never` at the ABI seam, for the reason `RouteComponent`'s own
            // header gives: the real calling convention is `(scope, props)` and
            // the type is declared PROPS-FIRST so an authored component
            // typechecks the way it is written. The router casts at every one of
            // its own call sites; this is the generator's.
            //
            // It first fired when an API route landed — `/api/health` declares
            // handlers and no component, which no route in the project had done
            // before, so the fallback had never been typechecked.
            parts.push("component: Outlet as never".to_owned());
        }
        // LIFTED, not read off the module: both are wanted before anything runs
        // — the prerenderer decides whether a page is a file on a CDN, and the
        // server decides what to render, both with no route module loaded. They
        // are literals in the source and literals here.
        if let Some(ssr) = &node.config.ssr {
            parts.push(format!("ssr: {ssr}"));
        }
        if let Some(prerender) = node.config.prerender {
            parts.push(format!("prerender: {prerender}"));
        }
    } else {
        parts.push(format!("id: {}", json_string(&node.id)));
        if let Some(path) = &node.path {
            parts.push(format!("path: {}", json_string(path)));
        }
    }
    out.push_str(&parts.join(", "));
    if !node.children.is_empty() {
        out.push_str(", children: [\n");
        for (index, child) in node.children.iter().enumerate() {
            emit_node(out, child, depth + 1, names);
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

/// The types, in the SAME file as the table.
///
/// A separate `.d.ts` declaring `virtual:barq-routes` was the old arrangement
/// and it had one fatal property: nothing consumed it. `RouteMap`, `RoutePath`,
/// `SearchFor` and `DataFor` were emitted for twelve routes and referenced by
/// no file in the repository, because `LinkProps.to` was `string` and the hooks
/// took their types from `createFileRoute`'s own generics. What makes a
/// generated type load-bearing is the REGISTRATION below: `@barqjs/router`
/// declares an empty `Register`, this augments it, and `to`, `useParams` and
/// `useSearch` read it. That is TanStack's mechanism
/// (`routeTree.gen.ts:238`, `interface FileRoutesByPath`).
///
/// The lookups are `typeof <the imported Route>`, which is why the static
/// import buys type safety a lazy table cannot: `Data`, `Params` and the
/// validated search are INFERRED from the module, not reconstructed from a
/// `typeof import(...)` that had to fail closed on everything it could not
/// prove.
fn emit_types(out: &mut String, tree: &[RouteNode], names: &[(String, String)]) {
    out.push_str("export interface FileRoutesById {\n");
    for (id, name) in names {
        out.push_str(&format!("  {}: typeof {name};\n", json_string(id)));
    }
    out.push_str("}\n\n");

    let mut patterns = Vec::new();
    for node in tree {
        collect_patterns(node, "", &mut patterns);
    }

    out.push_str("export interface FileRouteTypes {\n");
    out.push_str(
        "  /** Every route id, layouts included — what `useMatch` and `Link`'s `to` address. */\n",
    );
    out.push_str("  id: ");
    out.push_str(&union_of(names.iter().map(|(id, _)| id.as_str())));
    out.push_str(";\n");
    out.push_str(
        "  /** Every ADDRESSABLE pattern — a leaf, since a layout is reached through one. */\n",
    );
    out.push_str("  fullPaths: ");
    out.push_str(&union_of(patterns.iter().map(String::as_str)));
    out.push_str(";\n");
    out.push_str("  fileRoutesById: FileRoutesById;\n");
    out.push_str("}\n\n");

    out.push_str("declare module \"@barqjs/router\" {\n");
    out.push_str("  interface Register {\n");
    out.push_str("    routeTree: FileRouteTypes;\n");
    out.push_str("  }\n}\n");
}

/// A string-literal union, or `never` when there is nothing to union.
fn union_of<'a>(values: impl Iterator<Item = &'a str>) -> String {
    let mut seen: Vec<String> = Vec::new();
    for value in values {
        let quoted = json_string(value);
        if !seen.iter().any(|existing| existing == &quoted) {
            seen.push(quoted);
        }
    }
    if seen.is_empty() { "never".to_owned() } else { seen.join(" | ") }
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

    /// The route modules are imported STATICALLY, and that is what carries the
    /// whole option set.
    ///
    /// The previous emit was one `lazy()` per option and could only carry an
    /// option a `lazy()` can answer for. Every option the router reads
    /// SYNCHRONOUSLY — `validateSearch` (`router.ts:531`), `loaderDeps`
    /// (`:575`), `beforeLoad` (`:915`), `staleTime` (`:775`), `shouldReload`
    /// (`:764`), `errorComponent` (`errors.ts:86`) — was therefore dropped on
    /// the floor, silently, for every file-based route in the project.
    #[test]
    fn every_route_module_is_imported_statically_and_spread_whole() {
        let tree = build_tree(&files(&[
            "index.tsx",
            "users.tsx",
            "users.index.tsx",
            "users.$id.tsx",
            "files.$.tsx",
        ]));
        let source = generate_route_tree(&tree, "src");

        assert!(
            source.contains("import { Route as UsersIdRoute } from \"./routes/users.$id\";"),
            "{source}"
        );
        // The spread is what carries `validateSearch`, `beforeLoad`,
        // `errorComponent` and the cache options through.
        assert!(source.contains("...UsersIdRoute.options"), "{source}");
        // And nothing is reached through a dynamic import any more.
        assert!(!source.contains("lazy("), "{source}");
        assert!(!source.contains("import("), "{source}");
        assert!(!source.contains("lazyLoader"), "{source}");
        assert!(!source.contains("lazyAsset"), "{source}");

        // A generated module nothing parses is how `export const default =` — a
        // syntax error — shipped in the client stubs once. Parse it for real.
        let allocator = oxc::allocator::Allocator::new();
        let parsed = oxc::parser::Parser::new(
            &allocator,
            &source,
            crate::compile::source_type_for(Some("routeTree.gen.ts")),
        )
        .parse();
        assert!(parsed.diagnostics.is_empty(), "{source}\n{:?}", parsed.diagnostics);
    }

    /// The generator owns `id`, `path` and `src`, so they are written AFTER the
    /// spread — a route module that spells a `path` for itself must not win over
    /// the one its filename derives.
    #[test]
    fn the_generators_own_keys_override_the_spread() {
        let source = generate_route_tree(&build_tree(&files(&["users.$id.tsx"])), "src");
        let spread = source.find("...UsersIdRoute.options").expect("the spread");
        let id = source.find("id: \"/users/$id\"").expect("the id");
        let path = source.find("path: \"users/$id\"").expect("the path");
        assert!(spread < id && spread < path, "{source}");
        // The SOURCE path stays ROOT-ABSOLUTE: it is a bundler manifest key that
        // `<link rel="modulepreload">` and the route-action manifest look up, not
        // an import specifier.
        assert!(source.contains("src: \"/src/routes/users.$id.tsx\""), "{source}");
    }

    /// A route that declares no component renders its CHILD, not nothing —
    /// `route.options.component ?? defaultComponent` falling through to
    /// `<Outlet />` (`react-router/src/Match.tsx:211-212`). With the spread this
    /// is a default rather than a picker, so it is written only where the module
    /// did not write one itself.
    #[test]
    fn a_route_without_a_component_falls_through_to_its_child() {
        let source = generate_route_tree(
            &build_tree(&declaring(&[("users.tsx", &[]), ("users.$id.tsx", &["component"])])),
            "src",
        );
        assert_eq!(source.matches("component: Outlet as never").count(), 1, "{source}");
        // …and it is IMPORTED. A generated file that referenced a free
        // identifier would not run, and the emit did exactly that until this
        // test was written.
        assert!(source.contains("import { Outlet } from \"@barqjs/router\";"), "{source}");
        // NEVER the server entry: this file is imported by the browser and
        // `@barqjs/router/server` reaches `node:async_hooks`.
        assert!(!source.contains("@barqjs/router/server"), "{source}");

        // A table where every route brings its own component imports nothing at
        // runtime at all — the only import left is the erased type.
        let all_declared = generate_route_tree(
            &build_tree(&declaring(&[
                ("users.tsx", &["component"]),
                ("about.tsx", &["component"]),
            ])),
            "src",
        );
        assert!(!all_declared.contains("import { Outlet }"), "{all_declared}");
    }

    /// A pathless layout contributes no segment, and the spread must not
    /// reintroduce one.
    #[test]
    fn a_pathless_layout_has_its_path_cleared_over_the_spread() {
        let source =
            generate_route_tree(&build_tree(&files(&["_app.tsx", "_app.home.tsx"])), "src");
        assert!(source.contains("path: undefined"), "{source}");
    }

    /// `ssr` and `prerender` are still LIFTED rather than read off the module.
    ///
    /// Both are wanted with nothing loaded — the prerenderer decides whether a
    /// page is a file on a CDN and the server decides what to render, and the
    /// spread cannot answer either before the module is evaluated on the side
    /// that is asking.
    #[test]
    fn ssr_and_prerender_are_lifted_as_literals() {
        let mut file = RouteFile {
            file: "src/routes/about.tsx".to_owned(),
            name: "about".to_owned(),
            module: RouteModule::default(),
        };
        file.module.config.ssr = Some("false".to_owned());
        file.module.config.prerender = Some(true);
        let source = generate_route_tree(&build_tree(&[file]), "src");
        assert!(source.contains("ssr: false"), "{source}");
        assert!(source.contains("prerender: true"), "{source}");
    }

    /// The identifier is `routePathToVariable` (`utils.ts:490-511`), ported
    /// character for character, with the INDEX case spelled out.
    #[test]
    fn identifiers_are_derived_the_way_theirs_are() {
        assert_eq!(variable_name("__root__"), "rootRoute");
        assert_eq!(variable_name("/"), "IndexRoute");
        assert_eq!(variable_name("/posts/"), "PostsIndexRoute");
        assert_eq!(variable_name("/posts/$postId"), "PostsPostIdRoute");
        // `.` is not a separator, so it becomes the WORD — their
        // `CustomScriptDotjsRouteImport`, from `customScript[.]js.tsx`.
        assert_eq!(variable_name("/customScript.js"), "CustomScriptDotjsRoute");
        // A pathless layout loses its underscore.
        assert_eq!(variable_name("/_pathlessLayout"), "PathlessLayoutRoute");
        // The `_` SUFFIX that un-nests goes the same way.
        assert_eq!(variable_name("/posts_/$postId/deep"), "PostsPostIdDeepRoute");
        // A splat is a word, not a sigil.
        assert_eq!(variable_name("/files/$"), "FilesSplatRoute");
    }

    /// Two ids CAN derive one identifier, and a file that declares the same
    /// `const` twice does not compile. Theirs collides silently.
    #[test]
    fn a_colliding_identifier_takes_a_suffix() {
        let source = generate_route_tree(&build_tree(&files(&["a-b.tsx", "a.b.tsx"])), "src");
        assert!(source.contains("Route as ABRoute"), "{source}");
        assert!(source.contains("Route as ABRoute2"), "{source}");
    }

    /// An import specifier is relative to the file's OWN directory.
    ///
    /// A leading `/` is the FILESYSTEM root to TypeScript, so a root-absolute
    /// specifier silently resolved to `any` and made every generated type
    /// permissive — with the `@ts-expect-error`s in the check file going unused,
    /// which is how it was caught.
    #[test]
    fn an_import_specifier_is_relative_to_where_the_file_is_written() {
        let tree = build_tree(&files(&["users.$id.tsx"]));
        // At the project root, down into `src`.
        assert!(generate_route_tree(&tree, "").contains("from \"./src/routes/users.$id\""));
        // Written INSIDE `src`, the shared prefix is cut rather than walked.
        assert!(generate_route_tree(&tree, "src").contains("from \"./routes/users.$id\""));
        // Written deeper than the routes, back up and across.
        assert!(generate_route_tree(&tree, "src/app").contains("from \"../routes/users.$id\""));
        // And out of the tree entirely.
        assert!(
            generate_route_tree(&tree, "generated").contains("from \"../src/routes/users.$id\"")
        );
    }

    /// The types live in the SAME file, and they are REGISTERED.
    ///
    /// The old `.d.ts` emitted `RouteMap`, `RoutePath`, `SearchFor` and `DataFor`
    /// for every route and nothing in the repository referenced any of them —
    /// `LinkProps.to` was `string`. What makes a generated type load-bearing is
    /// the augmentation: `@barqjs/router` declares an empty `Register` and this
    /// fills it in, which is TanStack's mechanism (`routeTree.gen.ts:238`).
    #[test]
    fn the_types_register_themselves_with_the_router() {
        let tree = build_tree(&files(&["index.tsx", "users.tsx", "users.$id.tsx", "files.$.tsx"]));
        let source = generate_route_tree(&tree, "src");

        assert!(source.contains("declare module \"@barqjs/router\" {"), "{source}");
        assert!(source.contains("interface Register {"), "{source}");
        assert!(source.contains("routeTree: FileRouteTypes;"), "{source}");

        // Keyed by every route WITH a module, layouts included: a layout has a
        // loader and a search of its own, and typing only the leaves left them
        // out of exactly the nested chains the feature exists to serve.
        assert!(source.contains("\"/users\": typeof UsersRoute;"), "{source}");
        assert!(source.contains("\"/users/$id\": typeof UsersIdRoute;"), "{source}");

        // `fullPaths` is the ADDRESSABLE set — a leaf, since a layout is reached
        // through one — and it is what `<Link to>` accepts.
        let (_, tail) = source.split_once("fullPaths: ").expect("a fullPaths union");
        let union = tail.split_once(";\n").expect("a terminated union").0;
        assert!(union.contains("\"/users/$id\""), "{union}");
        assert!(!union.contains("\"/users\""), "{union}");
    }

    /// Nothing is registered when there are no routes, and it still parses.
    #[test]
    fn an_empty_tree_still_emits_a_file_that_compiles() {
        let source = generate_route_tree(&[], "src");
        assert!(
            source.contains("export const routeTree: AnyRouteDefinition[] = [\n];"),
            "{source}"
        );
        assert!(source.contains("id: never;"), "{source}");
        assert!(source.contains("fullPaths: never;"), "{source}");
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
        let module = generate_route_tree(&build_tree(&files), "src");
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

        let module = generate_route_tree(&build_tree(&files), "src");
        assert!(!module.contains("ssr:"), "{module}");
        let _ = std::fs::remove_dir_all(&base);
    }
}
