pub mod backend;
pub mod dom;
mod fallback;
mod install;
pub mod interp;
pub mod mappings;
mod prune;
pub mod ssr;
pub mod universal;

pub use backend::{At, Backend};

use oxc::allocator::{Allocator, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, CallExpression,
    Expression, FormalParameter, FormalParameterKind, FormalParameters, IdentifierName, Program,
    Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{walk_arrow_function_expression, walk_expression, walk_statements};
use oxc::span::{GetSpan, Span};

use crate::ir::{Module, NONE, Ns, Prim, Root, Site, SourceKind, TemplateId, Unit, UnitId};
use crate::options::{Opt, ResolvedOptions};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Target {
    #[default]
    Dom,
    Ssr,
    /// Serialises the analysed IR beside the module and
    /// lets `@barqjs/web/interp` walk it, instead of printing the walk and the
    /// patch program as JavaScript. It runs the DOM backend's passes and reads
    /// the DOM backend's artefacts — the anchors, the template bytes, the ref
    /// plan — because "the compiler knows more than the reference" has to be
    /// structurally impossible, not merely unintended.
    Interp,
    /// A custom renderer made with `createRenderer`, imported from the module
    /// source. No template and no walk: every node is created and inserted by
    /// a call, and every attribute and event is one `setProp`.
    Universal,
}

impl Target {
    pub fn of(options: &ResolvedOptions) -> Self {
        if options.target == crate::options::RenderTarget::Universal {
            return Self::Universal;
        }
        match (options.interp, options.ssr) {
            (true, _) => Self::Interp,
            (false, true) => Self::Ssr,
            (false, false) => Self::Dom,
        }
    }

    /// Whether this target consumes the three passes that are DOM concepts: a
    /// `<!---->` is an insert anchor, a `template()` is a parse, and a REF PLAN
    /// is a sibling walk. The compile-time addresses are not on that list and
    /// never were — they are computed for every target, out of the patch
    /// program, which is the artefact the targets share.
    #[inline]
    pub fn walks_the_dom(self) -> bool {
        matches!(self, Self::Dom | Self::Interp)
    }
}

pub const HELPER_COUNT: usize = 65;

/// The module a helper is imported from.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Home {
    /// `<core_source>`: the renderer-neutral half every target shares.
    Core,
    /// `<module_source>`: the renderer, which builds and places the nodes.
    Renderer,
    /// `<server_source>`: the string backend, which the client bundle must never
    /// pull in.
    Server,
    /// `<module_source>/interp`: the reference backend, DEV and test only, so
    /// it never reaches a production bundle through the other two.
    Interp,
}

/// Where `helper` comes from when compiling for `target`. The one table that
/// decides it, so a helper moving between packages is one line here.
///
/// One ABI means no fallback cliff, applied to a runtime entry point rather
/// than to a call: `branch` and its siblings have one name, one argument order
/// and two implementations, and the TARGET chooses the source. A module
/// compiled for the DOM imports `branch` from the renderer; the same module
/// compiled for the server imports it from `<server_source>`. Nothing between
/// the two emissions differs, which is what makes `region_call` one function
/// rather than two. It is also what makes the string backend's own claim
/// checkable: a module compiled for the server imports from the server entry
/// and from core, so the DOM runtime cannot reach a server bundle through a
/// helper that merely happens to be DOM-free today.
pub fn home(helper: Helper, target: Target) -> Home {
    use Helper as H;
    match helper {
        // `ReadSlot` is here because the spread lowering that emits it runs in
        // the shape pass, before a backend is chosen.
        H::Props
        | H::Cell
        | H::Block
        | H::ReadSlot
        | H::Count
        | H::GetOwner
        | H::Untrack
        | H::CreateComponent
        | H::BindEffect => Home::Core,
        H::Branch | H::Each | H::Boundary | H::Portal | H::Island | H::Reveal | H::Dynamic => {
            match target {
                Target::Ssr => Home::Server,
                Target::Dom | Target::Interp | Target::Universal => Home::Renderer,
            }
        }
        H::Interp => Home::Interp,
        H::Esc
        | H::EscAttr
        | H::Attr
        | H::Content
        | H::Html
        | H::RawText
        | H::SpreadAttrs
        | H::SsrFor
        | H::SsrRepeat
        | H::SsrShow
        | H::SsrSwitch
        | H::SsrMatch
        | H::AttrLit
        | H::SsrLoading
        | H::SsrErrored
        | H::SsrPortal
        | H::SsrIsland
        | H::SsrReveal
        | H::FormAttr
        | H::ClientOnly
        | H::BindAttr => Home::Server,
        H::Template
        | H::Insert
        | H::SetProp
        | H::Element
        | H::Spread
        | H::DelegateEvents
        | H::SetAttr
        | H::SetDomProp
        | H::SetLive
        | H::SetClass
        | H::SetStyle
        | H::SetHtml
        | H::BindProp
        | H::BindValue
        | H::Ref
        | H::FormAction
        | H::Listen
        | H::BindEvent
        | H::Child
        | H::Sib
        | H::Hole
        | H::ReadKeys
        | H::ClassToString
        | H::ReadOpaque
        | H::CreateElement
        | H::CreateTextNode
        | H::InsertNode => Home::Renderer,
    }
}

