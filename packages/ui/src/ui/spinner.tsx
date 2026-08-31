import type { Incoming } from "@barqjs/core";
import { atomsIn } from "@barqjs/css";

import { LoaderCircle } from "@barqjs/lucide/icons/loader-circle";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";

const spinner = atomsIn("barq.ui", {
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  animation: "var(--animate-spin)",
});

export interface SpinnerProps {
  class?: string;
  className?: string;
  style?: Record<string, string | number | undefined>;
  id?: string;
  /** What a screen reader says while it turns. @default "Loading" */
  label?: string;
  "data-testid"?: string;
}

/**
 * ```tsx
 * <Button isDisabled><Spinner /> Saving</Button>
 * ```
 *
 * `role="status"` with a name, so the wait is announced once rather than being
 * a silent turning circle.
 */
export function Spinner(props: Incoming<SpinnerProps>) {
  return (
    <LoaderCircle
      role="status"
      aria-label={props.label?.() ?? "Loading"}
      data-slot="spinner"
      data-testid={props["data-testid"]?.()}
      id={props.id?.()}
      style={props.style?.()}
      class={ui(spinner, props.class?.(), props.className?.())}
    />
  );
}
