import { clamp } from "@excalidraw/math";

import type {
  ElementRenderOffsets,
  ElementRenderOverride,
  ElementRenderOverrides,
} from "../types.ts";

/** Validated and copied before it is used, so a rejected snapshot changes nothing. */
export function copyElementRenderOverrides(
  overrides: ElementRenderOverrides | null,
): ElementRenderOverrides {
  const copy = new Map<string, ElementRenderOverride>();
  for (const [id, value] of overrides ?? []) {
    const { opacity, offset } = value;
    if (
      (opacity !== undefined && !Number.isFinite(opacity)) ||
      (offset !== undefined &&
        (offset === null || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)))
    ) {
      throw new TypeError(`Render overrides for ${id} must be finite numbers`);
    }
    if (opacity === undefined && offset === undefined) {
      continue;
    }
    copy.set(id, {
      ...(opacity !== undefined ? { opacity: clamp(opacity, 0, 100) } : {}),
      ...(offset ? { offset: { x: offset.x, y: offset.y } } : {}),
    });
  }
  return copy;
}

/**
 * The offsets of a snapshot, `previous` itself when they are the same: the
 * visible set is memoized on this map, so a fade never measures the viewport
 * again.
 */
export function getElementRenderOffsets(
  overrides: ElementRenderOverrides,
  previous: ElementRenderOffsets,
): ElementRenderOffsets {
  let offsetCount = 0;
  let changed = false;
  for (const [id, { offset }] of overrides) {
    if (!offset) {
      continue;
    }
    offsetCount++;
    const before = previous.get(id);
    if (!before || before.x !== offset.x || before.y !== offset.y) {
      changed = true;
      break;
    }
  }
  if (!changed && offsetCount === previous.size) {
    return previous;
  }
  const next = new Map<string, NonNullable<ElementRenderOverride["offset"]>>();
  for (const [id, { offset }] of overrides) {
    if (offset) {
      next.set(id, offset);
    }
  }
  return next;
}
