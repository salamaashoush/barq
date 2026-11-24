import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { PressEvent } from "@barqjs/aria/interactions";
import { Link as AriaLink } from "@barqjs/aria/link";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import { srOnly } from "@barqjs/ui/sr-only";
import { when } from "@barqjs/ui/shared-when";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, focus, motion, rounded } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export const linkStyles = variants({
  slots: {
    root: arc(focus.visible, rounded.xs, motion.colours, when.disabledCursor, {
      textUnderlineOffset: "0.2em",
      textDecorationThickness: "from-font",
      cursor: "pointer",
      "[data-disabled]": { opacity: "0.5", textDecorationLine: "none" },
    }),
    external: arc({
      display: "inline-block",
      width: "0.85em",
      height: "0.85em",
      marginInlineStart: "0.2em",
      verticalAlign: "-0.05em",
    }),
    hint: arc(srOnly),
  },
  variants: {
    color: {
      default: { root: fg.link },
      muted: {
        root: arc(fg.muted, { "@media (hover: hover)": { ":hover": { color: "inherit" } } }),
      },
      inherit: { root: fg.inherit },
    },
    underline: {
      always: { root: arc({ textDecorationLine: "underline" }) },
      hover: {
        root: arc({
          textDecorationLine: "none",
          "@media (hover: hover)": { ":hover": { textDecorationLine: "underline" } },
          "[data-focus-visible]": { textDecorationLine: "underline" },
        }),
      },
      none: { root: arc({ textDecorationLine: "none" }) },
    },
  },
  defaults: { color: "default", underline: "always" },
});

type Slots = ReturnType<typeof linkStyles>;

/** A URL that leaves the app: an absolute `http(s):` or a protocol-relative `//`. */
export function isExternalHref(href: string | undefined): boolean {
  return href !== undefined && /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(href);
}

export interface LinkProps extends Customisable<Slots> {
  href?: string;
  children?: Child;
  /**
   * Opens in a new tab, with the icon that says so and the words for a screen
   * reader. @default whether `href` is absolute
   */
  external?: boolean;
  /** @default "default" */
  color?: "default" | "muted" | "inherit";
  /** @default "always" */
  underline?: "always" | "hover" | "none";
  isDisabled?: boolean;
  download?: boolean | string;
  rel?: string;
  /** @default the provider's `opensInNewTab` message */
  externalLabel?: string;
  onPress?: (event: PressEvent) => void;
  id?: string;
  "aria-label"?: string;
  "aria-current"?: boolean | string;
}

/**
 * A link in running text, marked when it leaves the app.
 *
 * ```tsx
 * <Link href="/settings/billing">Billing settings</Link>
 * <Link href="https://example.com/terms">Terms</Link>
 * ```
 *
 * On `@barqjs/aria`'s link, so a router configured there follows it. An
 * absolute URL opens in a new tab with `rel="noopener noreferrer"`, draws an
 * arrow after its words and tells a screen reader it opens a new tab; the
 * arrow is the same on the server, so the page hydrates without a change.
 */
export function Link(props: LinkProps) {
  const messages = useArcMessages();
  function external(): boolean {
    return props.external ?? isExternalHref(props.href);
  }
  function cls(): Slots {
    return parts(linkStyles({ color: props.color, underline: props.underline }), props.classes);
  }
  return (
    <AriaLink
      id={props.id}
      class={arc(cls().root, props.class, props.className)}
      data-slot="link"
      data-external={external() ? "" : undefined}
      href={props.href}
      target={external() ? "_blank" : undefined}
      rel={props.rel ?? (external() ? "noopener noreferrer" : undefined)}
      download={props.download}
      isDisabled={props.isDisabled}
      aria-label={props["aria-label"]}
      aria-current={props["aria-current"]}
      onPress={(event: PressEvent) => props.onPress?.(event)}
    >
      {props.children}
      <Show when={external()}>
        <ExternalLink class={cls().external} data-slot="link-external" aria-hidden="true" />
        <span class={cls().hint} data-slot="link-hint">
          {` (${props.externalLabel ?? messages().opensInNewTab})`}
        </span>
      </Show>
    </AriaLink>
  );
}
