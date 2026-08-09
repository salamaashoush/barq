use oxc::allocator::Allocator;

/// Bytes the HTML parser does not hand back. The input-stream preprocessor
/// normalises CR and CRLF to LF, and U+0000 is either replaced by U+FFFD (every
/// attribute-value and RAWTEXT state) or dropped outright ("in body"), so
/// neither survives a template the way `setAttribute` and `createTextNode` keep
/// it. Text carrying one goes down the patch channel instead, which is the
/// un-compiled path byte for byte.
///
/// Reached through `&#0;` and `&#13;` as well as through raw bytes, so this is
/// asked of the BAKED text, after references are resolved.
pub fn rewritten_by_the_tokenizer(text: &str) -> bool {
    text.contains('\0') || text.contains('\r')
}

/// JSX text cleaning, as every JSX transform implements it: lines are joined
/// with a single space, interior indentation is dropped, and a run that reduces
/// to nothing disappears. The oracle is `jsxImportSource` through bun's own
/// transform, so any deviation here is a divergence in the very first text node.
///
/// A single-line run is returned untouched — including one that is entirely
/// spaces, which is what keeps the space in `<span>a</span> <span>b</span>`.
pub fn clean<'a>(raw: &'a str, allocator: &'a Allocator) -> Option<&'a str> {
    if !raw.as_bytes().iter().any(|b| matches!(b, b'\n' | b'\r' | b'\t')) {
        return (!raw.is_empty()).then_some(raw);
    }

    let lines = split_lines(raw);
    let last_non_empty =
        lines.iter().rposition(|line| line.bytes().any(|b| b != b' ' && b != b'\t')).unwrap_or(0);

    let mut out = String::with_capacity(raw.len());
    for (index, line) in lines.iter().enumerate() {
        let detabbed;
        let mut piece: &str = if line.contains('\t') {
            detabbed = line.replace('\t', " ");
            &detabbed
        } else {
            line
        };
        if index > 0 {
            piece = piece.trim_start_matches(' ');
        }
        if index + 1 < lines.len() {
            piece = piece.trim_end_matches(' ');
        }
        if piece.is_empty() {
            continue;
        }
        out.push_str(piece);
        if index != last_non_empty {
            out.push(' ');
        }
    }

    (!out.is_empty()).then(|| allocator.alloc_str(&out) as &str)
}

fn split_lines(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let bytes = text.as_bytes();
    let mut start = 0;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' => {
                lines.push(&text[start..index]);
                index += if bytes.get(index + 1) == Some(&b'\n') { 2 } else { 1 };
                start = index;
            }
            b'\n' => {
                lines.push(&text[start..index]);
                index += 1;
                start = index;
            }
            _ => index += 1,
        }
    }
    lines.push(&text[start..]);
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cleaned(raw: &str) -> Option<String> {
        let allocator = Allocator::new();
        let raw = allocator.alloc_str(raw);
        clean(raw, &allocator).map(ToString::to_string)
    }

    #[test]
    fn indentation_between_elements_disappears() {
        assert_eq!(cleaned("\n      "), None);
        assert_eq!(cleaned("\n  \n   "), None);
    }

    #[test]
    fn a_single_line_run_survives_verbatim_including_a_lone_space() {
        assert_eq!(cleaned(" ").as_deref(), Some(" "));
        assert_eq!(cleaned(": ").as_deref(), Some(": "));
        assert_eq!(cleaned("").as_deref(), None);
    }

    #[test]
    fn a_leading_newline_is_stripped_and_the_line_is_left_trimmed() {
        assert_eq!(cleaned("\n      clicked ").as_deref(), Some("clicked "));
        assert_eq!(cleaned("\n      Hello, ").as_deref(), Some("Hello, "));
    }

    #[test]
    fn lines_join_with_exactly_one_space_and_pre_gets_no_exemption() {
        assert_eq!(cleaned("  indented\n  lines  kept").as_deref(), Some("  indented lines  kept"));
        assert_eq!(cleaned("a\nb\nc").as_deref(), Some("a b c"));
        assert_eq!(cleaned("a\n\nb").as_deref(), Some("a b"));
    }

    #[test]
    fn entities_are_left_alone_so_the_html_parser_decodes_them() {
        assert_eq!(
            cleaned("\n      a &lt; b &amp;&amp; c\n    ").as_deref(),
            Some("a &lt; b &amp;&amp; c")
        );
    }

    #[test]
    fn tabs_count_as_spaces() {
        assert_eq!(cleaned("\n\t\t").as_deref(), None);
        assert_eq!(cleaned("x\n\ty").as_deref(), Some("x y"));
    }
}