/// Runtime entry points the backends are allowed to call. [`home`] says which
/// package each comes from; nothing else is emitted.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Helper {
    Template = 0,
    Insert = 1,
    SetProp = 2,
    /// `_$element($s, tag, props)` — one element by tag NAME, built rather than
    /// cloned, for an intrinsic the tree builder would not produce as written,
    /// which a template therefore cannot carry. `dynamic`'s string arm calls the
    /// same function at run time. It goes through `spread` and `insert` from
    /// there, so the props and children rules are the compiled ones.
    Element = 3,
    /// `_$spread($s, el, sources)` on an element. The one
    /// channel whose NAMES are not a compile-time fact, so the object travels
    /// whole and the runtime resolves each key through the same tables
    /// `build.rs` generates the compiler's from.
    Spread = 4,
    /// `_$bindEffect($s, compute, apply)` — the element-binding effect, O4.5.
    ///
    /// Scope FIRST, like every other entry point on this surface. The bare
    /// `renderEffect(compute, apply)` this replaces took no scope at all, so the
    /// whole attribute/class/style/domprop channel was owned by whatever was
    /// ambient at the call site rather than by the scope its Block was handed —
    /// the exact defect O4.5 names, in the one channel the compiled path uses
    /// most. It is also what makes `brand`'s `ReadsScope` see these components:
    /// a body whose only reactive work is an element binding now mentions `_s$`.
    BindEffect = 5,
    DelegateEvents = 6,
    /// `_$props([…])` — C9's ordered source list. Returns its single argument
    /// unchanged when the list is one plain record, which is the overwhelming
    /// case and pays nothing.
    Props = 7,
    /// `_$cell(v)` — a Cell carrying a value evaluated exactly once. The form a
    /// FUNCTION-valued prop takes, so `props.onClick()` returns the same object
    /// every time and C5's identity claim survives a handler.
    Cell = 8,
    /// `_$b(fn)` — the scope brand. Marks a Block that USES the scope it is
    /// handed, once per definition site, so kind travels with the VALUE and a
    /// consumer never has to guess it from arity. It is what makes a Block
    /// landing in a Cell slot throw instead of being invoked with `undefined`
    /// and silently stringified.
    Block = 9,
    // ── `flow.ts`'s four primitives, plus `each`'s count-mode symbol ──────
    //
    // These are what the thirteen control-flow constructs lower ONTO: the
    // compiler hands each one the `(parent, anchor)` pair its own template walk
    // computed, and a flags integer carrying the properties it proved.
    Branch = 10,
    Each = 11,
    Boundary = 12,
    Portal = 13,
    /// `island(s, parent, anchor, block, flags)` — a subtree the client does not
    /// hydrate.
    ///
    /// One of the names [`home`] gives two sources on purpose: one name, one
    /// argument order, two implementations, with the TARGET choosing the source. That is what keeps
    /// `region_call` a single function for it, and it is why the server's half
    /// takes the insertion pair it has no use for — the emission is identical on
    /// both sides, which is the property this block exists to hold.
    Island = 14,
    /// `COUNT` — `each`'s fourth mode, where `src` is a count rather than a list.
    Count = 15,
    // ── two more names that exist in BOTH halves ──────────────────────────
    /// `_$reveal($s, order, collapsed, body)` — reveal ORDERING, which is a
    /// provide scope rather than a range (O1 lists `provide` separately). Not
    /// one of the four primitives, and no component wraps it.
    Reveal = 16,
    /// `_$dynamic(source)` — Solid 2.0's factory, which the AUTHOR calls. The
    /// server backend points that call here, at the string half of the same
    /// name, because the client half builds DOM; the DOM backend never emits
    /// it and leaves the author's import of the renderer's alone.
    Dynamic = 17,
    /// `_$readSlot(v, "origin")` — the Cell-slot read, at the one
    /// place the compiler cannot perform it itself: a prop that arrived through
    /// a SPREAD, where the source object is the author's own and nothing wrapped
    /// its values into Cells. It is the call the fourteen adapters made under
    /// the name `readValue`, and the `origin` string is what makes a Block
    /// landing in a Cell slot throw with the prop's name instead of stringify.
    ///
    /// It is core's because the lowering that emits it runs before the backend
    /// is chosen, so every target must answer to the name.
    ReadSlot = 18,
    // ── the resolved channels ─────────────────────────────────────────────
    //
    // One entry point per channel, chosen at compile time. There is no
    // `setProp` on the compiled path: the name never reaches the runtime as a
    // question, only as the argument the channel already knows what to do with.
    SetAttr = 19,
    SetDomProp = 20,
    /// The user-mutable channel. Compares against the ELEMENT rather
    /// than against what the framework last applied, and preserves the caret of
    /// whatever the user is inside. Emitted only for the names that need it.
    SetLive = 21,
    SetClass = 22,
    SetStyle = 23,
    SetHtml = 24,
    /// `_$bindProp($s, el, _$setAttr, "id", v)` — the ONE question kept
    /// at run time: whether the value that arrived is a live Cell. The channel
    /// is the compiler's and is passed in.
    BindProp = 25,
    /// `bind:` — the two-way channel, property and reporting event resolved.
    BindValue = 26,
    /// A scope-owned `ref` registration (B3, E2 #7).
    Ref = 27,
    /// `_$formAction($s, el, value)`. `action` on a
    /// `<form>` is a URL or a SUBMIT HANDLER, and nothing about the expression
    /// tells them apart: an `action()` is `(...args) => Promise<R>`, so its
    /// arity is 0 and the arity rule reads it as a Cell. The SLOT decides,
    /// exactly
    /// as it does for `on*`. It takes a scope because the listener it installs
    /// is owned by the position (B4).
    FormAction = 28,
    /// A scope-owned `addEventListener` (B4, E2 #6).
    Listen = 29,
    /// The delegated/direct choice made at compile time, applied to a value the
    /// compiler could not prove is a handler.
    BindEvent = 30,
    // ── the hydration-only walk ───────────────────────────────────────────
    //
    // Under `hydratable` the template walk
    // goes through these two instead of `.firstChild`/`.nextSibling`, because
    // the server's children are the template's skeleton PLUS a `<!--[-->` …
    // `<!--]-->` range at every hole, and a native sibling step counts those.
    // A logical step does not: a whole range contributes nothing.
    //
    // They exist ONLY under `hydratable`. H3's "the index must cost nothing on
    // the client-render path" is the diff between the two emissions, and with
    // the flag off not one of these appears.
    /// `_$child(base, k)` — the k-th logical child, from the start when `k >= 0`
    /// and from the end when `k < 0` (`-1` is the last).
    Child = 31,
    /// `_$sib(base, k)` — `k` logical siblings forward, or `-k` backward.
    Sib = 32,
    /// `_$hole(parent, anchor, build)` — claim the server's range at a hole,
    /// THEN build the value that goes in it.
    ///
    /// It exists for one evaluation-order fact: `_$insert(s, el, Comp(s, {}))`
    /// evaluates `Comp` before `insert` is entered, so a component in a child
    /// position would claim from wherever the enclosing walk happened to leave
    /// the cursor rather than from its own hole. The compiler knows the position
    /// statically — that is what an address IS — so it says so, instead of the
    /// runtime guessing from the shape of the tree it is walking.
    Hole = 33,
    // ── `<server_source>` ─────────────────────────────────────────────────
    Esc = 34,
    EscAttr = 35,
    Attr = 36,
    Content = 37,
    Html = 38,
    RawText = 39,
    SpreadAttrs = 40,
    SsrFor = 41,
    SsrRepeat = 42,
    SsrShow = 43,
    SsrSwitch = 44,
    SsrMatch = 45,
    AttrLit = 46,
    SsrLoading = 47,
    SsrErrored = 48,
    SsrPortal = 49,
    /// `ssrIsland(s, props)` — the COMPONENT form, for a build whose flow pass
    /// is off. [`Island`] is the region form, whose source the target picks; this is
    /// the string backend's answer when the construct was never lowered, exactly
    /// as [`SsrPortal`] is for `Portal`.
    SsrIsland = 50,
    SsrReveal = 51,
    /// `_$formAttr(value)` — the string half of `formAction`. A URL is written
    /// and a handler is not: there is no byte on the wire that means client
    /// behaviour, and `ssr.ts` states the consequence for a pre-hydration submit.
    FormAttr = 52,
    /// `_$clientOnly(fn, options, moduleUrl)` — Solid 2.0's factory, which the
    /// AUTHOR calls, pointed at the string half the way [`Dynamic`] is. The
    /// client half starts the import, and a server render must never run a
    /// module written for the browser.
    ClientOnly = 53,
    // ── `<module_source>/interp` ──────────────────────────────────────────
    Interp = 54,
    /// `_$getOwner()` — the ambient owner, read where a scope VALUE is needed
    /// rather than a construction under one. The delegated-event dispatcher
    /// stores it on the element (`__bqs`) so a throw routes to the scope's
    /// catcher; nothing else needs it, because every construct reads the
    /// ambient itself.
    GetOwner = 55,
    /// `_$readKeys(value)` — a `style` object with the getters
    /// it holds called, in the READ half of the binding that writes it. A key
    /// may be live on its own, and the read is where that becomes a
    /// dependency; the write half is handed values only.
    ReadKeys = 56,
    /// `_$classToString(value)` — a lone `class` binding's value in its applied
    /// form, computed in the READ half so the effect's own equality decides
    /// whether the write half runs at all.
    ClassToString = 57,
    /// `_$untrack(() => Comp(props))` — a component called where a compute may
    /// be running, so a signal its setup reads does not rebuild it.
    Untrack = 58,
    /// `_$createComponent(Comp, props, "Comp")` — a development compile's
    /// component call, run under an owner named for the tag so a finding, an
    /// error or a hydration report inside it carries the component path.
    CreateComponent = 59,
    /// `_$readOpaque(value, "title")` — `bindProp`'s read of an opaque call,
    /// for one that joined its template's effect.
    ReadOpaque = 60,
    /// `_$bindAttr("on:click", () => row.toggle)` — a handler or ref position
    /// on the wire. Nothing is written for it unless the server component
    /// rendering it read the value off a binding slot, and the read runs only
    /// there: anywhere else a handler expression is never evaluated on the
    /// server. A `<server_source>` helper numbered after the module-source
    /// tail, so the import grouping names it apart.
    BindAttr = 61,
    // ── a custom renderer's node operations ───────────────────────────────
    /// `_$createElement("box")` — one element of the host, by tag.
    CreateElement = 62,
    /// `_$createTextNode("text")`.
    CreateTextNode = 63,
    /// `_$insertNode(parent, node)` — a static child, put in place once.
    InsertNode = 64,
}

