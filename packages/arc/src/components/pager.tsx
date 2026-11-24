import { For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { controllable } from "@barqjs/aria/utils";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ChevronsLeft } from "@barqjs/lucide/icons/chevrons-left";
import { ChevronsRight } from "@barqjs/lucide/icons/chevrons-right";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { NativeSelect, NativeSelectOption } from "@barqjs/ui/native-select";
import { PaginationEllipsis } from "@barqjs/ui/pagination";
import { icon } from "@barqjs/ui/shared-icon";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, plainList, space, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** A page's place in a pager's list, from 0, or a gap standing for the pages left out. */
export type PageSlot = number | "gap";

/**
 * The pages a pager lists: the first, the last, the current and `siblings`
 * either side of it, with a gap where pages are left out. A gap that would
 * stand for one page is that page instead.
 */
export function pageWindow(pageIndex: number, pageCount: number, siblings = 1): PageSlot[] {
  if (pageCount <= 0) return [];
  const shown = siblings * 2 + 5;
  if (pageCount <= shown) return Array.from({ length: pageCount }, (_, at) => at);
  const last = pageCount - 1;
  const start = Math.max(1, Math.min(pageIndex - siblings, last - 1 - siblings * 2 - 1));
  const end = Math.min(last - 1, Math.max(pageIndex + siblings, siblings * 2 + 2));
  const middle = Array.from({ length: end - start + 1 }, (_, at) => start + at);
  return [
    0,
    ...(start > 1 ? (["gap"] as const) : []),
    ...middle,
    ...(end < last - 1 ? (["gap"] as const) : []),
    last,
  ];
}

export const pagerStyles = variants({
  slots: {
    root: arc(layout.container, layout.row, layout.wrap, gap[3], type.sm, fg.muted, {
      justifyContent: "flex-end",
    }),
    range: arc(type.numeric, { marginInlineEnd: "auto" }),
    size: arc(layout.row, gap[2]),
    sizeLabel: arc(layout.nowrap),
    controls: arc(layout.row, gap[1]),
    pages: arc(plainList, layout.row, gap[0.5]),
    page: arc(type.numeric),
    current: arc(layout.nowrap, type.numeric, { paddingInline: space.x2 }),
    edge: arc({}),
  },
  variants: {
    variant: {
      pages: {
        pages: arc({ [on.cqBelowMd]: { display: "none" } }),
        current: arc({ display: "none", [on.cqBelowMd]: { display: "inline" } }),
      },
      compact: {},
      simple: {},
    },
  },
  defaults: { variant: "pages" },
});

type Slots = ReturnType<typeof pagerStyles>;

export interface PagerLabels {
  pagination?: string;
  previous?: string;
  next?: string;
  first?: string;
  last?: string;
  page?: (page: number, pages: number) => string;
  goToPage?: (page: number) => string;
  range?: (from: string, to: string, total: string) => string;
  pageSize?: string;
}

export interface PagerProps extends Customisable<Slots> {
  /** The page shown, from 0. Leave it out and the pager keeps its own. */
  pageIndex?: number;
  defaultPageIndex?: number;
  onPageIndexChange?: (pageIndex: number) => void;
  /** How many pages. Left out, it is worked out from `total` and `pageSize`. */
  pageCount?: number;
  /** How many records in all, for "21–40 of 312". */
  total?: number;
  pageSize?: number;
  /** Sizes a reader may choose, in a select labelled "Rows per page". */
  pageSizes?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  /**
   * `pages` lists the pages, folding to "Page 2 of 9" across a narrow
   * container; `compact` is that line with the arrows; `simple` the arrows
   * alone. @default "pages"
   */
  variant?: "pages" | "compact" | "simple";
  /** First and last buttons beside the arrows. */
  showEdges?: boolean;
  /** Pages either side of the current one. @default 1 */
  siblings?: number;
  /** Pages as links: a page that can be bookmarked and crawled. */
  getHref?: (pageIndex: number) => string;
  labels?: PagerLabels;
  isDisabled?: boolean;
  id?: string;
}

/**
 * The way through a list too long for one page.
 *
 * ```tsx
 * <Pager pageIndex={page()} onPageIndexChange={setPage} total={312} pageSize={20} />
 * <Pager variant="compact" pageCount={9} pageSizes={[20, 50, 100]} onPageSizeChange={setSize} />
 * ```
 *
 * A navigation landmark: the range shown ("21–40 of 312"), a page size, and
 * the arrows with the pages between them, the current one `aria-current`.
 * Every number is in the locale's digits, every word arc's or `labels`', the
 * arrows turn with the reading direction, and across a narrow container the
 * page list folds to "Page 2 of 9". With `getHref` each page is a link.
 */
