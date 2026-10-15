import { createMemo, createRenderEffect, onCleanup, untrack } from "@barqjs/core";
import { constructTable } from "@tanstack/table-core";
import type { RowData, Table, TableFeatures, TableOptions } from "@tanstack/table-core";

import { FlexRender } from "./FlexRender.ts";
import { barqReactivity } from "./reactivity.ts";

export type BarqTable<TFeatures extends TableFeatures, TData extends RowData> = Table<
  TFeatures,
  TData
> & {
  /** `<table.FlexRender cell={cell} />`, the same component `FlexRender` is. */
  FlexRender: typeof FlexRender;
};

/** Options as they are, or an accessor that is re-applied when what it reads changes. */
export type MaybeAccessor<T> = T | (() => T);

// Descriptors, not values: an option written as a getter stays a live read on
// the merged object instead of being frozen at the value it had when merged.
export function mergeDescriptors(...sources: Array<object>): object {
  const merged = {};
  for (const source of sources) {
    Object.defineProperties(merged, Object.getOwnPropertyDescriptors(source));
  }
  return merged;
}

/**
 * Creates a table whose APIs and atoms are tracked reads: call them inside JSX,
 * `createMemo` or an effect and that computation follows the slice it read.
 *
 * Pass the options as an accessor to make them reactive. An options object is
 * also accepted, and a getter on it (`get data() { return rows() }`) is read
 * live, the way the Solid adapter's options are.
 */
export function createTable<TFeatures extends TableFeatures, TData extends RowData>(
  tableOptions: MaybeAccessor<TableOptions<TFeatures, TData>>,
): BarqTable<TFeatures, TData> {
  const reactivity = barqReactivity();
  const read =
    typeof tableOptions === "function" ? tableOptions : (): typeof tableOptions => tableOptions;

  const resolved = createMemo(() => {
    const options = read();
    // table-core resolves controlled state inside its own atoms, which a barq
    // signal cannot invalidate. Reading every controlled slice here is what
    // brings the options back through `setOptions` when one of them moves.
    const state = options.state as Record<string, unknown> | undefined;
    if (state !== undefined) {
      for (const key in state) void state[key];
    }
    return mergeDescriptors(options, {
      features: { coreReactivityFeature: reactivity, ...options.features },
    }) as TableOptions<TFeatures, TData>;
  });

  let applied = untrack(resolved);

  const merge = (
    defaults: TableOptions<TFeatures, TData>,
    options: TableOptions<TFeatures, TData>,
  ): TableOptions<TFeatures, TData> =>
    mergeDescriptors(defaults, options) as TableOptions<TFeatures, TData>;

  const table = constructTable(
    mergeDescriptors({ mergeOptions: merge }, applied) as TableOptions<TFeatures, TData>,
  ) as BarqTable<TFeatures, TData>;

  // table-core builds its first options by spreading, which reads every
  // getter once. Merging again by descriptor puts the live reads back.
  table.setOptions((previous) => merge(previous, applied));

  createRenderEffect(resolved, (next) => {
    if (next === applied) return;
    applied = next;
    untrack(() => {
      table.setOptions((previous) => merge(previous, next));
    });
  });

  onCleanup(() => reactivity.unmount?.());

  table.FlexRender = FlexRender;

  return table;
}