/// Every helper with the name it is imported under, in `Helper` order.
const IMPORTED: [(Helper, &str); HELPER_COUNT] = [
    (Helper::Template, "template"),
    (Helper::Insert, "insert"),
    (Helper::SetProp, "setProp"),
    (Helper::Element, "element"),
    (Helper::Spread, "spread"),
    (Helper::BindEffect, "bindEffect"),
    (Helper::DelegateEvents, "delegateEvents"),
    (Helper::Props, "props"),
    (Helper::Cell, "cell"),
    (Helper::Block, "block"),
    (Helper::Branch, "branch"),
    (Helper::Each, "each"),
    (Helper::Boundary, "boundary"),
    (Helper::Portal, "portal"),
    (Helper::Island, "island"),
    (Helper::Count, "COUNT"),
    (Helper::Reveal, "reveal"),
    (Helper::Dynamic, "dynamic"),
    (Helper::ReadSlot, "readSlot"),
    (Helper::SetAttr, "setAttr"),
    (Helper::SetDomProp, "setDomProp"),
    (Helper::SetLive, "setLive"),
    (Helper::SetClass, "setClass"),
    (Helper::SetStyle, "setStyle"),
    (Helper::SetHtml, "setHtml"),
    (Helper::BindProp, "bindProp"),
    (Helper::BindValue, "bindValue"),
    (Helper::Ref, "ref"),
    (Helper::FormAction, "formAction"),
    (Helper::Listen, "listen"),
    (Helper::BindEvent, "bindEvent"),
    (Helper::Child, "child"),
    (Helper::Sib, "sib"),
    (Helper::Hole, "hole"),
    (Helper::Esc, "esc"),
    (Helper::EscAttr, "escAttr"),
    (Helper::Attr, "attr"),
    (Helper::Content, "content"),
    (Helper::Html, "html"),
    (Helper::RawText, "rawText"),
    (Helper::SpreadAttrs, "spreadAttrs"),
    (Helper::SsrFor, "ssrFor"),
    (Helper::SsrRepeat, "ssrRepeat"),
    (Helper::SsrShow, "ssrShow"),
    (Helper::SsrSwitch, "ssrSwitch"),
    (Helper::SsrMatch, "ssrMatch"),
    (Helper::AttrLit, "attrLit"),
    (Helper::SsrLoading, "ssrLoading"),
    (Helper::SsrErrored, "ssrErrored"),
    (Helper::SsrPortal, "ssrPortal"),
    (Helper::SsrIsland, "ssrIsland"),
    (Helper::SsrReveal, "ssrReveal"),
    (Helper::FormAttr, "formAttr"),
    (Helper::ClientOnly, "clientOnly"),
    (Helper::Interp, "interp"),
    (Helper::GetOwner, "getOwner"),
    (Helper::ReadKeys, "readKeys"),
    (Helper::ClassToString, "classToString"),
    (Helper::Untrack, "untrack"),
    (Helper::CreateComponent, "createComponent"),
    (Helper::ReadOpaque, "readOpaque"),
    (Helper::BindAttr, "bindAttr"),
    (Helper::CreateElement, "createElement"),
    (Helper::CreateTextNode, "createTextNode"),
    (Helper::InsertNode, "insertNode"),
];

