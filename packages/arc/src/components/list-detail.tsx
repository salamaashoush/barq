import { type Child, Show, createUniqueId, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { Button } from "@barqjs/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui/resizable";
import { icon } from "@barqjs/ui/shared-icon";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { edge, focus, layout, place, space, surface } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export const listDetailStyles = variants({
  slots: {
    root: arc(layout.minZero, place.fill, { display: "grid", minHeight: "24rem" }),
    group: arc({}),
    list: arc(layout.column, layout.minZero, layout.minZeroBlock, layout.scrollBlock, focus.none),
    handle: arc({}),
    detail: arc(layout.column, layout.minZero, layout.minZeroBlock, focus.none),
    back: arc(layout.row, edge.bottom, place.paddedLine),
    content: arc(layout.column, layout.grow, layout.minZeroBlock, layout.scrollBlock),
    placeholder: arc(layout.centre, layout.grow, { padding: space.x6 }),
  },
  variants: {
    breakpoint: {
      // Below the step one pane fills the screen: the list, or the record
      // with Back. From it, both side by side with a handle between.
      md: {
        root: arc({
          "@media (width < 48rem)": {
            "& [data-slot=list-detail-handle]": { display: "none" },
            "& [data-slot=list-detail-group]": { display: "grid" },
            "&[data-open] [data-slot=list-detail-list-pane]": { display: "none" },
            "&:not([data-open]) [data-slot=list-detail-detail-pane]": { display: "none" },
          },
          "@media (width >= 48rem)": { "& [data-slot=list-detail-back]": { display: "none" } },
        }),
      },
      lg: {
        root: arc({
          "@media (width < 64rem)": {
            "& [data-slot=list-detail-handle]": { display: "none" },
            "& [data-slot=list-detail-group]": { display: "grid" },
            "&[data-open] [data-slot=list-detail-list-pane]": { display: "none" },
            "&:not([data-open]) [data-slot=list-detail-detail-pane]": { display: "none" },
          },
          "@media (width >= 64rem)": { "& [data-slot=list-detail-back]": { display: "none" } },
        }),
      },
      xl: {
        root: arc({
          "@media (width < 80rem)": {
            "& [data-slot=list-detail-handle]": { display: "none" },
            "& [data-slot=list-detail-group]": { display: "grid" },
            "&[data-open] [data-slot=list-detail-list-pane]": { display: "none" },
            "&:not([data-open]) [data-slot=list-detail-detail-pane]": { display: "none" },
          },
          "@media (width >= 80rem)": { "& [data-slot=list-detail-back]": { display: "none" } },
        }),
      },
    },
    framed: {
      true: { root: arc(surface.card, { overflow: "hidden" }) },
      false: {},
    },
  },
  defaults: { breakpoint: "lg", framed: false },
});

type Slots = ReturnType<typeof listDetailStyles>;

export interface ListDetailLayoutProps extends Customisable<Slots> {
  /** The list pane: conversations, tickets, submissions. */
  list: Child;
  /** Names the list pane's landmark: "Conversations". */
  listLabel: string;
  /** The open record. */
  children?: Child;
  /** Names the record's pane. @default the provider's `details` message, "Details" */
  detailLabel?: string;
  /** Whether a record is open, when the caller holds it. */
  open?: boolean;
  /**
   * Read once: a record is open while this search parameter is in the URL,
   * so the open record has a link, and on a phone the browser's Back returns
   * to the list. The pane's own Back takes the parameter out with a replace.
   */
  param?: string;
  /** The pane's Back on a narrow screen was pressed: let go of the open record. */
  onBack?: () => void;
  /** In the record's pane while none is open, beside the list on a wide screen. */
  placeholder?: Child;
  /** @default the provider's `backToList` message, "Back to the list" */
  backLabel?: string;
  /** Below this step one pane shows at a time. @default "lg" */
  breakpoint?: "md" | "lg" | "xl";
  /** The list's width, as a percentage of the row, before the reader moves it. @default 32 */
  defaultSize?: number;
  /** Remember the list's width in `localStorage` under this name. */
  storageKey?: string;
  /** A card's edge and corners around both panes. @default false */
  framed?: boolean;
  id?: string;
}

/**
 * A list beside the record open from it: an inbox, a queue of submissions to
 * mark, a ticket list. The edge between the panes moves with a drag or the
 * arrows, and its place is remembered under `storageKey`.
 *
 * ```tsx
 * <ListDetailLayout
 *   listLabel="Conversations"
 *   param="thread"
 *   list={<ThreadList />}
 *   placeholder={<EmptyState title="Pick a conversation" />}
 * >
 *   <Conversation id={search().get("thread")} />
 * </ListDetailLayout>
 * ```
 *
 * Below `breakpoint` one pane fills the space at a time: the list, then the
 * record with a Back above it, which returns focus to the list. Which pane
 * shows is a matter of the stylesheet, so a server draws a phone's page as
 * the phone shows it and hydration changes nothing.
 */
export function ListDetailLayout(props: ListDetailLayoutProps) {
  const messages = useArcMessages();
  const base = createUniqueId();
  const { isOpen, setOpen } = openState({
    param: untrack(() => props.param),
    open: () => props.open,
    defaultOpen: false,
    onOpenChange: (open) => {
      if (!open) props.onBack?.();
    },
  });
  function cls(): Slots {
    return parts(
      listDetailStyles({ breakpoint: props.breakpoint, framed: props.framed === true }),
      props.classes,
    );
  }
  function back(): void {
    setOpen(false);
    flush();
    document.getElementById(`${base}-list`)?.focus();
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="list-detail"
      data-open={isOpen() ? "" : undefined}
    >
      <ResizablePanelGroup
        direction="horizontal"
        class={cls().group}
        data-slot="list-detail-group"
        autoSaveId={
          props.storageKey === undefined ? undefined : `arc-list-detail:${props.storageKey}`
        }
      >
        <ResizablePanel
          id={`${base}-list-panel`}
          data-slot="list-detail-list-pane"
          defaultSize={untrack(() => props.defaultSize) ?? 32}
          minSize="240px"
          maxSize={60}
        >
          <section
            id={`${base}-list`}
            class={cls().list}
            data-slot="list-detail-list"
            aria-label={props.listLabel}
            tabIndex={-1}
          >
            {props.list}
          </section>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          class={cls().handle}
          data-slot="list-detail-handle"
          aria-label={messages().resizePanel}
        />
        <ResizablePanel
          id={`${base}-detail-panel`}
          data-slot="list-detail-detail-pane"
          minSize={40}
        >
          <section
            class={cls().detail}
            data-slot="list-detail-detail"
            aria-label={props.detailLabel ?? messages().details}
          >
            <Show
              when={isOpen()}
              fallback={
                <div class={cls().placeholder} data-slot="list-detail-placeholder">
                  {props.placeholder}
                </div>
              }
            >
              <div class={cls().back} data-slot="list-detail-back">
                <Button variant="ghost" size="sm" onPress={back}>
                  <ArrowLeft aria-hidden="true" class={icon.directional} />
                  {props.backLabel ?? messages().backToList}
                </Button>
              </div>
              <div class={cls().content} data-slot="list-detail-content">
                {props.children}
              </div>
            </Show>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
