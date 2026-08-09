use oxc::allocator::Allocator;
use oxc::ast::ast::Expression;
use oxc::span::Span;

use super::{AVec, ExprId, PartRange, Rx, StrId};

pub struct ExprTable<'a> {
    pub entries: AVec<'a, ExprEntry<'a>>,
    /// backing store for `Op::SetClass` ranges
    pub parts: AVec<'a, ClassPart>,
}

pub struct ExprEntry<'a> {
    pub src: ExprSrc<'a>,
    pub span: Span,
    pub rx: Rx<'a>,
}

/// The expression is OWNED. P1 moves the parsed node straight out of the JSX it
/// is deleting, so nothing is cloned and the original `Span` survives into the
/// emitted AST, which is what makes the sourcemap byte-exact (§6.1). A shared
/// borrow could never do this: P8 hands the node to `oxc_codegen` by value.
pub enum ExprSrc<'a> {
    /// The node the parser produced, unmodified.
    Verbatim(Expression<'a>),
    /// Built by the compiler in the same arena: thunks, shaped control-flow
    /// calls, merged prop objects, SSR row specialisations.
    Built(Expression<'a>),
    /// Folded away by P3 — the bytes now live in the skeleton.
    Folded(StrId),
}

impl<'a> ExprSrc<'a> {
    #[inline]
    pub fn expression(&self) -> Option<&Expression<'a>> {
        match self {
            ExprSrc::Verbatim(expression) | ExprSrc::Built(expression) => Some(expression),
            ExprSrc::Folded(_) => None,
        }
    }

    #[inline]
    pub fn expression_mut(&mut self) -> Option<&mut Expression<'a>> {
        match self {
            ExprSrc::Verbatim(expression) | ExprSrc::Built(expression) => Some(expression),
            ExprSrc::Folded(_) => None,
        }
    }

    /// Moves the node out on the way into the emitted AST, leaving the entry
    /// behind as `Folded` — the same state P3 leaves it in. `ExprId`s stay valid.
    #[inline]
    pub fn take(&mut self) -> Option<Expression<'a>> {
        match std::mem::replace(self, ExprSrc::Folded(super::NONE)) {
            ExprSrc::Verbatim(expression) | ExprSrc::Built(expression) => Some(expression),
            folded @ ExprSrc::Folded(_) => {
                *self = folded;
                None
            }
        }
    }

    /// A folded entry emits nothing; the patch that referenced it is deleted.
    #[inline]
    pub fn is_folded(&self) -> bool {
        matches!(self, ExprSrc::Folded(_))
    }
}

#[derive(Clone, Copy)]
pub struct ClassPart {
    pub value: ExprId,
    pub gate: Option<ExprId>,
    pub name: Option<StrId>,
}

impl<'a> ExprTable<'a> {
    pub fn new_in(allocator: &'a Allocator) -> Self {
        Self { entries: AVec::new_in(&allocator), parts: AVec::new_in(&allocator) }
    }

    /// P1 stores every expression as an unclassified `Verbatim` borrow. No AST is
    /// ever cloned.
    pub fn push(&mut self, src: ExprSrc<'a>, span: Span, rx: Rx<'a>) -> ExprId {
        let id = self.entries.len() as ExprId;
        self.entries.push(ExprEntry { src, span, rx });
        id
    }

    #[inline]
    pub fn entry(&self, id: ExprId) -> &ExprEntry<'a> {
        &self.entries[id as usize]
    }

    #[inline]
    pub fn entry_mut(&mut self, id: ExprId) -> &mut ExprEntry<'a> {
        &mut self.entries[id as usize]
    }

    #[inline]
    pub fn rx(&self, id: ExprId) -> Rx<'a> {
        self.entries[id as usize].rx
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Appends a run of class parts and returns the range an `Op::SetClass`
    /// carries. Ranges are half-open and never move, so a patch stays `Copy`.
    pub fn push_parts(&mut self, parts: impl IntoIterator<Item = ClassPart>) -> PartRange {
        let start = self.parts.len() as u32;
        self.parts.extend(parts);
        (start, self.parts.len() as u32)
    }

    #[inline]
    pub fn parts(&self, range: PartRange) -> &[ClassPart] {
        &self.parts[range.0 as usize..range.1 as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{React, Shape};
    use oxc::ast::builder::AstBuilder;

    #[test]
    fn the_parsed_node_is_moved_in_and_moved_back_out_unchanged() {
        let allocator = Allocator::new();
        let builder = AstBuilder::new(&allocator);
        let expression = Expression::new_string_literal(Span::new(0, 3), "lg", None, &builder);

        let mut table = ExprTable::new_in(&allocator);
        let id = table.push(ExprSrc::Verbatim(expression), Span::new(0, 3), Rx::OPAQUE);
        assert_eq!(id, 0);
        let Some(Expression::StringLiteral(stored)) = table.entry(id).src.expression() else {
            panic!("the node changed shape on the way in")
        };
        assert_eq!(stored.value.as_str(), "lg");
        assert_eq!(stored.span, Span::new(0, 3));
        assert_eq!(table.rx(id).react, React::Opaque);

        // P8 takes the node by value; the entry survives as `Folded`, so every
        // `ExprId` the patch program holds stays valid.
        let Some(Expression::StringLiteral(taken)) = table.entry_mut(id).src.take() else {
            panic!("the node did not come back out")
        };
        assert_eq!(taken.span, Span::new(0, 3));
        assert!(table.entry(id).src.is_folded());
        assert!(table.entry_mut(id).src.take().is_none());
    }

    #[test]
    fn folding_replaces_the_source_and_leaves_the_id_valid() {
        let allocator = Allocator::new();
        let mut table = ExprTable::new_in(&allocator);
        let id = table.push(ExprSrc::Folded(4), Span::default(), Rx::OPAQUE);
        assert!(table.entry(id).src.is_folded());
        assert!(table.entry(id).src.expression().is_none());

        table.entry_mut(id).rx.shape = Shape::Str;
        assert_eq!(table.rx(id).shape, Shape::Str);
    }

    #[test]
    fn class_part_ranges_are_stable_across_appends() {
        let allocator = Allocator::new();
        let mut table = ExprTable::new_in(&allocator);
        let first = table.push_parts([ClassPart { value: 0, gate: None, name: Some(1) }]);
        let second = table.push_parts([
            ClassPart { value: 2, gate: Some(3), name: None },
            ClassPart { value: 4, gate: None, name: None },
        ]);
        assert_eq!(first, (0, 1));
        assert_eq!(second, (1, 3));
        assert_eq!(table.parts(first).len(), 1);
        assert_eq!(table.parts(second).len(), 2);
        assert_eq!(table.parts(first)[0].name, Some(1));
        assert_eq!(table.parts(second)[0].gate, Some(3));
    }
}
