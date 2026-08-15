/**
 * `CODESIGN.md` §3.10 — the two halves of a form write that no runtime-only
 * design can get right, and the reason `bind:` is compiler syntax.
 *
 * 1. **Compare against the ELEMENT, not against the last framework write.** The
 *    fused record's `!==` guard compares a value against what the framework
 *    applied. For a user-mutable property that is the wrong subject: the user
 *    also writes it. A handler that REJECTS or NORMALISES a keystroke leaves
 *    the DOM holding text no signal ever contained, and the cached compare then
 *    never repairs it — the defining case controlled inputs exist for.
 *
 * 2. **The write that does land must not eat the caret.** `input.value = x`
 *    moves the text entry cursor to the end of the control (HTML §4.10.5.5),
 *    so a value written while the user is typing discards their selection and
 *    puts the caret after the last character. This project has shipped that
 *    failure once already, in replace-based hydration, and it was found by
 *    measuring rather than by testing.
 */

/** What `element[name] = value` would coerce to, for a DOMString property. */
function stringify(value: unknown): string {
  return typeof value === "string" ? value : String(value as string);
}

/** The property's value as the DOM would hold it after `element[name] = value`. */
export function coerceLive(name: string, value: unknown): unknown {
  switch (name) {
    // `[LegacyNullToEmptyString] DOMString` — the DOM answers "" for null, and
    // "undefined" for undefined, which no author ever means.
    case "value":
    case "textContent":
    case "innerText":
    case "innerHTML":
      return value === null || value === undefined ? "" : stringify(value);
    case "checked":
    case "indeterminate":
    case "selected":
    case "open":
    case "muted":
      return Boolean(value);
    case "valueAsNumber":
    case "currentTime":
    case "volume":
    case "playbackRate":
    case "scrollTop":
    case "scrollLeft":
    case "selectedIndex":
      return value === null || value === undefined ? Number.NaN : Number(value);
    default:
      return value;
  }
}

/**
 * Whether the DOM already holds `next`.
 *
 * `NaN` compares EQUAL to itself here, and that is not a nicety: an empty
 * `<input type="number">` reads `valueAsNumber === NaN`, so `!==` would write
 * on every single run and clear the field the user is typing into.
 */
export function holdsLive(element: Element, name: string, next: unknown): boolean {
  const current = (element as Element & Record<string, unknown>)[name];
  if (current === next) return true;
  if (typeof current === "number" && typeof next === "number") {
    return Number.isNaN(current) && Number.isNaN(next);
  }
  if (current instanceof Date && next instanceof Date) {
    return current.getTime() === next.getTime();
  }
  return false;
}

interface TextSelection {
  readonly start: number;
  readonly end: number;
  readonly direction: "forward" | "backward" | "none";
}

/**
 * The input types whose `selectionStart` is not null. `number`, `email`,
 * `date` and the rest raise `InvalidStateError` on `setSelectionRange`, so the
 * membership test is the guard rather than a `try`.
 */
const SELECTABLE_INPUT_TYPES = new Set(["text", "search", "url", "tel", "password", ""]);

interface TextControl extends HTMLElement {
  type?: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: "forward" | "backward" | "none" | null;
  setSelectionRange(start: number, end: number, direction?: string): void;
}

function asTextControl(element: Element): TextControl | null {
  const tag = element.tagName;
  if (tag === "TEXTAREA") return element as unknown as TextControl;
  if (tag !== "INPUT") return null;
  const type = (element as Partial<HTMLInputElement>).type ?? "text";
  return SELECTABLE_INPUT_TYPES.has(type) ? (element as unknown as TextControl) : null;
}

/** Whether `element` currently has the caret, in its own document. */
function isFocused(element: Element): boolean {
  const doc = element.ownerDocument;
  if (doc === null || doc === undefined) return false;
  return doc.activeElement === element;
}

/**
 * Text offset of `(node, offset)` counted from the start of `root`'s text, so a
 * caret in a contenteditable survives a write that replaces its text node.
 */
