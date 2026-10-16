use std::borrow::Cow;

/// The 96 HTML4 Latin-1 names, in code-point order, so 160..=255 is an index
/// rather than 96 transcribed numbers.
const LATIN1: [&str; 96] = [
    "nbsp", "iexcl", "cent", "pound", "curren", "yen", "brvbar", "sect", "uml", "copy", "ordf",
    "laquo", "not", "shy", "reg", "macr", "deg", "plusmn", "sup2", "sup3", "acute", "micro",
    "para", "middot", "cedil", "sup1", "ordm", "raquo", "frac14", "frac12", "frac34", "iquest",
    "Agrave", "Aacute", "Acirc", "Atilde", "Auml", "Aring", "AElig", "Ccedil", "Egrave", "Eacute",
    "Ecirc", "Euml", "Igrave", "Iacute", "Icirc", "Iuml", "ETH", "Ntilde", "Ograve", "Oacute",
    "Ocirc", "Otilde", "Ouml", "times", "Oslash", "Ugrave", "Uacute", "Ucirc", "Uuml", "Yacute",
    "THORN", "szlig", "agrave", "aacute", "acirc", "atilde", "auml", "aring", "aelig", "ccedil",
    "egrave", "eacute", "ecirc", "euml", "igrave", "iacute", "icirc", "iuml", "eth", "ntilde",
    "ograve", "oacute", "ocirc", "otilde", "ouml", "divide", "oslash", "ugrave", "uacute", "ucirc",
    "uuml", "yacute", "thorn", "yuml",
];

const NAMED: [(&str, u32); 82] = [
    ("Dagger", 8225),
    ("OElig", 338),
    ("Prime", 8243),
    ("Scaron", 352),
    ("Yuml", 376),
    ("amp", 38),
    ("apos", 39),
    ("bdquo", 8222),
    ("bull", 8226),
    ("cap", 8745),
    ("circ", 710),
    ("clubs", 9827),
    ("crarr", 8629),
    ("cup", 8746),
    ("dArr", 8659),
    ("dagger", 8224),
    ("darr", 8595),
    ("diams", 9830),
    ("emsp", 8195),
    ("ensp", 8194),
    ("equiv", 8801),
    ("euro", 8364),
    ("fnof", 402),
    ("frasl", 8260),
    ("ge", 8805),
    ("gt", 62),
    ("hArr", 8660),
    ("harr", 8596),
    ("hearts", 9829),
    ("hellip", 8230),
    ("infin", 8734),
    ("int", 8747),
    ("lArr", 8656),
    ("lang", 9001),
    ("larr", 8592),
    ("lceil", 8968),
    ("ldquo", 8220),
    ("le", 8804),
    ("lfloor", 8970),
    ("lowast", 8727),
    ("loz", 9674),
    ("lrm", 8206),
    ("lsaquo", 8249),
    ("lsquo", 8216),
    ("lt", 60),
    ("mdash", 8212),
    ("minus", 8722),
    ("ndash", 8211),
    ("ne", 8800),
    ("oelig", 339),
    ("oline", 8254),
    ("oplus", 8853),
    ("otimes", 8855),
    ("permil", 8240),
    ("perp", 8869),
    ("prime", 8242),
    ("quot", 34),
    ("rArr", 8658),
    ("radic", 8730),
    ("rang", 9002),
    ("rarr", 8594),
    ("rceil", 8969),
    ("rdquo", 8221),
    ("rfloor", 8971),
    ("rlm", 8207),
    ("rsaquo", 8250),
    ("rsquo", 8217),
    ("sbquo", 8218),
    ("scaron", 353),
    ("sdot", 8901),
    ("spades", 9824),
    ("sub", 8834),
    ("sube", 8838),
    ("sup", 8835),
    ("supe", 8839),
    ("thinsp", 8201),
    ("tilde", 732),
    ("trade", 8482),
    ("uArr", 8657),
    ("uarr", 8593),
    ("zwj", 8205),
    ("zwnj", 8204),
];

fn code_point(name: &str) -> Option<u32> {
    if let Some(index) = LATIN1.iter().position(|entry| *entry == name) {
        return Some(160 + index as u32);
    }
    NAMED.binary_search_by_key(&name, |entry| entry.0).ok().map(|index| NAMED[index].1)
}

/// Resolves JSX character references, which `oxc` leaves in the token
/// (`JSXText::value == JSXText::raw`) but every JSX *transform* — including the
/// oracle's — decodes before it reaches `createTextNode`.
///
/// `None` means the text carries a reference this table does not know. The
/// caller then keeps the raw bytes, where the HTML parser resolves them against
/// the full HTML5 table; that is what the DOM path did before this existed and
/// it is still right in a browser.
pub fn decode(raw: &str) -> Option<Cow<'_, str>> {
    if !raw.contains('&') {
        return Some(Cow::Borrowed(raw));
    }

    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let tail = &rest[start + 1..];
        let end = tail.find(';')?;
        let name = &tail[..end];
        let point =
            if let Some(digits) = name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
                u32::from_str_radix(digits, 16).ok()?
            } else if let Some(digits) = name.strip_prefix('#') {
                digits.parse::<u32>().ok()?
            } else {
                code_point(name)?
            };
        out.push(char::from_u32(point)?);
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    Some(Cow::Owned(out))
}

