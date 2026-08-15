use std::ops::BitOr;

use oxc::allocator::Allocator;
use rustc_hash::FxHashMap;

use super::{AVec, NameId, StrId, TagId};

macro_rules! flag_set {
    ($name:ident : $repr:ty { $($(#[$doc:meta])* $flag:ident = $bit:expr;)* }) => {
        #[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
        pub struct $name($repr);

        impl $name {
            pub const EMPTY: Self = Self(0);
            $($(#[$doc])* pub const $flag: Self = Self(1 << $bit);)*

            #[inline]
            pub const fn contains(self, other: Self) -> bool {
                self.0 & other.0 == other.0
            }

            #[inline]
            pub const fn bits(self) -> $repr {
                self.0
            }
        }

        impl BitOr for $name {
            type Output = Self;

            #[inline]
            fn bitor(self, other: Self) -> Self {
                Self(self.0 | other.0)
            }
        }
    };
}

flag_set!(TagFlags: u16 {
    /// no end tag, no children
    VOID = 0;
    /// `<script>` / `<style>`: contents are not escaped and not parsed as markup
    RAW_TEXT = 1;
    /// `<textarea>` / `<title>`: character references resolve, markup does not
    ESCAPABLE_RAW_TEXT = 2;
    /// the parser ignores one U+000A character token directly after the open
    /// tag, so a leading newline has to be DOUBLED or the DOM diverges from
    /// `createTextNode`. A character reference does not escape the rule
    /// (DESIGN §12 O9)
    PRESERVE_WS = 3;
    /// member of the generated `SVG_TAGS`
    SVG = 4;
});

flag_set!(NameFlags: u16 {
    /// `key.startsWith("on")`
    IS_EVENT = 0;
    /// `key.slice(2).toLowerCase()` is in the generated 22-name `DELEGATED_EVENTS`
    IS_DELEGATED = 1;
    /// member of the generated `DOM_PROPS`
    IS_DOM_PROP = 2;
    IS_CLASS = 3;
    IS_STYLE = 4;
    /// `setElementAttr` kebab-cases every SVG attribute except these
    SVG_KEBAB_EXEMPT = 5;
});

pub struct TagRow<'a> {
    pub text: &'a str,
    pub flags: TagFlags,
}

pub struct NameRow<'a> {
    pub text: &'a str,
    pub flags: NameFlags,
}

/// After P1 no pass compares a tag or attribute string; it compares a `TagId` /
/// `NameId` or reads a flag bit.
///
/// Every bit that mirrors the runtime — `SVG_TAGS`, `DELEGATED_EVENTS`,
/// `DOM_PROPS`, the names `applyProp` intercepts, the two SVG attributes that
/// escape kebab-casing — comes off [`crate::tables`], which `build.rs` derives
/// from `packages/core/src/dom.ts` (§9). The tables declared below are the
/// remainder: HTML tree-construction facts, which no runtime edit can move.
pub struct Interner<'a> {
    allocator: &'a Allocator,
    str_ids: FxHashMap<&'a str, StrId>,
    strs: AVec<'a, &'a str>,
    tag_ids: FxHashMap<&'a str, TagId>,
    tags: AVec<'a, TagRow<'a>>,
    name_ids: FxHashMap<&'a str, NameId>,
    names: AVec<'a, NameRow<'a>>,
}

const VOID_TAGS: [&str; 15] = [
    "area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param",
    "source", "track", "wbr",
];

/// Tokenized in RAWTEXT (or, for `script`, script-data) state: markup inside
/// them is text and character references never resolve. `noscript` joins them
/// because template contents inherit the document's scripting flag, which is on
/// in every browser.
const RAW_TEXT_TAGS: [&str; 7] =
    ["iframe", "noembed", "noframes", "noscript", "script", "style", "xmp"];

const ESCAPABLE_RAW_TEXT_TAGS: [&str; 2] = ["textarea", "title"];

const NEWLINE_EATING_TAGS: [&str; 3] = ["pre", "textarea", "listing"];

/// `applyProp`'s test is `key[0] === "o" && key[1] === "n"`, and the name it
/// binds is `key.slice(2).toLowerCase()` — so `onceUpon` really does bind a
/// `ceupon` listener in this runtime, and the compiler has to agree.
pub fn event_name_of(text: &str) -> Option<String> {
    let rest = text.strip_prefix("on")?;
    Some(rest.to_ascii_lowercase())
}

/// Exposed because P1 has to know a tag's parser behaviour before it decides
/// whether the element may be interned at all.
pub fn tag_flags(text: &str) -> TagFlags {
    let mut flags = TagFlags::EMPTY;
    if crate::tables::is_svg_tag(text) {
        flags = flags | TagFlags::SVG;
    }
    if VOID_TAGS.contains(&text) {
        flags = flags | TagFlags::VOID;
    }
    if RAW_TEXT_TAGS.contains(&text) {
        flags = flags | TagFlags::RAW_TEXT;
    }
    if ESCAPABLE_RAW_TEXT_TAGS.contains(&text) {
        flags = flags | TagFlags::ESCAPABLE_RAW_TEXT;
    }
    if NEWLINE_EATING_TAGS.contains(&text) {
        flags = flags | TagFlags::PRESERVE_WS;
    }
    flags
}

fn name_flags(text: &str) -> NameFlags {
    let mut flags = NameFlags::EMPTY;
    if let Some(event) = event_name_of(text) {
        flags = flags | NameFlags::IS_EVENT;
        if crate::tables::is_delegated_event(&event) {
            flags = flags | NameFlags::IS_DELEGATED;
        }
    }
    if crate::tables::is_dom_prop(text) {
        flags = flags | NameFlags::IS_DOM_PROP;
    }
    if text == "class" || text == "className" {
        flags = flags | NameFlags::IS_CLASS;
    }
    if text == "style" {
        flags = flags | NameFlags::IS_STYLE;
    }
    if crate::tables::is_svg_kebab_exempt(text) {
        flags = flags | NameFlags::SVG_KEBAB_EXEMPT;
    }
    flags
}

impl<'a> Interner<'a> {
    pub fn new(allocator: &'a Allocator) -> Self {
        Self {
            allocator,
            str_ids: FxHashMap::default(),
            strs: AVec::new_in(&allocator),
            tag_ids: FxHashMap::default(),
            tags: AVec::new_in(&allocator),
            name_ids: FxHashMap::default(),
            names: AVec::new_in(&allocator),
        }
    }

    pub fn intern_str(&mut self, text: &str) -> StrId {
        if let Some(id) = self.str_ids.get(text) {
            return *id;
        }
        let text = self.allocator.alloc_str(text);
        let id = self.strs.len() as StrId;
        self.strs.push(text);
        self.str_ids.insert(text, id);
        id
    }

    /// The bytes are already in the arena — a source slice, or output of a
    /// compile-time escape — so no copy is made.
    pub fn intern_arena_str(&mut self, text: &'a str) -> StrId {
        if let Some(id) = self.str_ids.get(text) {
            return *id;
        }
        let id = self.strs.len() as StrId;
        self.strs.push(text);
        self.str_ids.insert(text, id);
        id
    }

    #[inline]
    pub fn str(&self, id: StrId) -> &'a str {
        self.strs[id as usize]
    }

    pub fn intern_tag(&mut self, text: &str) -> TagId {
        if let Some(id) = self.tag_ids.get(text) {
            return *id;
        }
        let flags = tag_flags(text);
        let text = self.allocator.alloc_str(text);
        let id = self.tags.len() as TagId;
        self.tags.push(TagRow { text, flags });
        self.tag_ids.insert(text, id);
        id
    }

    #[inline]
    pub fn tag(&self, id: TagId) -> &TagRow<'a> {
        &self.tags[id as usize]
    }

    pub fn intern_name(&mut self, text: &str) -> NameId {
        if let Some(id) = self.name_ids.get(text) {
            return *id;
        }
        let flags = name_flags(text);
        let text = self.allocator.alloc_str(text);
        let id = self.names.len() as NameId;
        self.names.push(NameRow { text, flags });
        self.name_ids.insert(text, id);
        id
    }

    #[inline]
    pub fn name(&self, id: NameId) -> &NameRow<'a> {
        &self.names[id as usize]
    }

    #[inline]
    pub fn tag_count(&self) -> usize {
        self.tags.len()
    }

    #[inline]
    pub fn name_count(&self) -> usize {
        self.names.len()
    }

    #[inline]
    pub fn str_count(&self) -> usize {
        self.strs.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interning_is_idempotent_per_table() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let a = interner.intern_tag("div");
        let b = interner.intern_tag("div");
        assert_eq!(a, b);
        assert_eq!(interner.tag_count(), 1);
        assert_eq!(interner.tag(a).text, "div");

        // Separate tables: a tag and an attribute may share a spelling without
        // sharing an id, and a `TagId` must never be read as a `NameId`.
        let name = interner.intern_name("div");
        assert_eq!(name, 0);
        assert_eq!(interner.name_count(), 1);
    }

    #[test]
    fn arena_strings_are_not_copied_again() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let text: &str = allocator.alloc_str("card card--lg dark");
        let id = interner.intern_arena_str(text);
        assert!(std::ptr::eq(interner.str(id), text));
        assert_eq!(interner.intern_str("card card--lg dark"), id);
        assert_eq!(interner.str_count(), 1);
    }

    #[test]
    fn html_parser_facts_are_carried_as_flags() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let br = interner.intern_tag("br");
        let script = interner.intern_tag("script");
        let textarea = interner.intern_tag("textarea");
        let div = interner.intern_tag("div");
        assert!(interner.tag(br).flags.contains(TagFlags::VOID));
        assert!(interner.tag(script).flags.contains(TagFlags::RAW_TEXT));
        assert!(interner.tag(textarea).flags.contains(TagFlags::ESCAPABLE_RAW_TEXT));
        assert!(interner.tag(textarea).flags.contains(TagFlags::PRESERVE_WS));
        assert_eq!(interner.tag(div).flags, TagFlags::EMPTY);
        let turbulence = interner.intern_tag("feTurbulence");
        assert!(interner.tag(turbulence).flags.contains(TagFlags::SVG));
    }

    #[test]
    fn name_flags_cover_the_channels_p1_routes_on() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let on_click = interner.intern_name("onClick");
        let class = interner.intern_name("class");
        let style = interner.intern_name("style");
        let view_box = interner.intern_name("viewBox");
        let title = interner.intern_name("title");
        assert!(interner.name(on_click).flags.contains(NameFlags::IS_EVENT));
        assert!(interner.name(class).flags.contains(NameFlags::IS_CLASS));
        assert!(interner.name(class).flags.contains(NameFlags::SVG_KEBAB_EXEMPT));
        assert!(interner.name(style).flags.contains(NameFlags::IS_STYLE));
        assert!(interner.name(view_box).flags.contains(NameFlags::SVG_KEBAB_EXEMPT));
        assert_eq!(interner.name(title).flags, NameFlags::EMPTY);
    }

    /// The bits DESIGN §9 says must be generated rather than transcribed. A
    /// hand table gets `onChange` wrong — it is NOT in this runtime's delegated
    /// set, and delegating it would emit a silently dead handler.
    #[test]
    fn the_dom_ts_derived_bits_come_off_the_generated_tables() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let on_click = interner.intern_name("onClick");
        let on_change = interner.intern_name("onChange");
        let value = interner.intern_name("value");
        let href = interner.intern_name("href");
        assert!(interner.name(on_click).flags.contains(NameFlags::IS_DELEGATED));
        assert!(interner.name(on_change).flags.contains(NameFlags::IS_EVENT));
        assert!(!interner.name(on_change).flags.contains(NameFlags::IS_DELEGATED));
        assert!(interner.name(value).flags.contains(NameFlags::IS_DOM_PROP));
        assert!(!interner.name(href).flags.contains(NameFlags::IS_DOM_PROP));

        assert_eq!(event_name_of("onPointerDown").as_deref(), Some("pointerdown"));
        assert_eq!(event_name_of("class"), None);
    }

    /// The successor to `STATEFUL_DIFF`, which was a NAME flag saying "never
    /// group this one". The same four names now resolve to a channel that
    /// threads its applied value, which is a statement about how the record slot
    /// is written rather than a veto on the record — B2 is exactly that
    /// difference. `ref` is off the list because it is no longer a name at all.
    #[test]
    fn the_names_whose_applied_value_differs_from_their_input_thread_it() {
        use crate::lower::names::channel_of;
        for name in ["class", "className", "style", "classList", "dangerouslySetInnerHTML"] {
            assert!(
                channel_of(name, false, "div").threads_prev(),
                "{name} applies a normalised value, so its record slot holds the channel's return"
            );
        }
        for name in ["title", "id", "href", "data-width"] {
            assert!(!channel_of(name, false, "div").threads_prev(), "{name}");
        }
    }

    #[test]
    fn flag_sets_union_and_test() {
        let both = TagFlags::VOID | TagFlags::RAW_TEXT;
        assert!(both.contains(TagFlags::VOID));
        assert!(both.contains(TagFlags::RAW_TEXT));
        assert!(both.contains(TagFlags::EMPTY));
        assert!(!both.contains(TagFlags::SVG));
        assert_eq!(both.bits(), 0b11);
    }
}
