import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ring } from "../lib/shared-ring.ts";
import { when } from "../lib/shared-when.ts";
import { controlProps } from "../lib/slot.ts";
import type { InputProps } from "./input.tsx";

const ui = layer("barq.ui");

const textarea = ui(
  box.border,
  box.transition,
  box.outline,
  ring.focus,
  ring.invalid,
  ring.invalidRing,
  when.darkInput,
  ring.invalidDark,
  ring.invalidBorderDark,
  {
    display: "flex",
    fieldSizing: "content",
    minHeight: "calc(var(--spacing) * 16)",
    width: "100%",
    borderRadius: "var(--radius)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBlock: "calc(var(--spacing) * 2)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    "::placeholder": {
      color: "var(--muted-foreground)",
    },
    ":disabled": {
      cursor: "not-allowed",
      backgroundColor: "var(--input)",
      opacity: "50%",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
      },
    },
    "@media (width >= 48rem)": {
      "&": {
        fontSize: "var(--text-sm)",
        lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
      },
    },
    ":is(.dark *):disabled": {
      backgroundColor: "var(--input)",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 80%, transparent)",
      },
    },
  },
);

export interface TextareaProps extends Omit<InputProps, "type" | "ref"> {
  rows?: number;
  cols?: number;
  wrap?: "hard" | "soft" | "off";
  ref?: RefTarget<HTMLTextAreaElement>;
}

/**
 * `field-sizing: content`, so it grows with what is typed and needs no
 * resize observer and no shadow element to measure against.
 */
export function Textarea(props: Incoming<TextareaProps>) {
  return <textarea {...controlProps("textarea", textarea, props)} ref={mergeRefs(props.ref?.())} />;
}
