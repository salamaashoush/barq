/**
 * A one-time code: one real input, and what to draw for each character of it.
 *
 * This is the piece `@barqjs/ui`'s `<InputOTP>` needed. shadcn's is the
 * `input-otp` package, which is React hooks around a context, so the engine is
 * written here and the behaviour is that package's.
 *
 * **One input, not one per character.** An input per character breaks paste
 * (each takes one character), breaks `autocomplete="one-time-code"` (the
 * platform fills one field) and gives a screen reader six unlabelled boxes.
 * Everything below follows from keeping one: the boxes are drawings, so which
 * box is "active" has to be derived from the input's own selection.
 *
 * **A caret on a character selects it.** A box holds one character, so a caret
 * between two of them has nothing to draw. Wherever the browser puts a
 * collapsed caret on a filled position the field widens it to that character,
 * which is also what makes typing there replace rather than insert and push
 * the last character off the end.
 *
 * **A change the pattern refuses is dropped whole.** Not filtered: `pattern`
 * is the HTML attribute's meaning, a test of the entire value, and a paste of
 * `12ab` into a digits field is a mistake to ignore rather than a `12` to keep.
 * `sanitize` runs first for a caller who does want filtering.
 *
 * **The input is invisible by colour, not by opacity.** Password managers and
 * the platform's own code autofill skip a field they consider hidden, and
 * `opacity: 0` is how they decide. The badge a manager then draws inside the
 * field would sit on top of the last box, so the input is widened past the
 * boxes and clipped back, which moves the badge out beside them.
 */

