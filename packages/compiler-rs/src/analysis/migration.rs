//! Spellings from Solid 1.x that Solid 2.0, and so barq, does not have.
//!
//! Each one still parses and most still type-check somewhere (a `.jsx` file, a
//! custom element, which takes any attribute), and each compiles to something
//! that silently does the wrong thing: `<Theme.Provider>` calls `undefined`,
//! `classList={{ … }}` writes `classlist="[object Object]"`, and `on:click`
//! writes an attribute instead of binding a listener. So they are reported
//! where they are written, with the 2.0 spelling.

use oxc::ast::ast::{
    JSXAttributeItem, JSXAttributeName, JSXElementName, JSXMemberExpressionObject,
    JSXOpeningElement, Program,
};
use oxc::ast_visit::{Visit, walk};
use oxc::semantic::Scoping;
use oxc::span::Span;

use crate::diag::Code;
use crate::ir::Module;

pub struct Removed {
    pub code: Code,
    pub span: Span,
    pub message: String,
}

pub fn scan(program: &Program<'_>, module: &Module<'_>) -> Vec<Removed> {
    let mut scan = Scan { scoping: &module.scoping, module, found: Vec::new() };
    scan.visit_program(program);
    scan.found
}

struct Scan<'m, 'a> {
    scoping: &'m Scoping,
    module: &'m Module<'a>,
    found: Vec<Removed>,
}

impl<'a> Visit<'a> for Scan<'_, 'a> {
    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        match &it.name {
            JSXElementName::Identifier(_) => self.intrinsic(it),
            JSXElementName::NamespacedName(_) => self.intrinsic(it),
            JSXElementName::MemberExpression(member) if member.property.name == "Provider" => {
                if let JSXMemberExpressionObject::IdentifierReference(object) = &member.object
                    && let Some(symbol) = object
                        .reference_id
                        .get()
                        .and_then(|id| self.scoping.get_reference(id).symbol_id())
                    && self.module.env.contexts.contains(&symbol)
                {
                    let name = object.name.as_str();
                    self.found.push(Removed {
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
    fn intrinsic(&mut self, it: &JSXOpeningElement<'_>) {
        for item in &it.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else { continue };
            match &attribute.name {
                JSXAttributeName::Identifier(name) if name.name == "classList" => {
                    self.found.push(Removed {
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
