import { type Child, Show, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barqjs/ui/dialog";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { edge, gap, layout, panel, place, space, surface } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export const tearsheetStyles = variants({
  slots: {
    root: arc(layout.column, gap[0], place.unpadded, place.screen, {
      borderRadius: "0px",
      insetBlockStart: "auto",
      insetBlockEnd: "0",
      translate: "-50% 0",
      [on.md]: {
        width: "calc(100vw - 4rem)",
        maxWidth: "calc(100vw - 4rem)",
        height: "calc(100dvh - 3rem)",
        maxHeight: "calc(100dvh - 3rem)",
        borderEndStartRadius: "0px",
        borderEndEndRadius: "0px",
      },
    }),
    header: arc(edge.bottom, {
      padding: space.x6,
      paddingInlineEnd: space.x12,
      paddingBlockStart: "max(calc(var(--spacing) * 6), env(safe-area-inset-top))",
    }),
    title: arc({}),
    description: arc({}),
    main: arc(layout.row, layout.grow, layout.minZeroBlock, { alignItems: "stretch" }),
    influencer: arc(panel.body, edge.start, surface.sunken, {
      order: "-1",
      flex: "0 0 18rem",
      padding: space.x4,
      [on.belowMd]: { display: "none" },
    }),
    body: arc(panel.body, layout.minZero, { padding: space.x6 }),
    footer: arc(panel.footer, {
      margin: "0px",
      paddingInline: space.x4,
      paddingBlockStart: space.x4,
    }),
  },
  variants: {
    size: {
      wide: {},
      narrow: { root: arc({ [on.md]: { width: "min(48rem, calc(100vw - 4rem))" } }) },
    },
  },
  defaults: { size: "wide" },
});

type Slots = ReturnType<typeof tearsheetStyles>;

export interface TearsheetProps extends Customisable<Slots> {
  children?: Child;
  /** Names the tearsheet. */
  heading: Child;
  description?: Child;
  /** At the foot while the body scrolls: its actions. */
  footer?: Child;
  /**
   * A panel at the start beside the body: the steps of a long task, the
   * filters of a picker. Hidden on a compact window, where the body has the
   * screen.
   */
  influencer?: Child;
  /** `narrow` keeps a long form to a readable measure on a wide screen. @default "wide" */
  size?: "wide" | "narrow";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Open while this search parameter is in the URL; closing takes it out. */
  param?: string;
  /** @default false, so a long task is not lost to a stray press outside */
  isDismissable?: boolean;
  /** @default the provider's `close`, "Close" */
  closeLabel?: string;
}

/**
 * A large task in a layer over the page: creating a record with many
 * fields, reviewing a batch, a multi-step setup. The whole screen on a
 * phone, and on a wide one nearly all of it, rising from the bottom so the
 * page it came from shows above it.
 *
 * ```tsx
 * <Tearsheet heading="New campaign" footer={<SubmitButton />} influencer={<Steps />}>
 *   <CampaignForm />
 * </Tearsheet>
 * ```
 *
 * A modal dialog: focus moves in and stays, Escape closes, and a press
 * outside does not unless `isDismissable`. Its open state is the caller's,
 * its own, or a search parameter's, so the task has a link.
 */
export function Tearsheet(props: TearsheetProps) {
  const messages = useArcMessages();
  const { isOpen, setOpen } = openState({
    param: untrack(() => props.param),
    open: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen),
    onOpenChange: (next) => props.onOpenChange?.(next),
  });
  function cls() {
    return parts(tearsheetStyles({ size: props.size }), props.classes);
  }
  return (
    <Dialog isOpen={isOpen()} onOpenChange={setOpen}>
      <DialogContent
        isDismissable={props.isDismissable === true}
        closeLabel={props.closeLabel ?? messages().close}
        data-slot="tearsheet"
        data-size={props.size ?? "wide"}
        class={arc(cls().root, props.class, props.className)}
      >
        <DialogHeader class={cls().header}>
          <DialogTitle class={cls().title}>{props.heading}</DialogTitle>
          <Show when={props.description !== undefined}>
            <DialogDescription class={cls().description}>{props.description}</DialogDescription>
          </Show>
        </DialogHeader>
        <div class={cls().main} data-slot="tearsheet-main">
          <div class={cls().body} data-slot="tearsheet-body">
            {props.children}
          </div>
          <Show when={props.influencer !== undefined}>
            <aside class={cls().influencer} data-slot="tearsheet-influencer">
              {props.influencer}
            </aside>
          </Show>
        </div>
        <Show when={props.footer !== undefined}>
          <DialogFooter class={cls().footer}>{props.footer}</DialogFooter>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