/// The name a helper is imported under, for a test that has to check the table
/// rather than trust it.
#[cfg(test)]
pub(crate) fn imported_name(helper: Helper) -> &'static str {
    IMPORTED[helper as usize].1
}

const INTERP: &str = "/interp";

/// A prefix no `<prefix><helper>` in the source collides with.
///
/// One scan, not one per helper: a collision has to begin with the sigil, so
/// the sigil's own occurrences are the only positions worth testing, and there
/// are almost never any. Twenty-two `contains` calls over the whole source cost
/// 2.1 µs of a 27 µs compile once the string backend's helpers joined the list.
pub(crate) fn free_sigil(source: &str) -> String {
    let mut sigil = String::from("_$");
    while source.match_indices(sigil.as_str()).any(|(at, _)| {
        let rest = &source[at + sigil.len()..];
        IMPORTED.iter().any(|(_, suffix)| rest.starts_with(suffix))
    }) {
        sigil.push('$');
    }
    sigil
}

/// Every helper's local name, packed end to end into one arena string and
/// handed out as slices of it.
pub(crate) fn helper_names<'a>(sigil: &str, allocator: &'a Allocator) -> [&'a str; HELPER_COUNT] {
    let width: usize = IMPORTED.iter().map(|(_, suffix)| sigil.len() + suffix.len()).sum();
    let mut packed = String::with_capacity(width);
    for (_, suffix) in IMPORTED {
        packed.push_str(sigil);
        packed.push_str(suffix);
    }
    let packed = allocator.alloc_str(&packed) as &'a str;

    let mut local = [""; HELPER_COUNT];
    let mut at = 0;
    for (index, (_, suffix)) in IMPORTED.iter().enumerate() {
        let end = at + sigil.len() + suffix.len();
        local[index] = &packed[at..end];
        at = end;
    }
    local
}

