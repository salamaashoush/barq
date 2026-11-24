import { type Child, For, Show, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useSearchParams } from "@barqjs/router";
import { srOnly } from "@barqjs/ui/sr-only";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bound } from "../lib/search-state.ts";
import { gap, glyph, layout } from "../style/index.ts";
import type { NavIcon } from "./app-shell.tsx";
import { useArcMessages } from "./messages.ts";

/** One way of showing the same records: a list, a board, a table, a calendar. */
export interface ViewOption {
  id: string;
  label: string;
  icon?: NavIcon;
}

/** A view and what it draws, over the data and filters every view shares. */
export interface DataView extends ViewOption {
  content: () => Child;
}

export const viewSwitcherStyles = variants({
  slots: {
    root: arc(layout.column, gap[3], layout.minZero, layout.container),
    header: arc(layout.row, layout.wrap, gap[2]),
    toolbar: arc(layout.grow, layout.minZero),
    switcher: arc(layout.noShrink),
    item: arc(gap[1.5], glyph.md),
    label: arc({}),
    content: arc(layout.minZero),
  },
});

type Slots = ReturnType<typeof viewSwitcherStyles>;

/** Where the chosen view lives: the URL's `param`, the caller's `view`, or the switcher's own. */
export interface ViewBinding {
  view?: string;
  defaultView?: string;
  onViewChange?: (view: string) => void;
  /** Keep the view in this search parameter, so a view has a link and survives a reload. */
  param?: string;
}

export interface ViewSwitcherProps extends ViewBinding, Customisable<Slots> {
  views: readonly ViewOption[];
  /** @default arc's "View" */
  "aria-label"?: string;
  /** Icons alone, the label kept for a screen reader and the tooltip. @default false */
  iconOnly?: boolean;
  /** @default "sm" */
  size?: "sm" | "default";
}

function useView(props: ViewBinding & { views: readonly ViewOption[] }) {
  const param = untrack(() => props.param);
  const url = param === undefined ? undefined : useSearchParams();
  const first = (): string => props.views[0]?.id ?? "";
  const known = (id: string | null | undefined): string | undefined =>
    id !== null && id !== undefined && props.views.some((view) => view.id === id) ? id : undefined;
  return bound<string>(
    url,
    param,
    () => known(props.view),
    untrack(() => known(props.defaultView)) ?? "",
    (raw) => known(raw) ?? known(untrack(() => props.defaultView)) ?? first(),
    (value) => value,
    (value) => props.onViewChange?.(value),
  );
}

/**
 * The choice of view: one pressed button per view, on ui's toggle group.
 * One Tab stop, the arrows moving in the reading direction.
 */
export function ViewSwitcher(props: ViewSwitcherProps) {
  const view = useView(props);
  return (
    <Switcher {...props} current={(view.read() || props.views[0]?.id) ?? ""} onPick={view.write} />
  );
}

function Switcher(
  props: Omit<ViewSwitcherProps, keyof ViewBinding> & {
    current: string;
    onPick: (view: string) => void;
  },
) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(viewSwitcherStyles(), props.classes);
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={props.size ?? "sm"}
      class={arc(cls().switcher, props.class, props.className)}
      data-slot="view-switcher"
      aria-label={props["aria-label"] ?? messages().view}
      value={props.current}
      onValueChange={(value: string | string[]) => {
        if (typeof value === "string" && value !== "") props.onPick(value);
      }}
    >
      <For each={props.views}>
        {(option: ViewOption) => {
          const Icon = option.icon;
          return (
            <ToggleGroupItem
              value={option.id}
              class={cls().item}
              data-slot="view-switcher-item"
              title={props.iconOnly === true ? option.label : undefined}
            >
              {Icon === undefined ? null : <Icon />}
              <span
                class={props.iconOnly === true ? arc(srOnly, cls().label) : cls().label}
                data-slot="view-switcher-label"
              >
                {option.label}
              </span>
            </ToggleGroupItem>
          );
        }}
      </For>
    </ToggleGroup>
  );
}

export interface DataViewsProps extends ViewBinding, Customisable<Slots> {
  views: readonly DataView[];
  /** Names the region holding the views. */
  "aria-label": string;
  /** Beside the switcher: a `DataToolbar` whose search and filters every view reads. */
  toolbar?: Child;
  iconOnly?: boolean;
}

/**
 * The same records in the view the reader chose, with the switcher and the
 * toolbar above them. Only the chosen view is drawn; the data and filters are
 * the caller's, so switching keeps the search, the filters and the selection.
 *
 * ```tsx
 * <DataViews
 *   aria-label="Tasks"
 *   param="view"
 *   toolbar={<DataToolbar search={{ label: "Search tasks", param: "q" }} />}
 *   views={[
 *     { id: "list", label: "List", icon: List, content: () => <TaskList tasks={tasks()} /> },
 *     { id: "board", label: "Board", icon: Kanban, content: () => <TaskBoard tasks={tasks()} /> },
 *   ]}
 * />
 * ```
 */
export function DataViews(props: DataViewsProps) {
  const cls = (): Slots => parts(viewSwitcherStyles(), props.classes);
  const view = useView(props);
  const current = (): string => (view.read() || props.views[0]?.id) ?? "";
  const shown = (): DataView | undefined => props.views.find((one) => one.id === current());
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="data-views"
      data-view={current()}
      aria-label={props["aria-label"]}
    >
      <div class={cls().header} data-slot="data-views-header">
        <Show when={props.toolbar !== undefined}>
          <div class={cls().toolbar} data-slot="data-views-toolbar">
            {props.toolbar}
          </div>
        </Show>
        <Switcher
          views={props.views}
          classes={props.classes}
          iconOnly={props.iconOnly}
          current={current()}
          onPick={view.write}
        />
      </div>
      <div class={cls().content} data-slot="data-views-content">
        {shown()?.content()}
      </div>
    </section>
  );
}
