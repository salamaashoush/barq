//! Spellings from Solid 1.x that Solid 2.0, and so barq, does not have.
//!
//! Each one still parses and most still type-check somewhere (a `.jsx` file, a
//! custom element, which takes any attribute), and each compiles to something
//! that silently does the wrong thing: `<Theme.Provider>` calls `undefined`,
//! `classList={{ … }}` writes `classlist="[object Object]"`, `on:click`
//! writes an attribute instead of binding a listener, and `<Dynamic>` imports a
//! name that is not there. So they are reported where they are written, with
//! the 2.0 spelling.

use oxc::ast::ast::{
    JSXAttributeItem, JSXAttributeName, JSXElement, JSXElementName, JSXMemberExpressionObject,
    JSXOpeningElement, Program,
};
use oxc::ast_visit::{Visit, walk};
use oxc::semantic::Scoping;
use oxc::span::{GetSpan, Span};

use crate::diag::Code;
use crate::ir::{Module, Prim, SourceKind};

pub struct Removed {
    pub code: Code,
    pub span: Span,
    pub message: String,
    /// The spans to replace and what with, when the repair is one spelling.
    pub fix: Vec<(Span, String)>,
}

pub fn scan(program: &Program<'_>, module: &Module<'_>) -> Vec<Removed> {
    let mut scan = Scan { scoping: &module.scoping, module, found: Vec::new(), closing: None };
    scan.visit_program(program);
    scan.found
}

struct Scan<'m, 'a> {
    scoping: &'m Scoping,
    module: &'m Module<'a>,
    found: Vec<Removed>,
    /// The closing tag's name of the element whose opening tag is next.
    closing: Option<Span>,
}

impl<'a> Visit<'a> for Scan<'_, 'a> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.closing = it.closing_element.as_ref().map(|closing| closing.name.span());
        walk::walk_jsx_element(self, it);
    }

    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        let closing = self.closing.take();
        match &it.name {
            JSXElementName::Identifier(_) => self.intrinsic(it),
            JSXElementName::NamespacedName(_) => self.intrinsic(it),
            JSXElementName::IdentifierReference(tag) => {
                let removed = tag
                    .reference_id
                    .get()
                    .and_then(|id| self.scoping.get_reference(id).symbol_id())
                    .is_some_and(|symbol| {
                        self.module.env.kind_of(symbol)
                            == SourceKind::Primitive(Prim::RemovedDynamic)
                    });
                if removed {
                    self.dynamic(tag.span);
                }
            }
            JSXElementName::MemberExpression(member)
                if member.property.name == "Dynamic"
                    && matches!(
                        &member.object,
                        JSXMemberExpressionObject::IdentifierReference(object)
                            if object
                                .reference_id
                                .get()
                                .and_then(|id| self.scoping.get_reference(id).symbol_id())
                                .is_some_and(|symbol| self.module.env.namespaces.contains(&symbol))
                    ) =>
            {
                self.dynamic(member.span);
            }
            JSXElementName::MemberExpression(member) if member.property.name == "Provider" => {
                if let JSXMemberExpressionObject::IdentifierReference(object) = &member.object
                    && let Some(symbol) = object
                        .reference_id
                        .get()
                        .and_then(|id| self.scoping.get_reference(id).symbol_id())
                    && self.module.env.contexts.contains(&symbol)
                {
                    let name = object.name.as_str();
                    let fix = std::iter::once(member.span)
                        .chain(closing)
                        .map(|span| (span, name.to_string()))
                        .collect();
                    self.found.push(Removed {
                        fix,
                        code: Code::Barq022,
                        span: member.span,
                        message: format!(
                            "`{name}` is a context, and a context is its own provider: write \
                             `<{name} value={{…}}>` instead of `<{name}.Provider value={{…}}>`. \
                             A context has no `Provider` member."
                        ),
                    });
                }
            }
            _ => {}
        }
        walk::walk_jsx_opening_element(self, it);
    }
}

