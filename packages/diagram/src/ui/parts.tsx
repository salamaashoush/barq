import type { Child } from "@barqjs/core";
import { truncate } from "@barqjs/arc/style";
import { Button as UIButton } from "@barqjs/ui/button";

export interface ButtonProps {
  type?: "button" | "submit" | "reset";
  /** Pressed, by pointer or keyboard. */
  onSelect: () => void;
  /** Whether it is in its active state. */
  selected?: boolean;
  children?: Child;
  class?: string;
  title?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

/**
 * Excalidraw's `Button`: a button in the editor's look, for an app's own UI
 * in the editor (`renderTopRightUI`, a `Footer`, a `Sidebar`), `selected`
 * showing it active.
 */
export function Button(props: ButtonProps) {
  return (
    <UIButton
      type={props.type ?? "button"}
      variant={props.selected ? "secondary" : "outline"}
      class={props.class}
      title={props.title}
      aria-label={props["aria-label"]}
      aria-pressed={props.selected === undefined ? undefined : props.selected}
      data-selected={props.selected ? "" : undefined}
      onPress={() => props.onSelect()}
      data-testid={props["data-testid"]}
    >
      {props.children}
    </UIButton>
  );
}

/** Excalidraw's `Ellipsify`: one line, cut with an ellipsis where it does not fit. */
export function Ellipsify(props: {
  children?: Child;
  class?: string;
  title?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      class={props.class ? `${truncate} ${props.class}` : truncate}
      title={props.title}
      data-testid={props["data-testid"]}
    >
      {props.children}
    </span>
  );
}
