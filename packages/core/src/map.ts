/**
 * List mapping primitives (Solid 2.0 parity).
 *
 * `mapArray` keeps one owned row per list entry and reuses it across updates,
 * so the work per change is proportional to what moved, not to list length.
 * `repeat` does the same over an index range with no backing list.
 *
 * Three mapping modes, picked by `options.keyed`:
 * - `true` (default) - rows keyed by item identity; `map(item, index())`
 * - a function       - rows keyed by `keyed(item)`; `map(item(), index())`
 * - `false`          - rows keyed by position; `map(item(), index)`
 */

import type { Computed, Signal } from "./signals.ts";
import { computed, createScope, onCleanup, signal } from "./signals.ts";
import type { Scope } from "./scope.ts";

export type Maybe<T> = T | undefined | null | false;

/** Row signals are written from inside the mapping computation by design */
const ROW_SIGNAL = { ownedWrite: true } as const;

interface Row<Item, MappedItem> {
  _dispose: () => void;
  _value: MappedItem;
  _item: Signal<Item> | undefined;
  _index: Signal<number> | undefined;
}

export function mapArray<Item, MappedItem>(
  list: () => Maybe<readonly Item[]>,
  map: (value: Item, index: () => number, scope: Scope) => MappedItem,
  options?: { keyed?: true; fallback?: (scope: Scope) => unknown; name?: string },
): Computed<MappedItem[]>;
export function mapArray<Item, MappedItem>(
  list: () => Maybe<readonly Item[]>,
  map: (value: () => Item, index: number, scope: Scope) => MappedItem,
  options: { keyed: false; fallback?: (scope: Scope) => unknown; name?: string },
): Computed<MappedItem[]>;
export function mapArray<Item, MappedItem>(
  list: () => Maybe<readonly Item[]>,
  map: (value: () => Item, index: () => number, scope: Scope) => MappedItem,
  options: { keyed: (item: Item) => unknown; fallback?: (scope: Scope) => unknown; name?: string },
): Computed<MappedItem[]>;
export function mapArray<Item, MappedItem>(
  list: () => Maybe<readonly Item[]>,
  map: (value: never, index: never, scope: never) => MappedItem,
  options?: {
    keyed?: boolean | ((item: Item) => unknown);
    fallback?: (scope: Scope) => unknown;
    name?: string;
  },
): Computed<MappedItem[]> {
  const keyFn = typeof options?.keyed === "function" ? options.keyed : undefined;
  const byIndex = options?.keyed === false;
  // The mapper only gets an index at all if it asked for a second argument
  const wantsIndex = map.length > 1;
  const itemIsSignal = byIndex || keyFn !== undefined;
  const indexIsSignal = !byIndex;
  const fallback = options?.fallback;

  let keys: unknown[] = [];
  let rows: Row<Item, MappedItem>[] = [];
  let mapped: MappedItem[] = [];
  let fallbackRow: Row<Item, MappedItem> | null = null;

  const disposeRow = (row: Row<Item, MappedItem>): void => {
    row._dispose();
  };

  onCleanup(() => {
    for (const row of rows) disposeRow(row);
    rows = [];
    keys = [];
    mapped = [];
    if (fallbackRow) {
      disposeRow(fallbackRow);
      fallbackRow = null;
    }
  });

  const createRow = (item: Item, index: number): Row<Item, MappedItem> => {
    let row!: Row<Item, MappedItem>;
    createScope(
      (dispose, scope) => {
        const itemSignal = itemIsSignal ? signal(item, ROW_SIGNAL) : undefined;
        const indexSignal = wantsIndex && indexIsSignal ? signal(index, ROW_SIGNAL) : undefined;
        const value = (map as unknown as (a: unknown, b: unknown, c: unknown) => MappedItem)(
          itemSignal ?? item,
          indexSignal ?? index,
          scope,
        );
        row = { _dispose: dispose, _value: value, _item: itemSignal, _index: indexSignal };
      },
      true,
      "each",
    );
    return row;
  };

  const clearFallback = (): void => {
    if (fallbackRow) {
      disposeRow(fallbackRow);
      fallbackRow = null;
    }
  };

  const node = computed<MappedItem[]>(
    () => {
      const source = list();
      const items = source || [];
      const newLen = items.length;

      if (newLen === 0) {
        if (rows.length > 0) {
          for (const row of rows) disposeRow(row);
          rows = [];
          keys = [];
          mapped = [];
        }
        if (fallback) {
          if (fallbackRow === null) {
            fallbackRow = createFallbackRow(fallback);
            mapped = [fallbackRow._value];
          }
          return mapped;
        }
        return mapped;
      }

      clearFallback();

      const newKeys: unknown[] = keyFn
        ? items.map(keyFn)
        : byIndex
          ? // Positional rows: identity is the slot, so keys are the indices
            items.map((_, i) => i)
          : (items.slice() as unknown[]);

      const oldLen = rows.length;
      const nextRows: Row<Item, MappedItem>[] = new Array(newLen);
      let changed = oldLen !== newLen;

      // Common prefix: same key in the same slot, nothing to move
      let start = 0;
      const shortest = oldLen < newLen ? oldLen : newLen;
      while (start < shortest && keys[start] === newKeys[start]) {
        nextRows[start] = rows[start];
        start++;
      }

      // Common suffix
      let oldEnd = oldLen - 1;
      let newEnd = newLen - 1;
      while (oldEnd >= start && newEnd >= start && keys[oldEnd] === newKeys[newEnd]) {
        nextRows[newEnd] = rows[oldEnd];
        if (oldEnd !== newEnd) changed = true;
        oldEnd--;
        newEnd--;
      }

      if (start <= newEnd || start <= oldEnd) changed = true;

      // Middle section: match by key, reusing each old row at most once.
      // newIndicesNext chains duplicate keys so repeats map to distinct rows.
      const newIndices = new Map<unknown, number>();
      const newIndicesNext: number[] = new Array(newEnd + 1);
      for (let j = newEnd; j >= start; j--) {
        const key = newKeys[j];
        const existing = newIndices.get(key);
        newIndicesNext[j] = existing === undefined ? -1 : existing;
        newIndices.set(key, j);
      }

      for (let i = start; i <= oldEnd; i++) {
        const key = keys[i];
        const j = newIndices.get(key);
        if (j !== undefined && j !== -1) {
          nextRows[j] = rows[i];
          newIndices.set(key, newIndicesNext[j]);
        } else {
          disposeRow(rows[i]);
        }
      }

      for (let j = start; j <= newEnd; j++) {
        if (nextRows[j] === undefined) {
          nextRows[j] = createRow(items[j], j);
        }
      }

      // Re-point reused rows at their (possibly new) item and index
      for (let j = 0; j < newLen; j++) {
        const row = nextRows[j];
        if (row._item !== undefined) {
          const item = items[j];
          if (row._item.peek() !== item) {
            row._item.set(item);
            changed = true;
          }
        }
        if (row._index !== undefined && row._index.peek() !== j) {
          row._index.set(j);
        }
      }

      rows = nextRows;
      keys = newKeys;

      if (changed || mapped.length !== newLen) {
        mapped = new Array(newLen);
        for (let j = 0; j < newLen; j++) mapped[j] = nextRows[j]._value;
      }
      return mapped;
    },
    options?.name !== undefined ? { name: options.name } : undefined,
  );

  return node;
}