impl Scan<'_, '_> {
    fn dynamic(&mut self, span: Span) {
        self.found.push(Removed {
            fix: Vec::new(),
            code: Code::Barq025,
            span,
            message: "`<Dynamic>` is not exported by barq: Solid 2.0 deprecates it in favour of \
                      the `dynamic` factory, which is all barq has. Hoist one to the component \
                      body, or to the module when the choice reads only module state: \
                      `const Chosen = dynamic(() => …)` with what `component` held, then render \
                      `<Chosen …/>` with the other props."
                .to_string(),
        });
    }

    fn intrinsic(&mut self, it: &JSXOpeningElement<'_>) {
        for item in &it.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else { continue };
            match &attribute.name {
                JSXAttributeName::Identifier(name) if name.name == "classList" => {
                    self.found.push(Removed {
                        fix: vec![(name.span, "class".to_string())],
                        code: Code::Barq023,
                        span: name.span,
                        message: "`classList` is an ordinary attribute name, so this object \
                                  would be written as the text `[object Object]`. Pass it to \
                                  `class`, which takes a map of names to whether each applies, or \
                                  a list of names and maps: `class={[\"card\", { active: on() }]}`."
                            .to_string(),
                    });
                }
                JSXAttributeName::NamespacedName(name) => {
                    let prefix = name.namespace.name.as_str();
                    let local = name.name.name.as_str();
                    let Some(fix) = namespace_fix(prefix, local) else { continue };
                    self.found.push(Removed {
                        fix: namespace_rename(prefix, local)
                            .map(|renamed| (name.span, renamed))
                            .into_iter()
                            .collect(),
                        code: Code::Barq024,
                        span: name.span,
                        message: format!(
                            "`{prefix}:` is not a namespace, so `{prefix}:{local}` would be \
                             written as an attribute of that name. {fix}"
                        ),
                    });
                }
                _ => {}
            }
        }
    }
}

/// The 2.0 spelling for each prefix Solid 1.x gave a meaning. `prop:` and
/// `bind:` are barq's own and keep theirs; any other prefix (`xlink:`) is part
/// of an attribute's name and always was.
fn namespace_fix(prefix: &str, local: &str) -> Option<String> {
    let camel = camel_event(local);
    Some(match prefix {
        "on" => format!(
            "Bind the event with `on{camel}={{handler}}`. For an event name that is not one \
             word, or for listener options, add the listener in a ref: \
             `ref={{(el) => el.addEventListener(\"{local}\", handler)}}`."
        ),
        "capture" | "oncapture" => format!(
            "Bind the capture phase with `on{camel}Capture={{handler}}`, or add the listener \
             in a ref with `{{ capture: true }}`."
        ),
        "attr" => format!("Write the attribute by its own name: `{local}={{…}}`."),
        "bool" => format!(
            "Write the attribute by its own name: `{local}={{on()}}` adds it for `true` and \
             removes it for `false`."
        ),
        "style" => {
            format!("Set the property in the `style` object: `style={{{{ \"{local}\": … }}}}`.")
        }
        "class" => {
            format!("Toggle the class in the `class` map: `class={{{{ \"{local}\": on() }}}}`.")
        }
        "use" => format!(
            "A directive is a ref: `ref={{{local}(…)}}`, and several compose as \
             `ref={{[{local}(…), other]}}`."
        ),
        _ => return None,
    })
}

/// The one name `prefix:local` becomes, for the namespaces whose repair is a
/// rename. An event keeps to a single lowercase word, since a hyphenated or
/// cased event name has no `on…` spelling.
fn namespace_rename(prefix: &str, local: &str) -> Option<String> {
    let word = !local.is_empty() && local.bytes().all(|byte| byte.is_ascii_lowercase());
    match prefix {
        "on" if word => Some(format!("on{}", camel_event(local))),
        "capture" | "oncapture" if word => Some(format!("on{}Capture", camel_event(local))),
        "attr" | "bool" => Some(local.to_string()),
        _ => None,
    }
}

fn camel_event(local: &str) -> String {
    let mut out = String::with_capacity(local.len());
    let mut upper = true;
    for ch in local.chars() {
        if ch == '-' {
            upper = true;
            continue;
        }
        if upper {
            out.extend(ch.to_uppercase());
            upper = false;
        } else {
            out.push(ch);
        }
    }
    out
}