/// Text content for a double-quoted attribute value.
pub fn escape_attribute(text: &str) -> Cow<'_, str> {
    escape(text, |byte| matches!(byte, b'&' | b'"'))
}

/// Text content for an element whose children the parser resolves references in.
///
/// `>` is escaped although no conforming tokenizer needs it to be: it is what
/// the HTML serialization spec writes, and a bare `>` in template text is a byte
/// that DOES move real parsers apart — happy-dom splits the run there, Chrome
/// does not, which puts a different node under `firstChild.nextSibling` in the
/// two engines and lets a wrong walk pass the fake-DOM half of the harness.
pub fn escape_text(text: &str) -> Cow<'_, str> {
    escape(text, |byte| matches!(byte, b'&' | b'<' | b'>'))
}

fn escape(text: &str, needs: fn(u8) -> bool) -> Cow<'_, str> {
    if !text.bytes().any(needs) {
        return Cow::Borrowed(text);
    }
    let mut out = String::with_capacity(text.len() + 8);
    for character in text.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' if needs(b'<') => out.push_str("&lt;"),
            '>' if needs(b'>') => out.push_str("&gt;"),
            '"' if needs(b'"') => out.push_str("&quot;"),
            other => out.push(other),
        }
    }
    Cow::Owned(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_named_table_is_sorted_and_the_latin1_block_is_contiguous() {
        assert!(NAMED.windows(2).all(|pair| pair[0].0 < pair[1].0));
        assert_eq!(LATIN1.len(), 96);
        assert_eq!(code_point("nbsp"), Some(160));
        assert_eq!(code_point("yuml"), Some(255));
        assert_eq!(code_point("copy"), Some(169));
        assert_eq!(code_point("eacute"), Some(233));
    }

    #[test]
    fn references_resolve_to_the_characters_the_oracle_produces() {
        assert_eq!(decode("a &lt; b &amp;&amp; c").as_deref(), Some("a < b && c"));
        assert_eq!(decode("&copy; &nbsp; &gt;").as_deref(), Some("© \u{a0} >"));
        assert_eq!(decode("&#65;&#x42;").as_deref(), Some("AB"));
        assert_eq!(decode("plain").as_deref(), Some("plain"));
    }

    #[test]
    fn an_unknown_reference_hands_the_text_back_to_the_html_parser() {
        assert!(decode("&CounterClockwiseContourIntegral;").is_none());
        assert!(decode("a & b").is_none());
    }

    /// The reason this module exists. `oxc` hands JSX text and JSX attribute
    /// values back with their character references intact — `value == raw` —
    /// where the oracle's transform has already resolved them. If oxc ever
    /// starts resolving them, `bake_text` would decode a second time.
    #[test]
    fn oxc_leaves_character_references_in_the_token() {
        use oxc::allocator::Allocator;
        use oxc::ast::ast::{Expression, JSXAttributeItem, JSXAttributeValue, JSXChild, Statement};
        use oxc::parser::Parser;
        use oxc::span::SourceType;

        let allocator = Allocator::new();
        let source = "const v = <div title=\"a &amp; b\">x &lt; y &copy;</div>;";
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let Statement::VariableDeclaration(declaration) = &parsed.program.body[0] else {
            panic!("expected a declaration")
        };
        let Some(Expression::JSXElement(element)) = &declaration.declarations[0].init else {
            panic!("expected a JSX element")
        };

        let JSXAttributeItem::Attribute(attribute) = &element.opening_element.attributes[0] else {
            panic!("expected an attribute")
        };
        let Some(JSXAttributeValue::StringLiteral(literal)) = &attribute.value else {
            panic!("expected a string literal")
        };
        assert_eq!(literal.value.as_str(), "a &amp; b");

        let JSXChild::Text(text) = &element.children[0] else { panic!("expected text") };
        assert_eq!(text.value.as_str(), "x &lt; y &copy;");
        assert_eq!(text.raw.map(|raw| raw.as_str()), Some(text.value.as_str()));
        assert_eq!(decode(text.value.as_str()).as_deref(), Some("x < y ©"));
    }

    #[test]
    fn escaping_is_minimal_and_context_aware() {
        assert_eq!(escape_text("a < b & c").as_ref(), "a &lt; b &amp; c");
        assert_eq!(escape_text("plain \" quote").as_ref(), "plain \" quote");
        // Not the tokenizer's requirement — the serialization spec's, and the
        // byte that makes happy-dom and Chrome disagree about how many text
        // nodes a run is.
        assert_eq!(escape_text("a > b").as_ref(), "a &gt; b");
        assert_eq!(escape_attribute("a > b").as_ref(), "a > b");
        assert_eq!(escape_attribute("say \"hi\" & bye").as_ref(), "say &quot;hi&quot; &amp; bye");
        assert_eq!(escape_attribute("a < b").as_ref(), "a < b");
    }
}
