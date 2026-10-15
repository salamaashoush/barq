import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { LoaderCircle } from "@barqjs/lucide/icons/loader-circle";

import "../theme/layers.ts";
import { handedOn } from "../lib/slot.ts";

const ui = layer("barq.ui");

const spinner = ui({
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
  /** shadcn's spelling of `label`. */
  "aria-label"?: string;
  /** For a spinner beside text that already says what is happening. */
  "aria-hidden"?: boolean | "true" | "false";
  /** @default "status" */
  role?: string;
  "data-slot"?: string;
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
      {...handedOn(props)}
      role={props.role?.() ?? "status"}
      aria-label={props.label?.() ?? props["aria-label"]?.() ?? "Loading"}
      aria-hidden={props["aria-hidden"]?.()}
      data-slot={props["data-slot"]?.() ?? "spinner"}
      class={ui(spinner, props.class?.(), props.className?.())}
    />
  );
}
