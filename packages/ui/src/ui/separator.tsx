import { Separator as AriaSeparator, type SeparatorComponentProps } from "@barqjs/aria/link";
import type { Incoming } from "@barqjs/core";
import { atomsIn } from "@barqjs/css";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";

const separator = atomsIn("barq.ui", {
  flexShrink: "0",
  backgroundColor: "var(--border)",
  '[data-orientation="horizontal"]': {
    height: "1px",
    width: "100%",
  },
  '[data-orientation="vertical"]': {
    height: "100%",
    width: "1px",
  },
});

/**
 * The reset gives `<hr>` a `border-top-width: 1px`, which is a SECOND line
 * beside the one this draws with a background. shadcn's separator is a `<div>`
 * and never meets it; `@barqjs/aria` renders the element the platform has a
 * role for, so the border is removed here instead.
 */
const noBorder = atomsIn("barq.ui", {
  border: "0",
});

export interface SeparatorProps extends SeparatorComponentProps {
  children?: never;
  /** Renames the slot, for a wrapper that is a separator and answers to another name. */
  "data-slot"?: string;
}

/**
 * ```tsx
 * <Separator />
 * <Separator orientation="vertical" />
 * ```
 */
export function Separator(props: Incoming<SeparatorProps>) {
  return (
    <AriaSeparator
      {...props}
      data-slot={props["data-slot"]?.() ?? "separator"}
      class={ui(separator, noBorder, props.class?.(), props.className?.())}
    />
  );
}
