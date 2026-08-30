/**
 * Keeping a long press from selecting text.
 *
 * iOS WebKit begins a text selection on long press, and the only thing that
 * stops it is `user-select: none` on the document element: setting it on the
 * pressed element alone still lets the selection start on a neighbour. So on
 * iOS this is page-wide and reference-counted through three states, because
 * two elements pressed in sequence must not have the second's restore undo the
 * first's disable.
 *
 * Everywhere else the property goes on the element itself. Applying and
 * removing it document-wide forces a style recalculation for the whole page on
 * every press, which is measurable on a large document.
 */

import { ownerDocument } from "../dom.ts";
import { isIOS, isWebKit } from "../platform.ts";
import { runAfterTransition } from "../dom.ts";

type State = "default" | "disabled" | "restoring";

let state: State = "default";
let savedUserSelect = "";
const modified = new WeakMap<Element, string>();

function userSelectProperty(element: HTMLElement | SVGElement): "userSelect" | "webkitUserSelect" {
  return "userSelect" in element.style ? "userSelect" : "webkitUserSelect";
}

export function disableTextSelection(target?: Element | null): void {
  if (isIOS() && isWebKit()) {
    if (state === "default") {
      const doc = ownerDocument(target);
      savedUserSelect = doc.documentElement.style.webkitUserSelect;
      doc.documentElement.style.webkitUserSelect = "none";
    }
    state = "disabled";
    return;
  }

  if (target instanceof HTMLElement || target instanceof SVGElement) {
    const property = userSelectProperty(target);
    modified.set(target, target.style[property]);
    target.style[property] = "none";
  }
}

export function restoreTextSelection(target?: Element | null): void {
  if (isIOS() && isWebKit()) {
    if (state !== "disabled") return;
    state = "restoring";

    // iOS can still begin a selection just after pointer up, so the restore
    // waits; and it waits again for any transition, so the page-wide style
    // recalculation does not land in the middle of an animation.
    setTimeout(() => {
      runAfterTransition(() => {
        if (state !== "restoring") return;
        const doc = ownerDocument(target);
        if (doc.documentElement.style.webkitUserSelect === "none") {
          doc.documentElement.style.webkitUserSelect = savedUserSelect || "";
        }
        savedUserSelect = "";
        state = "default";
      });
    }, 300);
    return;
  }

  if ((target instanceof HTMLElement || target instanceof SVGElement) && modified.has(target)) {
    const previous = modified.get(target) as string;
    const property = userSelectProperty(target);
    if (target.style[property] === "none") target.style[property] = previous;
    if (target.getAttribute("style") === "") target.removeAttribute("style");
    modified.delete(target);
  }
}
