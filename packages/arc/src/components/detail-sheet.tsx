import { type Child, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useDirection } from "@barqjs/aria/i18n";
import { useSearchParams } from "@barqjs/router";
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

export type DetailSheetSize = "sm" | "md" | "lg" | "xl";

export const detailSheetVariants = variants({
  base: arc({
    width: "100%",
    gap: "0px",
  }),
  variants: {
    size: {
      sm: arc({ maxWidth: "24rem" }),
      md: arc({ maxWidth: "32rem" }),
      lg: arc({ maxWidth: "42rem" }),
      xl: arc({ maxWidth: "56rem" }),
    },
  },
  defaults: { size: "md" },
});

const header = arc({
  borderBlockEndWidth: "1px",
  borderBlockEndStyle: "solid",
  borderColor: "var(--border)",
  paddingInlineEnd: "calc(var(--spacing) * 12)",
});

const body = arc({
  display: "flex",
  minHeight: "0px",
  flex: "1",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 4)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "calc(var(--spacing) * 4)",
});

const footer = arc({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  borderBlockStartWidth: "1px",
  borderBlockStartStyle: "solid",
  borderColor: "var(--border)",
  paddingBlockEnd: "max(calc(var(--spacing) * 4), env(safe-area-inset-bottom))",
});

export interface DetailSheetProps extends UiProps {
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
  /** @default "Close" */
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
  const param = untrack(() => props.param);
  const url = param === undefined ? undefined : useSearchParams();
  const [own, setOwn] = createSignal(untrack(() => props.defaultOpen) ?? false);

  const isOpen = (): boolean => {
    if (url !== undefined && param !== undefined) return url[0]().has(param);
    return props.open ?? own();
  };

  const setOpen = (next: boolean): void => {
    if (url !== undefined && param !== undefined) {
      if (!next) {
        url[1]((current) => {
          const kept: Record<string, string> = {};
          for (const [key, value] of current) if (key !== param) kept[key] = value;
          return kept;
        });
      }
    } else if (props.open === undefined) {
      setOwn(next);
    }
    props.onOpenChange?.(next);
  };

  const side = (): "left" | "right" => {
    const end = (props.side ?? "end") === "end";
    return end === (direction() === "rtl") ? "left" : "right";
  };

  return (
    <Sheet isOpen={isOpen()} onOpenChange={setOpen}>
      <SheetContent
        {...props}
        side={side()}
        closeLabel={props.closeLabel}
        data-slot={props["data-slot"] ?? "detail-sheet"}
        data-size={props.size ?? "md"}
        class={arc(detailSheetVariants({ size: props.size }), props.class, props.className)}
      >
        <SheetHeader class={header}>
          <SheetTitle>{props.heading}</SheetTitle>
          <Show when={props.description}>
            <SheetDescription>{props.description}</SheetDescription>
          </Show>
        </SheetHeader>
        <div class={body} data-slot="detail-sheet-body">
          {props.children}
        </div>
        <Show when={props.footer}>
          <SheetFooter class={footer}>{props.footer}</SheetFooter>
        </Show>
      </SheetContent>
    </Sheet>
  );
}
