import { type Child, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Info } from "@barqjs/lucide/icons/info";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  gap,
  glyph,
  layout,
  rounded,
  space,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { useArcMessages } from "./messages.ts";

export const alertStyles = variants({
  slots: {
    root: arc(layout.row, gap[3], bg.tone, fg.default, type.sm, {
      alignItems: "flex-start",
      padding: space.x3,
    }),
    icon: arc(layout.inlineCentre, layout.noShrink, fg.toneBase, glyph.md, {
      paddingBlockStart: space.x0_5,
    }),
    content: arc(layout.column, layout.grow, layout.minZero, gap[1]),
    title: arc(type.label, layout.flush),
    description: arc(type.body),
    actions: arc(layout.row, layout.wrap, gap[2], { paddingBlockStart: space.x1 }),
    dismiss: arc(layout.noShrink, { marginBlock: "calc(var(--spacing) * -1)" }),
  },
  variants: {
    tone: {
      success: { root: tones.success },
      warning: { root: tones.warning },
      danger: { root: tones.danger },
      info: { root: tones.info },
      neutral: { root: tones.neutral },
    },
    kind: {
      inline: { root: arc(edge.all, rounded.lg, edge.tone) },
      banner: {
        root: arc(edge.bottom, layout.fill, {
          paddingInline: space.x4,
          [on.md]: { paddingInline: space.x6, alignItems: "center" },
        }),
        content: arc({
          [on.md]: { flexDirection: "row", alignItems: "center", columnGap: space.x3 },
        }),
        actions: arc({ [on.md]: { paddingBlockStart: "0px", marginInlineStart: "auto" } }),
      },
    },
  },
  defaults: { tone: "info", kind: "inline" },
});

type Slots = ReturnType<typeof alertStyles>;

const ICONS: Record<Tone, () => Child> = {
  info: () => <Info />,
  success: () => <CircleCheck />,
  warning: () => <TriangleAlert />,
  danger: () => <CircleAlert />,
  neutral: () => <Info />,
};

export interface AlertProps extends Customisable<Slots> {
  /** @default "info" */
  tone?: Tone;
  /** A line in bold above the message. */
  title?: Child;
  /** The message. */
  children?: Child;
  /** What to do about it: a button or a link or two. */
  actions?: Child;
  /** In place of the tone's own icon; `null` for none. */
  icon?: Child | null;
  /**
   * A button that closes it, named "Dismiss". It hides itself, and this is
   * told so the app can remember.
   */
  onDismiss?: () => void;
  /** @default the provider's `dismiss`, "Dismiss" */
  dismissLabel?: string;
  /**
   * How a screen reader hears it arrive: `"alert"` interrupts, `"status"`
   * waits its turn, `"none"` is read where it stands. @default `"alert"` for
   * danger, `"status"` otherwise
   */
  live?: "alert" | "status" | "none";
}

function AlertBody(props: AlertProps & { kind: "inline" | "banner"; slot: string }) {
  const messages = useArcMessages();
  const [shown, setShown] = createSignal(true);
  const tone = (): Tone => props.tone ?? "info";
  const cls = () => parts(alertStyles({ tone: tone(), kind: props.kind }), props.classes);
  const role = (): string | undefined => {
    const live = props.live ?? (tone() === "danger" ? "alert" : "status");
    return live === "none" ? undefined : live;
  };
  return (
    <Show when={shown()}>
      <div
        class={arc(cls().root, props.class, props.className)}
        data-slot={props.slot}
        data-tone={tone()}
        role={role()}
      >
        <Show when={props.icon !== null}>
          <span class={cls().icon} data-slot={`${props.slot}-icon`} aria-hidden="true">
            {props.icon ?? ICONS[tone()]()}
          </span>
        </Show>
        <div class={cls().content} data-slot={`${props.slot}-content`}>
          <Show when={props.title !== undefined}>
            <p class={cls().title} data-slot={`${props.slot}-title`}>
              {props.title}
            </p>
          </Show>
          <Show when={props.children !== undefined}>
            <div class={cls().description} data-slot={`${props.slot}-description`}>
              {props.children}
            </div>
          </Show>
          <Show when={props.actions !== undefined}>
            <div class={cls().actions} data-slot={`${props.slot}-actions`}>
              {props.actions}
            </div>
          </Show>
        </div>
        <Show when={props.onDismiss !== undefined}>
          <Button
            class={cls().dismiss}
            data-slot={`${props.slot}-dismiss`}
            variant="ghost"
            size="icon-sm"
            aria-label={props.dismissLabel ?? messages().dismiss}
            onPress={() => {
              setShown(false);
              props.onDismiss?.();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </Show>
      </div>
    </Show>
  );
}

/**
 * A message inside the content, in a tone: a form that could not be saved,
 * a feature in beta, a quota nearly used.
 *
 * ```tsx
 * <InlineAlert tone="warning" title="Almost out of seats" actions={<Button size="sm">Add seats</Button>}>
 *   18 of 20 seats are taken.
 * </InlineAlert>
 * ```
 *
 * The tone sets the fill, the edge and an icon, and the title says it in
 * words, so the tone is never the only signal. A danger interrupts a screen
 * reader; the others wait their turn.
 */
export function InlineAlert(props: AlertProps) {
  return <AlertBody {...props} kind="inline" slot="inline-alert" />;
}

/**
 * A message across the top of a page or the app: maintenance tonight, a
 * trial ending, an account suspended. Full width, its actions beside the
 * message on a wide screen and under it on a narrow one.
 *
 * ```tsx
 * <Banner tone="info" onDismiss={() => remember("maintenance")}>
 *   Maintenance on Sunday from 02:00 UTC.
 * </Banner>
 * ```
 */
export function Banner(props: AlertProps) {
  return <AlertBody {...props} kind="banner" slot="banner" />;
}
