/// How many base-36 digits of the hash a class name carries.
///
/// 36^7 is 7.8e10, so a 10,000-class project collides with probability ~6e-7.
/// The digits are the whole budget: every byte here is paid once per class in
/// the CSS file and once per occurrence in the markup.
const DIGITS: usize = 7;

const ALPHABET: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// FNV-1a, 64-bit, written out rather than taken from a crate.
///
/// This hash is OUTPUT, not an implementation detail: it names every class the
/// browser sees, every class a snapshot asserts, and every class an already-
/// deployed HTML page references. `FxHasher` and `DefaultHasher` both document
/// their algorithm as unstable, so either would silently rename every class in
/// the project on a dependency bump.
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn base36(mut value: u64) -> String {
    let mut digits = [b'0'; DIGITS];
    for digit in digits.iter_mut().rev() {
        *digit = ALPHABET[(value % 36) as usize];
        value /= 36;
    }
    String::from_utf8(digits.to_vec()).expect("base36 alphabet is ASCII")
}

/// The generated class or `@keyframes` name.
///
/// Derived from the block's canonical text and nothing else, so two identical
/// blocks in two modules produce one class without any cross-module state — the
/// build-level aggregation that makes StyleX's Vite dev path diverge from its
/// production path is not needed to get the dedup.
pub fn name(prefix: &str, debug_name: Option<&str>, canonical: &str) -> String {
    let hash = base36(fnv1a(canonical.as_bytes()));
    match debug_name {
        Some(debug_name) => format!("{}_{hash}", ident(debug_name, prefix)),
        None => format!("{prefix}{hash}"),
    }
}

/// A JS binding name is not a CSS identifier: `$button` and `2col` are both
/// valid on the left of a `const` and neither can start a class.
fn ident(name: &str, prefix: &str) -> String {
    let mut out = String::with_capacity(name.len() + prefix.len());
    for character in name.chars() {
        if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
            out.push(character);
        } else {
            out.push('_');
        }
    }
    let leads = out.chars().next().is_some_and(|first| first.is_ascii_alphabetic() || first == '_');
    if leads { out } else { format!("{prefix}{out}") }
}

#[cfg(test)]
mod tests {
    use super::name;

    #[test]
    fn the_same_block_is_the_same_class_in_any_module() {
        assert_eq!(name("b", None, "color:red"), name("b", None, "color:red"));
        assert_ne!(name("b", None, "color:red"), name("b", None, "color:blue"));
    }

    #[test]
    fn a_class_always_starts_with_something_css_can_parse() {
        assert!(name("b", None, "color:red").starts_with('b'));
        assert!(name("b", Some("2col"), "color:red").starts_with("b2col_"));
        assert!(name("b", Some("$button"), "color:red").starts_with("_button_"));
        assert!(name("b", Some("cardStyle"), "color:red").starts_with("cardStyle_"));
    }

    #[test]
    fn the_debug_name_does_not_change_which_block_a_hash_belongs_to() {
        let anonymous = name("b", None, "color:red");
        let named = name("b", Some("card"), "color:red");
        assert_eq!(named, format!("card_{}", anonymous.trim_start_matches('b')));
    }
}
