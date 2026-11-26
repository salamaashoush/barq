import { type Child, Show, createEffect, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useDirection } from "@barqjs/aria/i18n";
import { ref as makeRef } from "@barqjs/primitives/refs";
import type { UiProps } from "@barqjs/ui/props";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@barqjs/ui/sheet";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Classes, type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { edge, focus, gap, layout, panel, space } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { RecordPager, type RecordSteps } from "./record-pager.tsx";

export type DetailSheetSize = "sm" | "md" | "lg" | "xl";

export const detailSheetVariants = variants({
  slots: {
    root: arc(layout.fill, gap[0]),
    // Both sides, logical: a logical end replaces the sheet header's physical
    // left and right together, so the start would otherwise lose its padding.
    header: arc(edge.bottom, { paddingInlineStart: space.x4, paddingInlineEnd: space.x12 }),
    heading: arc(layout.row, gap[3], { alignItems: "flex-start" }),
    text: arc(layout.column, layout.grow, layout.minZero, gap[1]),
    title: arc({ overflowWrap: "anywhere" }),
    pager: arc({}),
    description: arc({}),
    body: arc(panel.body, focus.none, { padding: space.x4 }),
    footer: panel.footer,
  },
  variants: {
    size: {
      sm: { root: arc({ maxWidth: "24rem" }) },
      md: { root: arc({ maxWidth: "32rem" }) },
      lg: { root: arc({ maxWidth: "42rem" }) },
      xl: { root: arc({ maxWidth: "56rem" }) },
    },
  },
  defaults: { size: "md" },
});

type Slots = ReturnType<typeof detailSheetVariants>;

export type DetailSheetClasses = Classes<Slots>;

export interface DetailSheetProps
  extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
  /** Names the sheet. Not `title`, which is the attribute every element takes. */
  heading: Child;
  description?: Child;
  /** At the foot of the sheet while the body scrolls: its actions. */
  footer?: Child;
  /** @default "md" */
  size?: DetailSheetSize;
  /** The edge it comes in from, by reading direction. @default "end" */
  side?: "start" | "end";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Open while this search parameter is in the URL, and closing removes it, so
   * a record's detail has a link of its own and the back button closes it.
   */
  param?: string;
  /** @default the provider's `close` message, "Close" */
  closeLabel?: string;
  /**
   * The previous and next record of the list it was opened from, beside the
   * heading, and K and J to step to them while the sheet is open.
   */
  steps?: RecordSteps;
}

/**
 * A record's detail, in a sheet beside the list it came from.
 *
 * ```tsx
 * <Link to="/invoices" search={{ invoice: invoice.id }}>{invoice.number}</Link>
 *
 * <DetailSheet param="invoice" heading="Invoice" footer={<Button>Send</Button>}>
 *   <InvoiceDetail id={search().get("invoice")} />
 * </DetailSheet>
 * ```
 *
 * Open state is the caller's (`open`), the sheet's own (`defaultOpen`), or the
 * URL's (`param`). The search parameter is removed with a replace, so closing
 * does not add a step to the history.
 *
 * Opened from a table, `steps` reads on through the rows without closing:
 *
 * ```tsx
 * <DetailSheet
 *   param="delivery"
 *   heading={row().id}
 *   steps={{ position: at() + 1, count: rows().length, onPrevious: back(), onNext: on() }}
 * >
 * ```
 */
export function DetailSheet(props: DetailSheetProps) {
  const direction = useDirection();
  const messages = useArcMessages();
  const { isOpen, setOpen } = openState({
    param: untrack(() => props.param),
    open: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen),
    onOpenChange: (next) => props.onOpenChange?.(next),
  });
  function cls(): Slots {
    return parts(detailSheetVariants({ size: props.size }), props.classes);
  }

  // Opened from a list, the reader goes on reading: focus starts on the
  // record rather than on Previous, whose tooltip would open with it.
  const body = makeRef<HTMLDivElement>();
  if (!isServer) {
    createEffect(body, (element) => {
      if (element === null || untrack(() => props.steps) === undefined) return;
      requestAnimationFrame(() => element.focus({ preventScroll: true }));
    });
  }

  function side(): "left" | "right" {
    const end = (props.side ?? "end") === "end";
    return end === (direction() === "rtl") ? "left" : "right";
  }

  return (
    <Sheet isOpen={isOpen()} onOpenChange={setOpen}>
      <SheetContent
        {...props}
        side={side()}
        closeLabel={props.closeLabel ?? messages().close}
        data-slot={props["data-slot"] ?? "detail-sheet"}
        data-size={props.size ?? "md"}
        class={arc(cls().root, props.class, props.className)}
      >
        <SheetHeader class={cls().header}>
          <div class={cls().heading} data-slot="detail-sheet-heading">
            <div class={cls().text} data-slot="detail-sheet-text">
              <SheetTitle class={cls().title}>{props.heading}</SheetTitle>
              <Show when={props.description}>
                <SheetDescription class={cls().description}>{props.description}</SheetDescription>
              </Show>
            </div>
            <Show when={props.steps !== undefined}>
              <RecordPager
                class={cls().pager}
                shortcuts
                position={props.steps?.position}
                count={props.steps?.count}
                onPrevious={props.steps?.onPrevious}
                onNext={props.steps?.onNext}
                previousHref={props.steps?.previousHref}
                nextHref={props.steps?.nextHref}
                previousLabel={props.steps?.previousLabel}
                nextLabel={props.steps?.nextLabel}
              />
            </Show>
          </div>
        </SheetHeader>
        <div
          ref={body.set}
          class={cls().body}
          data-slot="detail-sheet-body"
          tabIndex={props.steps === undefined ? undefined : -1}
        >
          {props.children}
        </div>
        <Show when={props.footer}>
          <SheetFooter class={cls().footer}>{props.footer}</SheetFooter>
        </Show>
      </SheetContent>
    </Sheet>
  );
}
