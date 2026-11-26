import { inputVariants } from "@barqjs/ui/input";
import { when } from "@barqjs/ui/shared-when";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { bg, fg } from "./colour.ts";
import { focus } from "./focus.ts";
import { interaction } from "./interaction.ts";
import { layout } from "./layout.ts";
import { motion } from "./motion.ts";
import { place } from "./place.ts";
import { edge, rounded } from "./surface.ts";
import { target } from "./target.ts";
import { space } from "./tokens.ts";
import { type } from "./type.ts";

/** A button inside a box of segments or an input: the box's height, no edge of its own, a finger's room. */
const boxedButton = arc(rounded.sm, edge.none, bg.transparent, target.size, {
  alignSelf: "stretch",
  marginBlock: space.x0_5,
});

/** The text around it, in its colour and its font. */
const inheritText = arc(fg.inherit, { font: "inherit" });

const bare = arc(bg.transparent, edge.none, inheritText, interaction.pressable, place.unpadded);

/**
 * Controls drawn without chrome of their own: a button that is only its
 * content, and the parts of a field whose box draws the edge and the ring.
 */
export const control = {
  /** A `<button>` drawn as nothing but its content: no fill, no edge, no padding, the text around it. */
  bare,
  /**
   * A box of typed segments, a date's or a time's: an input's edge, the
   * focused segment filled, the empty ones muted, and a finger's height under
   * a coarse pointer.
   */
  segmented: arc(
    layout.row,
    layout.fill,
    edge.input,
    rounded.md,
    bg.transparent,
    type.sm,
    type.numeric,
    focus.within,
    interaction.invalid,
    when.disabledCursor,
    target.size,
    {
      // Logical, as target.size's is, so this one replaces it rather than
      // racing it in the stylesheet as min-height would.
      minBlockSize: space.x8,
      gap: "1px",
      paddingInline: space.x2_5,
      '& [role="spinbutton"]': {
        borderRadius: "calc(var(--radius) * 0.5)",
        paddingInline: "1px",
        outline: "none",
      },
      '& [role="spinbutton"]:focus': {
        backgroundColor: "var(--accent)",
        color: "var(--accent-foreground)",
      },
      "& [data-placeholder]": { color: "var(--muted-foreground)" },
    },
  ),
  /**
   * An input inside a box that draws the edge and the ring: no edge, fill or
   * outline of its own, the box's text, and the rest of the row.
   */
  bareInput: arc(layout.grow, layout.minZero, edge.none, bg.transparent, focus.none, inheritText, {
    paddingInline: space.x1_5,
  }),
  boxedButton,
  /** A panel toolbar's search box: ui's input at a short row's height, taking the room the row has left. */
  filter: arc(inputVariants(), { flex: "1 1 12rem", minWidth: "0px", height: space.x8 }),
  /**
   * A value that edits where it is read: drawn as its text, filled under the
   * pointer, lined up with the text around it however much room it takes.
   */
  quiet: arc(bare, rounded.sm, interaction.hover, focus.visible, motion.colours, layout.fill, {
    textAlign: "start",
    paddingInline: space.x1_5,
    marginInline: `calc(${space.x1_5} * -1)`,
    paddingBlock: space.x0_5,
    minBlockSize: space.x8,
  }),
  /** ui's select trigger as a boxed button: its own height and shadow given up to the box's. */
  boxedTrigger: arc(boxedButton, { height: "auto", boxShadow: "none" }),
  /**
   * A link or a button whose hit area and focus ring cover its positioned
   * ancestor: a card whose title opens it, so a screen reader hears one name
   * while the card's other controls stay controls of their own.
   */
  stretched: arc(bare, focus.none, place.afterLayer, {
    textDecorationLine: "none",
    textAlign: "start",
    "::after": { inset: "0", borderRadius: "inherit" },
    "[data-focus-visible]::after": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: tokens.ring,
      outlineOffset: "-2px",
    },
  }),
};