export function Pager(props: PagerProps) {
  const messages = useArcMessages();
  const format = numberFormatter();
  const sizeId = createUniqueId();
  const [pageIndex, setPageIndex] = controllable<number>(
    () => props.pageIndex,
    () => props.defaultPageIndex ?? 0,
    (next) => props.onPageIndexChange?.(next),
  );
  const pageCount = (): number =>
    props.pageCount ??
    (props.total !== undefined && props.pageSize !== undefined && props.pageSize > 0
      ? Math.max(1, Math.ceil(props.total / props.pageSize))
      : 1);
  const labels = () => ({
    pagination: props.labels?.pagination ?? messages().pagination,
    previous: props.labels?.previous ?? messages().previousPage,
    next: props.labels?.next ?? messages().nextPage,
    first: props.labels?.first ?? messages().firstPage,
    last: props.labels?.last ?? messages().lastPage,
    page: props.labels?.page ?? messages().page,
    goToPage: props.labels?.goToPage ?? messages().goToPage,
    range: props.labels?.range ?? messages().pageRange,
    pageSize: props.labels?.pageSize ?? messages().pageSize,
  });
  const go = (next: number): void => {
    const bounded = Math.min(Math.max(0, next), pageCount() - 1);
    if (bounded !== pageIndex()) setPageIndex(bounded);
  };
  const range = (): string | undefined => {
    if (props.total === undefined || props.pageSize === undefined) return undefined;
    if (props.total === 0)
      return labels().range(format().format(0), format().format(0), format().format(0));
    const from = pageIndex() * props.pageSize + 1;
    const to = Math.min(props.total, from + props.pageSize - 1);
    return labels().range(format().format(from), format().format(to), format().format(props.total));
  };
  const variant = (): "pages" | "compact" | "simple" => props.variant ?? "pages";
  const cls = (): Slots => parts(pagerStyles({ variant: variant() }), props.classes);
  const atStart = (): boolean => props.isDisabled === true || pageIndex() <= 0;
  const atEnd = (): boolean => props.isDisabled === true || pageIndex() >= pageCount() - 1;

  const arrow = (
    to: () => number,
    label: () => string,
    isDisabled: () => boolean,
    glyph: "first" | "previous" | "next" | "last",
  ) => (
    <Button
      class={cls().edge}
      data-slot="pager-edge"
      data-edge={glyph}
      variant="ghost"
      size="icon-sm"
      aria-label={label()}
      href={props.getHref === undefined || isDisabled() ? undefined : props.getHref(to())}
      isDisabled={isDisabled()}
      onPress={() => go(to())}
    >
      {glyph === "first" ? (
        <ChevronsLeft class={icon.directional} />
      ) : glyph === "previous" ? (
        <ChevronLeft class={icon.directional} />
      ) : glyph === "next" ? (
        <ChevronRight class={icon.directional} />
      ) : (
        <ChevronsRight class={icon.directional} />
      )}
    </Button>
  );

  return (
    <nav
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="pager"
      data-variant={variant()}
      aria-label={labels().pagination}
    >
      <Show when={range() !== undefined}>
        <span class={cls().range} data-slot="pager-range">
          {range()}
        </span>
      </Show>
      <Show when={props.pageSizes !== undefined && props.pageSizes.length > 0}>
        <span class={cls().size} data-slot="pager-size">
          <label class={cls().sizeLabel} for={sizeId}>
            {labels().pageSize}
          </label>
          <NativeSelect
            id={sizeId}
            size="sm"
            value={String(props.pageSize ?? props.pageSizes?.[0] ?? "")}
            disabled={props.isDisabled}
            onChange={(event: Event) =>
              props.onPageSizeChange?.(Number((event.target as HTMLSelectElement).value))
            }
          >
            <For each={() => props.pageSizes ?? []}>
              {(size: number) => (
                <NativeSelectOption value={String(size)}>
                  {format().format(size)}
                </NativeSelectOption>
              )}
            </For>
          </NativeSelect>
        </span>
      </Show>
      <div class={cls().controls} data-slot="pager-controls">
        <Show when={props.showEdges === true}>
          {arrow(
            () => 0,
            () => labels().first,
            atStart,
            "first",
          )}
        </Show>
        {arrow(
          () => pageIndex() - 1,
          () => labels().previous,
          atStart,
          "previous",
        )}
        <Show when={variant() === "pages"}>
          <ul class={cls().pages} data-slot="pager-pages">
            <For
              each={() =>
                pageWindow(pageIndex(), pageCount(), props.siblings ?? 1).map((slot, at) => ({
                  slot,
                  at,
                }))
              }
            >
              {(entry: { slot: PageSlot; at: number }) => (
                <li>
                  {entry.slot === "gap" ? (
                    <PaginationEllipsis />
                  ) : (
                    <Button
                      class={cls().page}
                      variant={entry.slot === pageIndex() ? "outline" : "ghost"}
                      size="icon-sm"
                      data-slot="pager-page"
                      aria-label={labels().goToPage(entry.slot + 1)}
                      aria-current={entry.slot === pageIndex() ? "page" : undefined}
                      href={props.getHref?.(entry.slot)}
                      isDisabled={props.isDisabled}
                      onPress={() => go(entry.slot as number)}
                    >
                      {format().format(entry.slot + 1)}
                    </Button>
                  )}
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={variant() !== "simple"}>
          <span class={cls().current} data-slot="pager-current">
            {labels().page(pageIndex() + 1, pageCount())}
          </span>
        </Show>
        {arrow(
          () => pageIndex() + 1,
          () => labels().next,
          atEnd,
          "next",
        )}
        <Show when={props.showEdges === true}>
          {arrow(
            () => pageCount() - 1,
            () => labels().last,
            atEnd,
            "last",
          )}
        </Show>
      </div>
    </nav>
  );
}