/// Stage 5 (P8a) plus the module preamble. The IR is final — every unit already
/// carries its `TemplateId`, its `RefPlan` and its patch program — so this stage
/// only prints. It is also the only stage that writes to the program, which it
/// can do freely because no part of the IR borrows the AST.
pub fn emit<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
    target: Target,
) {
    let mut emit = Emit::new(allocator, program.source_text, module, options, target);
    emit.visit_program(program);
    prune::run(&mut emit, program);
    install::run(&mut emit, program);
}

/// Free of `Emit` because the shape passes declare temporaries too.
pub fn const_binding<'a>(
    ast: &AstBuilder<'a>,
    name: &'a str,
    init: Expression<'a>,
    span: Span,
) -> Statement<'a> {
    let declarator = VariableDeclarator::new(
        span,
        BindingPattern::new_binding_identifier(span, name, ast),
        None,
        Some(init),
        false,
        ast,
    );
    Statement::new_variable_declaration(
        span,
        VariableDeclarationKind::Const,
        [declarator],
        false,
        ast,
    )
}

pub struct Emit<'a, 'm> {
    pub allocator: &'a Allocator,
    pub ast: AstBuilder<'a>,
    pub module: &'m mut Module<'a>,
    pub source: &'a str,
    pub module_source: &'a str,
    /// `<core_source>` — the helpers every target shares.
    pub core_source: &'a str,
    /// `<server_source>` — where P8b's helpers come from. Its own package: the
    /// server runtime must never reach a client bundle.
    pub server_source: &'a str,
    /// `<module_source>/interp` — the reference backend's only entry point.
    pub interp_source: &'a str,
    pub target: Target,
    /// One `const _ir$N = […]` per unit the reference backend serialised, in
    /// unit order. Built while the roots are visited and spliced by `install`,
    /// which is the only stage that may add module-scope statements.
    pub interp_units: Vec<Statement<'a>>,
    /// The three optimisations codegen owns: η-reduction, module-scope hoisting
    /// of a capture-free handler, and statement splicing.
    pub opt: Opt,
    /// Both backends read it, and it is the only option
    /// outside `Opt` that changes the bytes: the string backend writes range
    /// boundaries and the DOM backend walks logically.
    pub hydratable: bool,
    /// RECOVERY is on the wire and DETECTION is
    /// an emission axis, and this is the axis. `dev && hydratable`: the string
    /// backend spells a branch's chosen key into its open comment and the DOM
    /// backend asks `template()` to verify the subtree it claimed against the
    /// one it would have built. A production build emits neither and the whole
    /// check disappears from both halves.
    pub detect: bool,
    /// The module's path, which a development build writes beside each
    /// template so a hydration mismatch can name the JSX it came from.
    pub filename: &'a str,
    pub used: [bool; HELPER_COUNT],
    pub local: [&'a str; HELPER_COUNT],
}

impl<'a, 'm> Emit<'a, 'm> {
    fn new(
        allocator: &'a Allocator,
        source: &'a str,
        module: &'m mut Module<'a>,
        options: &ResolvedOptions,
        target: Target,
    ) -> Self {
        let local = module.helpers;
        let used = module.used_helpers;
        let mut interp_source = String::with_capacity(options.module_source.len() + INTERP.len());
        interp_source.push_str(&options.module_source);
        interp_source.push_str(INTERP);
        Self {
            allocator,
            ast: AstBuilder::new(allocator),
            module,
            source,
            module_source: allocator.alloc_str(&options.module_source),
            core_source: allocator.alloc_str(&options.core_source),
            server_source: allocator.alloc_str(&options.server_source),
            interp_source: allocator.alloc_str(&interp_source),
            target,
            interp_units: Vec::new(),
            opt: options.opt,
            hydratable: options.hydratable,
            detect: options.hydratable && options.dev,
            filename: allocator.alloc_str(
                options.filename.as_deref().map_or(crate::compile::DEFAULT_FILENAME, |name| {
                    name.split_once('?').map_or(name, |(path, _)| path)
                }),
            ),
            used,
            local,
        }
    }