function createFallbackRow<Item, MappedItem>(
  fallback: (scope: Scope) => unknown,
): Row<Item, MappedItem> {
  let row!: Row<Item, MappedItem>;
  createScope(
    (dispose, scope) => {
      row = {
        _dispose: dispose,
        _value: fallback(scope) as MappedItem,
        _item: undefined,
        _index: undefined,
      };
    },
    true,
    "each",
  );
  return row;
}

/**
 * Map a reactive count to `count` owned rows. Rows outside the range are
 * disposed, rows inside are kept, so growing or shrinking only touches the
 * difference.
 *
 * `from` shifts the index the mapper receives (default 0).
 */
export function repeat<MappedItem>(
  count: () => number,
  map: (index: number, scope: Scope) => MappedItem,
  options?: { from?: () => number; fallback?: (scope: Scope) => unknown; name?: string },
): Computed<MappedItem[]> {
  const fallback = options?.fallback;
  const fromFn = options?.from;

  let rows: Row<never, MappedItem>[] = [];
  let mapped: MappedItem[] = [];
  let prevFrom = 0;
  let fallbackRow: Row<never, MappedItem> | null = null;

  onCleanup(() => {
    for (const row of rows) row._dispose();
    rows = [];
    mapped = [];
    fallbackRow?._dispose();
    fallbackRow = null;
  });

  const createRow = (index: number): Row<never, MappedItem> => {
    let row!: Row<never, MappedItem>;
    createScope(
      (dispose, scope) => {
        row = {
          _dispose: dispose,
          _value: map(index, scope),
          _item: undefined,
          _index: undefined,
        };
      },
      true,
      "each",
    );
    return row;
  };

  return computed<MappedItem[]>(
    () => {
      const total = count();
      const from = fromFn ? fromFn() : 0;
      const newLen = total < 0 ? 0 : total;

      if (newLen === 0) {
        if (rows.length > 0) {
          for (const row of rows) row._dispose();
          rows = [];
          mapped = [];
        }
        if (fallback) {
          if (fallbackRow === null) {
            fallbackRow = createFallbackRow(fallback);
            mapped = [fallbackRow._value];
          }
          return mapped;
        }
        return mapped;
      }

      if (fallbackRow !== null) {
        fallbackRow._dispose();
        fallbackRow = null;
        mapped = [];
      }

      // A shifted range invalidates every row: the index each mapper closed over
      // no longer matches its slot
      if (from !== prevFrom) {
        for (const row of rows) row._dispose();
        rows = [];
        prevFrom = from;
      }

      const oldLen = rows.length;
      if (newLen === oldLen) return mapped;

      if (newLen < oldLen) {
        for (let i = newLen; i < oldLen; i++) rows[i]._dispose();
        rows.length = newLen;
      } else {
        for (let i = oldLen; i < newLen; i++) rows[i] = createRow(from + i);
      }

      mapped = new Array(newLen);
      for (let i = 0; i < newLen; i++) mapped[i] = rows[i]._value;
      return mapped;
    },
    options?.name !== undefined ? { name: options.name } : undefined,
  );
}
