/**
 * The element builder these benchmarks measure, after M9.
 *
 * `createElement` is gone: there is one calling convention and no un-compiled
 * authoring path, so the runtime no longer carries a second implementation of
 * component invocation. What survives is `element(scope, tag, props)` — the
 * build-by-name path a template cannot express — and it does the same work the
 * old builder did, through the same `spread` and `insert` entry points a
 * compiled element goes through.
 *
 * The shims below keep every bar in this package measuring the same OPERATION
 * as before, so the numbers stay comparable across the milestone:
 *
 *  - `h` builds one element with props and children;
 *  - `Show` and `For` call `branch` and `each` directly, which is what the
 *    deleted adapters did one frame later.
 *
 * A benchmark that hand-rolls what the runtime "would" do measures the author's
 * memory of it, so nothing here reimplements anything: every function is a
 * two-line adapter over an entry point the compiler itself emits.
 */

import {
  type Block,
  type Cell,
  type Child,
  type Scope,
  block,
  branch,
  root,
  each,
  element,
  getOwner,
} from "@barqjs/core";

type Props = Record<string, unknown> | null;

/** One element, built by tag name — the shape `createElement` used to take. */
export function h(tag: string, props: Props, ...children: Child[]): Node {
  const build = (): Node => {
    const record: Record<string, unknown> = { ...(props ?? {}) };
    if (children.length > 0) {
      record.children = children.length === 1 ? children[0] : children;
    }
    return element(getOwner(), tag, record);
  };
  // Every prop write is scope-owned (B4/O4.5), so a builder called outside any
  // owner needs one. `createElement` reached for `getOwner()` and threw the
  // same way; opening a root here is what keeps a bench a bench.
  return getOwner() === null ? root(build) : build();
}

/** `Show`, as the `branch` it always reached. */
export function Show(
  when: Cell<unknown>,
  body: () => Child,
  fallback?: () => Child,
): Node | null {
  const bodies = [
    fallback === undefined ? null : (block(fallback) as Block<unknown>),
    block(body) as Block<unknown>,
  ];
  return branch(getOwner() as Scope | null, null, null, () => (when() ? 1 : 0), bodies);
}

/** `For`, as the `each` it always reached. Identity-keyed, which is the default. */
export function For<T>(
  source: Cell<readonly T[]>,
  row: (scope: Scope | null, item: Cell<T>) => Child,
): Node | null {
  return each(
    getOwner() as Scope | null,
    null,
    null,
    source,
    null,
    block(row) as unknown as Block<unknown, never[]>,
  );
}