    /// Whether a hole may go on the wire with no boundary comments at all.
    ///
    /// Two conditions, and both are about what the CLIENT can re-derive. The
    /// slot must own its parent's child list, so its extent is readable off the
    /// document ([`crate::ir::Skeleton::slot_owns_child_list`]). And the parent
    /// must not be one of the three tags kept at run time: inside
    /// `<pre>`, `<textarea>`, `<listing>` and the rawtext family the tokenizer
    /// eats a leading newline that the OPEN comment is currently what protects,
    /// so removing the comment there would change the text the server sent.
    pub fn hole_owns_child_list(
        &self,
        unit: &crate::ir::Unit<'a>,
        parent: crate::ir::NodeId,
        slot: crate::ir::SlotId,
    ) -> bool {
        if !self.hydratable || !unit.skeleton.slot_owns_child_list(parent, slot) {
            return false;
        }
        let Some(element) = unit.skeleton.node(parent).as_element() else { return false };
        let flags = self.module.interner.tag(element.tag).flags;
        // Raw text has no comments at all — a `<!--[-->` inside `<textarea>` is
        // CHARACTER DATA and would be read back as part of the value — so the
        // hole there always owns the child list and the leading newline is
        // protected by the doubling the serialiser writes instead. `<pre>` and
        // `<listing>` are ordinary parsing, so their comment is a comment and
        // the refusal stands.
        if flags.contains(crate::ir::TagFlags::RAW_TEXT)
            || flags.contains(crate::ir::TagFlags::ESCAPABLE_RAW_TEXT)
        {
            return true;
        }
        !flags.contains(crate::ir::TagFlags::PRESERVE_WS)
    }

    /// The same question for a REGION, and one extra condition: not under
    /// `detect`.
    ///
    /// A region's open comment is where the key goes, and the key is the whole
    /// of what is left on the detection axis: the client cannot re-evaluate the
    /// condition, so the server's choice has to be on the wire or it is lost. A
    /// dev build therefore keeps the comments at every range,
    /// sole-occupant or not, and pays for them; a production build drops them
    /// wherever the client can read the extent off the parent, exactly as it
    /// does at a hole.
    ///
    /// Returns the flag bit rather than a bool because that is what the caller
    /// ORs into the region's flags, and a predicate that returned `true` into a
    /// `|=` would be a silent 1.
    pub fn region_owns_child_list(
        &self,
        unit: &crate::ir::Unit<'a>,
        parent: crate::ir::NodeId,
        slot: crate::ir::SlotId,
    ) -> u8 {
        if self.detect || !self.hole_owns_child_list(unit, parent, slot) {
            return 0;
        }
        crate::ir::WHOLE
    }

    // ── AST construction ──────────────────────────────────────────────────

    pub fn ident(&self, name: &'a str, span: Span) -> Expression<'a> {
        Expression::new_identifier(span, name, &self.ast)
    }

    pub fn string(&self, value: &'a str, span: Span) -> Expression<'a> {
        Expression::new_string_literal(span, value, None, &self.ast)
    }

    pub fn member(&self, object: Expression<'a>, property: &'a str, span: Span) -> Expression<'a> {
        let property = IdentifierName::new(span, property, &self.ast);
        Expression::new_static_member_expression(span, object, property, false, &self.ast)
    }

    pub fn call(
        &self,
        callee: Expression<'a>,
        arguments: Vec<Argument<'a>>,
        span: Span,
    ) -> Expression<'a> {
        let arguments = ArenaVec::from_iter_in(arguments, &self.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.ast)
    }

    pub fn binding(&self, name: &'a str, init: Expression<'a>, span: Span) -> Statement<'a> {
        const_binding(&self.ast, name, init, span)
    }

    pub fn thunk(&self, body: Expression<'a>, span: Span) -> Expression<'a> {
        self.arrow(None, body, span)
    }

    pub fn lambda(&self, name: &'a str, body: Expression<'a>, span: Span) -> Expression<'a> {
        let pattern = BindingPattern::new_binding_identifier(span, name, &self.ast);
        self.arrow(Some(self.parameter(pattern, span)), body, span)
    }

    pub fn parameter(&self, pattern: BindingPattern<'a>, span: Span) -> FormalParameter<'a> {
        FormalParameter::new(
            span,
            ArenaVec::new_in(&self.allocator),
            pattern,
            None,
            None,
            false,
            None,
            false,
            false,
            &self.ast,
        )
    }

    fn arrow(
        &self,
        parameter: Option<FormalParameter<'a>>,
        body: Expression<'a>,
        span: Span,
    ) -> Expression<'a> {
        let params = FormalParameters::boxed(
            span,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::from_iter_in(parameter, &self.allocator),
            None,
            &self.ast,
        );
        Expression::new_arrow_function_expression(
            span,
            false,
            None,
            params,
            None,
            ArrowFunctionBody::from(body),
            &self.ast,
        )
    }