function textOffset(root: Node, node: Node, offset: number): number {
  if (node === root) {
    let total = 0;
    for (let index = 0; index < offset && index < root.childNodes.length; index++) {
      total += root.childNodes[index]?.textContent?.length ?? 0;
    }
    return total;
  }
  let total = 0;
  const walk = (current: Node): boolean => {
    if (current === node) {
      total += offset;
      return true;
    }
    if (current.nodeType === 3) {
      total += (current as Text).data.length;
      return false;
    }
    for (const child of Array.from(current.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };
  walk(root);
  return total;
}

/** The inverse of `textOffset`: `(node, offset)` for a character position. */
function positionAt(root: Node, target: number): [Node, number] {
  let remaining = target;
  const walk = (current: Node): [Node, number] | null => {
    if (current.nodeType === 3) {
      const length = (current as Text).data.length;
      if (remaining <= length) return [current, remaining];
      remaining -= length;
      return null;
    }
    for (const child of Array.from(current.childNodes)) {
      const found = walk(child);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(root) ?? [root, root.childNodes.length];
}

interface Saved {
  readonly control: TextControl | null;
  readonly text: TextSelection | null;
  readonly range: { start: number; end: number } | null;
  readonly refocus: boolean;
}

/**
 * Everything about the caret that a property write is about to destroy, or
 * `null` when nothing is at risk — which is every write to an element the user
 * is not currently inside, i.e. all of them but the one that matters.
 */
export function captureCaret(element: Element): Saved | null {
  if (!isFocused(element)) return null;
  const control = asTextControl(element);
  if (control !== null) {
    const start = control.selectionStart;
    if (start === null) return { control: null, text: null, range: null, refocus: true };
    return {
      control,
      text: {
        start,
        end: control.selectionEnd ?? start,
        direction: control.selectionDirection ?? "none",
      },
      range: null,
      refocus: true,
    };
  }
  if (!(element as HTMLElement).isContentEditable) {
    return { control: null, text: null, range: null, refocus: true };
  }
  const selection = element.ownerDocument?.defaultView?.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return { control: null, text: null, range: null, refocus: true };
  }
  // The RANGE, not `anchorNode`/`focusOffset`. A range is what every DOM
  // actually agrees on: the anchor/focus accessors carry the direction and are
  // the pair implementations get wrong (happy-dom's `focusOffset` returns the
  // anchor's), and direction is not a thing a contenteditable write can lose.
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return { control: null, text: null, range: null, refocus: true };
  }
  return {
    control: null,
    text: null,
    range: {
      start: textOffset(element, range.startContainer, range.startOffset),
      end: textOffset(element, range.endContainer, range.endOffset),
    },
    refocus: true,
  };
}

/**
 * Put the caret back where `captureCaret` found it, clamped to the text that is
 * now there. Focus is restored too: a write that detaches and replaces the
 * focused node blurs it, and a control the user was inside must still be the
 * one the next keystroke reaches.
 */
export function restoreCaret(element: Element, saved: Saved | null): void {
  if (saved === null) return;
  if (saved.refocus && !isFocused(element)) {
    (element as HTMLElement).focus?.();
  }
  const { control, text } = saved;
  if (control !== null && text !== null) {
    const length = (control as unknown as { value: string }).value.length;
    const start = Math.min(text.start, length);
    const end = Math.min(text.end, length);
    if (control.selectionStart !== start || control.selectionEnd !== end) {
      control.setSelectionRange(start, end, text.direction);
    }
    return;
  }
  if (saved.range === null) return;
  const doc = element.ownerDocument;
  const selection = doc?.defaultView?.getSelection?.();
  if (!selection || !doc) return;
  const total = element.textContent?.length ?? 0;
  const [startNode, startOffset] = positionAt(element, Math.min(saved.range.start, total));
  const [endNode, endOffset] = positionAt(element, Math.min(saved.range.end, total));
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The user-mutable write. Both halves, in the one place every path reaches it:
 * the compiled `Chan::Live` channel, `bind:`'s effect, `bind:`'s re-assertion
 * after a reported edit, and `createElement`'s dispatcher.
 */
export function writeLive(element: Element, name: string, value: unknown): boolean {
  const next = coerceLive(name, value);
  if (holdsLive(element, name, next)) return false;
  const saved = captureCaret(element);
  (element as Element & Record<string, unknown>)[name] = next;
  restoreCaret(element, saved);
  return true;
}
