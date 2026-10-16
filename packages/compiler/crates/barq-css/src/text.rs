/// Canonical form of a slice of CSS source: comments become a separator, runs
/// of whitespace outside strings collapse to one space, whitespace around the
/// three delimiters that can never be part of a token is dropped, and every
/// template placeholder is replaced by the text the caller folded its
/// expression to.
///
/// Collapsing rather than deleting is the rule. Whitespace is a token separator
/// in CSS — `a :hover` and `a:hover` select different elements, `translate(1px
/// 2px)` needs its space, and a comment between two identifiers separates them
/// the same way — so nothing here may join two characters the author kept
/// apart. `{`, `}` and `;` are the exception and are tightened, because none of
/// the three can appear in an identifier, a number or an unquoted `url()`, so
/// no token can be lengthened by removing the space beside one. `:` and `,` are
/// left alone: `a :hover` and `a:hover` select different elements, and a
/// custom property's value is a token stream whose text is substituted as
/// written. Real minification is Vite's `build.cssMinify`, which is
/// lightningcss and knows the grammar; this only has to be stable, because the
/// class name is a hash of it.
pub fn canonical_into(source: &str, holes: &[&str], out: &mut String) {
    let bytes = source.as_bytes();
    let mut index = 0;
    let mut owed_space = false;
    let mut wrote = false;

    while index < bytes.len() {
        match bytes[index] {
            b' ' | b'\t' | b'\n' | b'\r' | 0x0c => {
                owed_space = true;
                index += 1;
            }
            b'/' if bytes.get(index + 1) == Some(&b'*') => {
                let mut end = index + 2;
                while end + 1 < bytes.len() && !(bytes[end] == b'*' && bytes[end + 1] == b'/') {
                    end += 1;
                }
                index = (end + 2).min(bytes.len());
                owed_space = true;
            }
            quote @ (b'"' | b'\'') => {
                let start = index;
                index += 1;
                while index < bytes.len() {
                    if bytes[index] == b'\\' {
                        index += 2;
                        continue;
                    }
                    if bytes[index] == quote {
                        index += 1;
                        break;
                    }
                    index += 1;
                }
                let end = index.min(source.len());
                push(out, &source[start..end], &mut owed_space, &mut wrote);
            }
            b'`' => {
                let start = index + 1;
                let mut end = start;
                while end < bytes.len() && bytes[end] != b'`' {
                    end += 1;
                }
                let text = source[start..end.min(source.len())]
                    .strip_prefix(crate::PLACEHOLDER_PREFIX)
                    .and_then(|digits| digits.parse::<usize>().ok())
                    .and_then(|slot| holes.get(slot).copied())
                    .unwrap_or_default();
                index = (end + 1).min(bytes.len());
                push(out, text, &mut owed_space, &mut wrote);
            }
            delimiter @ (b'{' | b'}' | b';') => {
                owed_space = false;
                out.push(char::from(delimiter));
                wrote = true;
                index += 1;
                // Whatever follows joins the delimiter directly.
                while index < bytes.len()
                    && matches!(bytes[index], b' ' | b'\t' | b'\n' | b'\r' | 0x0c)
                {
                    index += 1;
                }
            }
            _ => {
                let start = index;
                while index < bytes.len()
                    && !matches!(
                        bytes[index],
                        b' ' | b'\t'
                            | b'\n'
                            | b'\r'
                            | 0x0c
                            | b'"'
                            | b'\''
                            | b'`'
                            | b'{'
                            | b'}'
                            | b';'
                    )
                    && !(bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*'))
                {
                    index += 1;
                }
                push(out, &source[start..index], &mut owed_space, &mut wrote);
            }
        }
    }
}

/// A hole that folded to nothing leaves the separator it was standing in owed,
/// so `margin: 0 ${gap} 0` does not become `margin: 0 0`.
fn push(out: &mut String, text: &str, owed_space: &mut bool, wrote: &mut bool) {
    if text.is_empty() {
        return;
    }
    if *owed_space && *wrote {
        out.push(' ');
    }
    *owed_space = false;
    *wrote = true;
    out.push_str(text);
}

pub fn canonical(source: &str, holes: &[&str]) -> String {
    let mut out = String::with_capacity(source.len());
    canonical_into(source, holes, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::canonical;

    #[test]
    fn collapses_whitespace_without_joining_tokens() {
        assert_eq!(canonical("  color:\n   red  ", &[]), "color: red");
        assert_eq!(canonical("a  :hover", &[]), "a :hover");
        assert_eq!(
            canonical("transform:translate(1px   2px)", &[]),
            "transform:translate(1px 2px)"
        );
    }

    #[test]
    fn a_comment_separates_the_tokens_it_stood_between() {
        assert_eq!(canonical("a/**/b", &[]), "a b");
        assert_eq!(canonical("color:/* note */red", &[]), "color: red");
        assert_eq!(canonical("/* leading */color:red", &[]), "color:red");
    }

    /// The regex parser this replaces splits on `;` and `{`, so a string
    /// carrying either of them ended the declaration early.
    /// A comment standing where a delimiter already separates costs nothing.
    #[test]
    fn the_three_delimiters_take_no_surrounding_space() {
        assert_eq!(
            canonical("from { opacity: 0 }  to { opacity: 1 }", &[]),
            "from{opacity: 0}to{opacity: 1}"
        );
        assert_eq!(canonical("a ; b", &[]), "a;b");
        assert_eq!(
            canonical(r#"content: "a } b" ; color: red"#, &[]),
            r#"content: "a } b";color: red"#
        );
    }

    #[test]
    fn a_string_survives_byte_for_byte() {
        assert_eq!(canonical(r#"content: "a;b{c}  d""#, &[]), r#"content: "a;b{c}  d""#);
        assert_eq!(canonical(r#"content: 'it\'s'"#, &[]), r#"content: 'it\'s'"#);
    }

    #[test]
    fn a_placeholder_takes_the_text_the_caller_folded_it_to() {
        assert_eq!(canonical("color: `BARQ-0`", &["red"]), "color: red");
        assert_eq!(canonical("margin: 0 `BARQ-0` 0", &["var(--gap)"]), "margin: 0 var(--gap) 0");
        assert_eq!(canonical("margin: 0 `BARQ-0` 0", &[""]), "margin: 0 0");
        assert_eq!(canonical("width: `BARQ-0`px", &["12"]), "width: 12px");
    }

    /// An unquoted `url()` may carry `;`, `:` and `//`, which is what broke the
    /// regex on every data URI.
    #[test]
    fn an_unquoted_url_is_not_a_comment_and_not_a_terminator() {
        let source = "background: url(data:image/svg+xml;base64,AA//BB)";
        assert_eq!(canonical(source, &[]), source);
    }
}
