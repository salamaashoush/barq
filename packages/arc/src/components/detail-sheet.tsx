import { type Child, Show, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useDirection } from "@barqjs/aria/i18n";
import type { UiProps } from "@barqjs/ui/props";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@barqjs/ui/sheet";

import { arcLayer as arc } from "../layer.ts";
import { type Classes, type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { edge, gap, layout, space } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export type DetailSheetSize = "sm" | "md" | "lg" | "xl";

export const detailSheetVariants = variants({
  slots: {
    root: arc(layout.fill, gap[0]),
    header: arc(edge.bottom, { paddingInlineEnd: space.x12 }),
    title: arc({}),
    description: arc({}),
    body: arc(layout.column, layout.minZeroBlock, layout.grow, gap[4], {
      overflowY: "auto",
      overscrollBehavior: "contain",
      padding: space.x4,
    }),
    footer: arc(layout.wrap, layout.end, edge.top, {
      flexDirection: "row",
      paddingBlockEnd: "max(calc(var(--spacing) * 4), env(safe-area-inset-bottom))",
    }),
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
  const cls = (): Slots => parts(detailSheetVariants({ size: props.size }), props.classes);

  const side = (): "left" | "right" => {
    const end = (props.side ?? "end") === "end";
    return end === (direction() === "rtl") ? "left" : "right";
  };

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
          <SheetTitle class={cls().title}>{props.heading}</SheetTitle>
          <Show when={props.description}>
            <SheetDescription class={cls().description}>{props.description}</SheetDescription>
          </Show>
        </SheetHeader>
        <div class={cls().body} data-slot="detail-sheet-body">
          {props.children}
        </div>
        <Show when={props.footer}>
          <SheetFooter class={cls().footer}>{props.footer}</SheetFooter>
        </Show>
      </SheetContent>
    </Sheet>
  );
}