    /// `_s$` — the scope the enclosing Block was given. The convention puts
    /// it FIRST on every ABI primitive that constructs, so a Block reached with
    /// no scope throws at the primitive rather than building under whatever was
    /// ambient. One identifier at every position, so lexical shadowing does the
    /// threading and a module-level unit reaches `const _s$ = null`.
    pub fn scope(&mut self, span: Span) -> Expression<'a> {
        let name = self.module.uids.scope();
        self.ident(name, span)
    }

    pub fn helper(&mut self, helper: Helper, span: Span) -> Expression<'a> {
        let index = helper as usize;
        self.used[index] = true;
        self.ident(self.local[index], span)
    }

    pub fn template_name(&self, id: TemplateId) -> &'a str {
        self.module.uids.template(id, self.allocator)
    }

    /// A unit is dead once it has been printed, so it is swapped out rather
    /// than borrowed — `emit_unit` needs the whole `Emit` and the unit at once,
    /// and an empty `Unit` costs no allocation to stand in.
    fn unit(&mut self, id: UnitId, span: Span) -> Expression<'a> {
        let empty = Unit::new_in(self.allocator, Ns::Html, Site::Nested(span));
        let mut unit = std::mem::replace(&mut self.module.units[id as usize], empty);
        let expression = match self.target {
            Target::Dom => dom::emit_unit(self, &mut unit, span),
            Target::Ssr => ssr::emit_unit_root(self, &mut unit, span),
            Target::Interp => interp::emit_unit(self, &mut unit, id, span),
            Target::Universal => universal::emit_unit(self, &mut unit, span),
        };
        self.module.units[id as usize] = unit;
        expression
    }

    /// A region no patch claimed, expanded where its placeholder stands. The
    /// primitive is handed `(null, null)` and returns the anchor it created, so
    /// whoever receives the value inserts it — `flow.ts`'s own `siteFor` path,
    /// and the one place K7's single empty text node is paid for.
    fn region(&mut self, id: crate::ir::RegionId, span: Span) -> Expression<'a> {
        let empty = dom::empty_region(self, span);
        let Some(region) = self.module.regions[id as usize].replace(empty) else {
            unreachable!("a claimed region no longer has a placeholder to expand")
        };
        dom::region_call(self, region, None, span)
    }

    fn root(&mut self, index: u32, span: Span) -> Expression<'a> {
        match std::mem::replace(&mut self.module.roots[index as usize], Root::Unit(NONE)) {
            Root::Unit(id) => self.unit(id, span),
            Root::Verbatim(jsx) => self.jsx(jsx),
            Root::Pending(..) => unreachable!("P1 lowers every root it is handed"),
        }
    }

    /// The placeholder's unit, when its recorded [`Site`] says its statements
    /// may be spliced into the enclosing body instead of wrapped in an IIFE.
    fn spliceable(&self, expression: &Expression<'a>) -> Option<(u32, UnitId)> {
        // The string and reference backends produce one expression and no
        // statements, so there is nothing to splice and every root goes
        // through `root`.
        if !matches!(self.target, Target::Dom | Target::Universal) || !self.opt.splice {
            return None;
        }
        let Expression::Identifier(identifier) = expression else { return None };
        let index = self.module.uids.root_index(identifier.name.as_str())?;
        let Root::Unit(id) = self.module.roots[index as usize] else { return None };
        let unit = self.module.units.get(id as usize)?;
        (!unit.site.needs_iife()).then_some((index, id))
    }

    /// A statement whose whole value is one spliceable placeholder.
    fn host(&self, statement: &Statement<'a>) -> Option<(u32, UnitId)> {
        match statement {
            Statement::ReturnStatement(it) => {
                it.argument.as_ref().and_then(|value| self.spliceable(value))
            }
            Statement::VariableDeclaration(it) if it.declarations.len() == 1 => {
                it.declarations[0].init.as_ref().and_then(|value| self.spliceable(value))
            }
            _ => None,
        }
    }

    fn parts(
        &mut self,
        index: u32,
        id: UnitId,
        span: Span,
    ) -> (Vec<Statement<'a>>, Expression<'a>) {
        self.module.roots[index as usize] = Root::Unit(NONE);
        let empty = Unit::new_in(self.allocator, Ns::Html, Site::Nested(span));
        let mut unit = std::mem::replace(&mut self.module.units[id as usize], empty);
        let parts = if self.target == Target::Universal {
            universal::emit_unit_parts(self, &mut unit, span)
        } else {
            dom::emit_unit_parts(self, &mut unit, span)
        };
        self.module.units[id as usize] = unit;
        parts
    }

    fn jsx(&mut self, expression: Expression<'a>) -> Expression<'a> {
        if self.target == Target::Ssr {
            return ssr::emit_verbatim_root(self, expression);
        }
        self.create_element_path(expression)
    }

    /// The un-compiled path, for both backends: the string backend falls back
    /// to it for a component tag it cannot resolve.
    pub(super) fn create_element_path(&mut self, expression: Expression<'a>) -> Expression<'a> {
        match expression {
            Expression::JSXElement(element) => self.create_element(element),
            Expression::JSXFragment(fragment) => self.fragment_array(fragment),
            other => other,
        }
    }
}

/// Installs one compiled root per placeholder, and lowers whatever JSX P1
/// refused through `createElement`. Walking the replacement is what reaches the
/// units nested inside a hole expression.
///
/// Statement splicing: a unit whose root sits in a return, a
/// declarator initialiser or an arrow's expression body emits its walk and its
/// patch program as FLAT statements of the enclosing body — one fewer closure
/// allocation and one fewer stack frame per component instance, and far more
/// readable output. Every statement below is visited exactly once; visiting a
/// placeholder twice would look up a root that has already been consumed.
impl<'a> VisitMut<'a> for Emit<'a, '_> {
    fn visit_statements(&mut self, it: &mut ArenaVec<'a, Statement<'a>>) {
        if !it.iter().any(|statement| self.host(statement).is_some()) {
            walk_statements(self, it);
            return;
        }
        let taken = std::mem::replace(it, ArenaVec::new_in(&self.allocator));
        let mut out = ArenaVec::with_capacity_in(taken.len(), &self.allocator);
        for mut statement in taken {
            let Some((index, id)) = self.host(&statement) else {
                self.visit_statement(&mut statement);
                out.push(statement);
                continue;
            };
            let (statements, root) = self.parts(index, id, statement.span());
            for mut spliced in statements {
                self.visit_statement(&mut spliced);
                out.push(spliced);
            }
            implant(&mut statement, root);
            self.visit_statement(&mut statement);
            out.push(statement);
        }
        *it = out;
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        if let Some(found) =
            it.body.as_expression().and_then(|body| self.spliceable(body).map(|f| (f, body.span())))
        {
            let ((index, id), span) = found;
            let (statements, root) = self.parts(index, id, span);
            if statements.is_empty() {
                *it.body.as_expression_mut().expect("checked above") = root;
            } else {
                let mut statements = statements;
                statements.push(Statement::new_return_statement(span, Some(root), &self.ast));
                it.body = ArrowFunctionBody::new_function_body(
                    span,
                    ArenaVec::new_in(&self.allocator),
                    ArenaVec::from_iter_in(statements, &self.allocator),
                    &self.ast,
                );
            }
        }
        walk_arrow_function_expression(self, it);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if self.target == Target::Ssr
            && let Expression::CallExpression(call) = it
        {
            self.server_factory(call);
        }
        if let Expression::Identifier(identifier) = it
            && let Some(index) = self.module.uids.root_index(identifier.name.as_str())
        {
            let span = identifier.span;
            *it = self.root(index, span);
        }
        // Sequential, not an `else`: a root the lowering REFUSED can itself be
        // one lowered construct, and `<Show>` as a whole component body is
        // exactly that shape.
        if let Expression::Identifier(identifier) = it
            && let Some(id) = self.module.uids.region_index(identifier.name.as_str())
            && self.module.regions.get(id as usize).is_some_and(Option::is_some)
        {
            let span = identifier.span;
            *it = self.region(id, span);
        } else if matches!(it, Expression::JSXElement(_) | Expression::JSXFragment(_)) {
            let taken = it.take_in(&self.allocator);
            *it = self.jsx(taken);
        }
        walk_expression(self, it);
    }
}

impl<'a> Emit<'a, '_> {
    /// `dynamic(source)` and `clientOnly(fn)` from the runtime, pointed at the
    /// server's halves. The author imported the client's: `dynamic` builds DOM
    /// and `clientOnly` starts an import of a module written for the browser. A
    /// named import whose every call was pointed here loses its specifier in
    /// `install`; the namespace spelling keeps the namespace, which serves
    /// other names.
    fn server_factory(&mut self, call: &mut CallExpression<'a>) {
        // A module that is not JSX is never bound, so it has no symbols to ask.
        if self.module.env.kind.is_empty() {
            return;
        }
        let factory = |prim: Prim| match prim {
            Prim::Dynamic => Some(Helper::Dynamic),
            Prim::ClientOnly => Some(Helper::ClientOnly),
            _ => None,
        };
        let named =
            crate::analysis::symbol_of(&self.module.scoping, &call.callee).and_then(|symbol| {
                match self.module.env.kind_of(symbol) {
                    SourceKind::Primitive(prim) => factory(prim).map(|helper| (symbol, helper)),
                    _ => None,
                }
            });
        let namespaced = match crate::analysis::without_type_wrappers(&call.callee) {
            Expression::StaticMemberExpression(member)
                if crate::analysis::symbol_of(&self.module.scoping, &member.object)
                    .is_some_and(|object| self.module.env.namespaces.contains(&object)) =>
            {
                Prim::of_export(member.property.name.as_str()).and_then(factory)
            }
            _ => None,
        };
        let Some(helper) = named.map(|(_, helper)| helper).or(namespaced) else {
            return;
        };
        let span = call.callee.span();
        call.callee = self.helper(helper, span);
        if let Some((symbol, _)) = named {
            self.module.flow_rewrites.push(symbol);
        }
    }
}

/// Puts the unit's value back where its placeholder stood.
fn implant<'a>(statement: &mut Statement<'a>, root: Expression<'a>) {
    match statement {
        Statement::ReturnStatement(it) => it.argument = Some(root),
        Statement::VariableDeclaration(it) => it.declarations[0].init = Some(root),
        _ => unreachable!("only the two shapes `host` matches are ever spliced"),
    }
}

#[cfg(test)]
mod table {
    use super::{HELPER_COUNT, IMPORTED};

    #[test]
    fn every_helper_sits_at_its_own_index() {
        for (index, (helper, _)) in IMPORTED.iter().enumerate() {
            assert_eq!(*helper as usize, index, "{}", IMPORTED[index].1);
        }
        assert_eq!(IMPORTED.len(), HELPER_COUNT);
    }
}