import { createSignal, createTrackedEffect, onCleanup, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";

/** Digits only. For `pattern`. */
export const REGEXP_ONLY_DIGITS = "^\\d+$";
/** Latin letters only. For `pattern`. */
export const REGEXP_ONLY_CHARS = "^[a-zA-Z]+$";
/** Digits and Latin letters. For `pattern`. */
export const REGEXP_ONLY_DIGITS_AND_CHARS = "^[a-zA-Z0-9]+$";

export type OtpSelectionDirection = "forward" | "backward" | "none";

export interface OtpSelection {
  readonly start: number | null;
  readonly end: number | null;
  readonly direction?: OtpSelectionDirection | undefined;
}

export interface OtpSelectionInput {
  value: string;
  maxLength: number;
  /** Where the browser has the selection now. */
  start: number | null;
  end: number | null;
  direction?: OtpSelectionDirection | null | undefined;
  /** What this function answered last time, which is how it knows which way the caret moved. */
  previous: OtpSelection;
}

/**
 * The selection the field should hold, given where the browser put it.
 *
 * A range the person made is returned as it is, and so is the caret at the end
 * of a value with room left, which is where the next character goes. Every
 * other collapsed caret becomes the one character it points at.
 */
export function otpSelection(input: OtpSelectionInput): OtpSelection {
  const { value, maxLength, start, end, previous } = input;
  const given = input.direction ?? undefined;
  if (value.length === 0 || start === null || end === null) {
    return { start, end, direction: given };
  }

  const isCaret = start === end;
  const isInserting = start === value.length && value.length < maxLength;
  if (!isCaret || isInserting) return { start, end, direction: given };

  if (start === 0) return { start: 0, end: 1, direction: "forward" };
  if (start === maxLength) return { start: start - 1, end: start, direction: "backward" };
  if (maxLength <= 1 || value.length <= 1) return { start, end, direction: given };

  let offset = 0;
  let direction = given;
  if (previous.start !== null && previous.end !== null) {
    direction = start < previous.end ? "backward" : "forward";
    const wasInserting = previous.start === previous.end && previous.start < maxLength;
    // Leaving a selected character leftward lands the caret on its own left
    // edge, so the character meant is the one before.
    if (direction === "backward" && !wasInserting) offset = -1;
  }
  return { start: start + offset, end: start + offset + 1, direction };
}

export interface OtpSlot {
  /** The character in this position, or `null` while it is empty. */
  readonly char: string | null;
  /** The placeholder's character for this position, while the whole field is empty. */
  readonly placeholderChar: string | null;
  /** The caret or the selection is on it. */
  readonly isActive: boolean;
  /** It is active and empty, so a caret has to be drawn: the real one is invisible. */
  readonly hasFakeCaret: boolean;
}

export type OtpPasswordManagerStrategy = "increase-width" | "none";

export interface OtpFieldOptions {
  /** How many characters. */
  maxLength: MaybeAccessor<number>;
  value?: MaybeAccessor<string | undefined>;
  defaultValue?: MaybeAccessor<string | undefined>;
  onChange?: (value: string) => void;
  /** Called when the value BECOMES full, by typing, pasting or the caller. */
  onComplete?: (value: string) => void;
  /** A test of the whole value. A change that fails it is refused. */
  pattern?: MaybeAccessor<string | RegExp | undefined>;
  /** Applied to what was typed before `pattern` judges it. */
  sanitize?: (raw: string) => string;
  /** Applied to pasted text before it is inserted, for a code copied with its separators. */
  pasteTransformer?: MaybeAccessor<((pasted: string) => string) | undefined>;
  placeholder?: MaybeAccessor<string | undefined>;
  /**
   * What to do about the badge a password manager draws inside the field.
   * @default "increase-width"
   */
  pushPasswordManagerStrategy?: MaybeAccessor<OtpPasswordManagerStrategy | undefined>;
}

export interface OtpField {
  readonly value: Accessor<string>;
  readonly isFocused: Accessor<boolean>;
  readonly isHovering: Accessor<boolean>;
  /** One entry per position, `maxLength` of them. */
  readonly slots: Accessor<readonly OtpSlot[]>;
  /**
   * Whether the input should be widened by {@link OTP_BADGE_SPACE} and clipped
   * back, which moves a password manager's badge out beside the boxes.
   */
  readonly willPushPasswordManagerBadge: Accessor<boolean>;
  /** The handlers for the real input. */
  readonly inputProps: {
    onInput(event: Event): void;
    onPaste(event: ClipboardEvent): void;
    onFocus(): void;
    onBlur(): void;
    onSelect(): void;
    onKeyUp(): void;
    onClick(): void;
    onMouseEnter(): void;
    onMouseLeave(): void;
  };
}

/** How far the input is widened to carry a password manager's badge out of the boxes. */
export const OTP_BADGE_SPACE = "40px";
const BADGE_SPACE_PX = 40;
/** How far in from the right edge a manager draws its badge. */
const BADGE_INSET = 18;

const PASSWORD_MANAGERS = [
  "[data-lastpass-icon-root]",
  "com-1password-button",
  "[data-dashlanecreated]",
  '[style$="2147483647 !important;"]',
].join(",");

type InputRef = () => HTMLInputElement | null | undefined;
type ContainerRef = () => HTMLElement | null | undefined;

function toRegExp(pattern: string | RegExp | undefined): RegExp | null {
  if (pattern === undefined) return null;
  // A fresh one either way: `lastIndex` is state on a global or sticky regex,
  // and reusing the caller's would fail every other test.
  return typeof pattern === "string"
    ? new RegExp(pattern)
    : new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
}

/**
 * Whether a password manager has drawn a badge in the field, and whether there
 * is room beside the field to move it to.
 *
 * Looked for only once the field is focused, and a few times over, because a
 * manager injects its badge whenever it gets round to it. A known manager is
 * recognised by its own markup; an unknown one by something other than the
 * field answering a hit test where a badge would be.
 */
function passwordManagerBadge(
  input: InputRef,
  container: ContainerRef,
  isFocused: Accessor<boolean>,
  strategy: Accessor<OtpPasswordManagerStrategy>,
): Accessor<boolean> {
  const [hasBadge, setHasBadge] = createSignal(false);
  const [hasSpace, setHasSpace] = createSignal(false);
  let done = false;

  const look = (): void => {
    const box = container();
    const field = input();
    if (done || box === null || box === undefined || field === null || field === undefined) return;

    const rect = box.getBoundingClientRect();
    setHasSpace(window.innerWidth - rect.right >= BADGE_SPACE_PX);

    if (document.querySelectorAll(PASSWORD_MANAGERS).length === 0) {
      const x = rect.left + box.offsetWidth - BADGE_INSET;
      const y = rect.top + box.offsetHeight / 2;
      const found =
        typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y) : null;
      if (found === null || found === field || box.contains(found)) return;
    }
    done = true;
    setHasBadge(true);
  };

  createTrackedEffect(() => {
    if (strategy() === "none" || !isFocused()) return undefined;
    const timers = [0, 2000, 5000].map((delay) => setTimeout(look, delay));
    timers.push(
      setTimeout(() => {
        done = true;
      }, 6000),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  });

  return () => strategy() === "increase-width" && hasBadge() && hasSpace();
}

/**
 * The state of a one-time-code field over the real input at `input`.
 *
 * `container` is the element the boxes are in, which is what a password
 * manager's badge is looked for against.
 */
export function otpField(
  options: OtpFieldOptions,
  input: InputRef,
  container: ContainerRef = () => null,
): OtpField {
  const [inner, setInner] = createSignal(access(options.defaultValue) ?? "");
  const [isFocused, setFocused] = createSignal(false);
  const [isHovering, setHovering] = createSignal(false);
  const [mirror, setMirror] = createSignal<OtpSelection>({ start: null, end: null });

  const maxLength = (): number => access(options.maxLength);
  const value = (): string => access(options.value) ?? inner();

  // The gesture's own copies: an `input` event is handled in the tick it
  // arrives, and a signal write is not published until the flush.
  let held = value();
  let previous: OtpSelection = { start: null, end: null };

  const sync = (): void => {
    const element = input();
    if (element === null || element === undefined) return;
    // The root's, not the document's: inside a shadow tree the document only
    // ever reports the host.
    const root = element.getRootNode() as Document | ShadowRoot;
    if (root.activeElement !== element) {
      // Every field on the page hears every selection change, so one that was
      // already idle says nothing.
      if (previous.start === null && previous.end === null) return;
      previous = { start: null, end: null };
      setMirror(previous);
      return;
    }

    const next = otpSelection({
      value: element.value,
      maxLength: maxLength(),
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
      previous,
    });
    if (
      next.start !== null &&
      next.end !== null &&
      (next.start !== element.selectionStart || next.end !== element.selectionEnd)
    ) {
      element.setSelectionRange(next.start, next.end, next.direction);
    }
    if (next.start === previous.start && next.end === previous.end) return;
    previous = next;
    setMirror(next);
  };

  const commit = (next: string): void => {
    held = next;
    if (access(options.value) === undefined) setInner(next);
    options.onChange?.(next);
  };

  const accepts = (candidate: string): boolean => {
    if (candidate.length === 0) return true;
    const pattern = toRegExp(access(options.pattern));
    return pattern === null || pattern.test(candidate);
  };

  if (typeof document !== "undefined") {
    // The one event that hears an arrow key, a drag and a programmatic change
    // alike. It fires on the document, for whichever field holds the selection.
    document.addEventListener("selectionchange", sync, { capture: true });
    onCleanup(() => document.removeEventListener("selectionchange", sync, { capture: true }));
  }

  let before: string | undefined;
  createTrackedEffect(() => {
    const next = value();
    const full = maxLength();
    held = next;
    if (before !== undefined && next !== before && before.length < full && next.length === full) {
      options.onComplete?.(next);
    }
    before = next;
    return undefined;
  });

  const willPushPasswordManagerBadge = passwordManagerBadge(
    input,
    container,
    isFocused,
    () => access(options.pushPasswordManagerStrategy) ?? "increase-width",
  );

  const slots = (): readonly OtpSlot[] => {
    const current = value();
    const { start, end } = mirror();
    const focused = isFocused();
    const placeholder = access(options.placeholder);
    const count = maxLength();
    const out: OtpSlot[] = [];
    for (let index = 0; index < count; index++) {
      const char = current[index] ?? null;
      // At the very end of a full value there is no box past the last, so the
      // caret belongs to the last one.
      const caret = start === null ? null : Math.min(start, count - 1);
      const isActive =
        focused &&
        start !== null &&
        end !== null &&
        (start === end ? index === caret : index >= start && index < end);
      out.push({
        char,
        placeholderChar: current.length === 0 ? (placeholder?.[index] ?? null) : null,
        isActive,
        hasFakeCaret: isActive && char === null,
      });
    }
    return out;
  };

  return {
    value,
    isFocused,
    isHovering,
    slots,
    willPushPasswordManagerBadge,
    inputProps: {
      onInput(event) {
        const element = event.target as HTMLInputElement;
        const raw =
          options.sanitize === undefined ? element.value : options.sanitize(element.value);
        const next = raw.slice(0, maxLength());
        if (!accepts(next)) {
          element.value = held;
          sync();
          return;
        }
        if (element.value !== next) element.value = next;
        commit(next);
        sync();
      },
      onPaste(event) {
        const transform = access(options.pasteTransformer);
        const element = input();
        // Without a transformer the browser's own paste is right, and arrives
        // as an `input` event like any other change.
        if (transform === undefined || element === null || element === undefined) return;
        const pasted = transform(event.clipboardData?.getData("text/plain") ?? "");
        event.preventDefault();

        const start = element.selectionStart ?? held.length;
        const end = element.selectionEnd ?? start;
        const next = (held.slice(0, start) + pasted + held.slice(end)).slice(0, maxLength());
        if (!accepts(next)) return;

        element.value = next;
        commit(next);
        element.setSelectionRange(Math.min(next.length, maxLength() - 1), next.length);
        sync();
      },
      onFocus() {
        const element = input();
        if (element !== null && element !== undefined) {
          // The next position to fill, or the last character of a full value:
          // wherever the click landed, that is what typing should act on.
          const length = element.value.length;
          element.setSelectionRange(Math.min(length, maxLength() - 1), length);
        }
        setFocused(true);
        sync();
      },
      onBlur() {
        setFocused(false);
        previous = { start: null, end: null };
        setMirror(previous);
      },
      onSelect: sync,
      onKeyUp: sync,
      onClick: sync,
      onMouseEnter() {
        setHovering(true);
      },
      onMouseLeave() {
        setHovering(false);
      },
    },
  };
}
