import { text } from "@barqjs/ui/shared-text";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { fg } from "./colour.ts";
import { layout } from "./layout.ts";

/** A number or a title at display size, which `type.title` and `type.stat` share. */
const strong = arc({ fontWeight: "var(--font-weight-semibold)" });

const display = arc(layout.flush, strong, {
  fontSize: "var(--text-2xl)",
  lineHeight: "var(--text-2xl--line-height)",
  letterSpacing: "var(--tracking-tight)",
});

const numeric = arc({ fontVariantNumeric: "tabular-nums" });

const caption = arc({ fontSize: "var(--text-xs)", lineHeight: "var(--text-xs--line-height)" });

/**
 * Text by what it is rather than by its size.
 *
 * `body`, `label` and the rest start from ui's `text.sm`, `text.medium` and
 * `text.heading`, so a label in an arc table and one in a ui field are one
 * class.
 */
export const type = {
  /** A page's title. */
  title: arc(text.heading, display, { textWrap: "balance" }),
  /** A section's or a panel's title. */
  heading: arc(text.heading, layout.flush, strong, {
    fontSize: "var(--text-lg)",
    lineHeight: "var(--text-lg--line-height)",
  }),
  subheading: arc(text.medium, layout.flush, {
    fontSize: "var(--text-base)",
    lineHeight: "var(--text-base--line-height)",
  }),
  /** Running text, wrapped for reading. */
  body: arc(text.sm, layout.flush, { textWrap: "pretty" }),
  /** What names a control or a value. */
  label: arc(text.sm, text.medium),
  /** Small print beside something: a count, a time, a hint. */
  meta: arc(caption, fg.muted),
  caption: arc(caption),
  /** One number that matters. */
  stat: arc(display, numeric),
  /** Figures that line up in a column or hold still while they change. */
  numeric: arc(numeric),
  mono: arc({ fontFamily: "var(--font-mono)" }),
  sans: arc({ fontFamily: "var(--font-sans)" }),
  /** Sizes and weights on their own, for a part whose role is set elsewhere. */
  sm: arc(text.sm),
  xs: arc({ fontSize: "var(--text-xs)" }),
  medium: arc(text.medium),
  strong: arc(strong),
  normal: arc({ fontWeight: "var(--font-weight-normal)" }),
  /** A link in a list of places: no underline, and the current one in the full text colour. */
  navLink: arc({
    textDecorationLine: "none",
    "[aria-current]": { color: tokens.foreground },
  }),
};
