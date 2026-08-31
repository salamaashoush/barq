import {
  context,
  getContext,
  getOwner,
  provide,
  signal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { Minus } from "@barqjs/lucide/icons/minus";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { controlProps, uiProps } from "../lib/slot.ts";
import { text } from "../lib/shared-text.ts";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const container = ui({
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  "&:has(:disabled)": {
    opacity: "50%",
  },
});

/**
 * The real control, over the whole container and invisible.
 *
 * `opacity: 0` rather than `visibility: hidden` or a 1px box off-screen: it has
 * to stay hittable, because a tap on a slot is a tap on THIS, and a control the
 * page has hidden takes no focus and raises no keyboard on a phone.
 */
const control = ui({
  position: "absolute",
  inset: "0px",
  width: "100%",
  height: "100%",
  opacity: "0",
  cursor: "text",
  letterSpacing: "-0.5em",
  fontFamily: "monospace",
  "&:disabled": {
    cursor: "not-allowed",
  },
});

const root = ui({ position: "relative" });

/**
 * The drawn row takes no pointer events, and a browser is the only thing that
 * could have said so.
 *
 * Every slot is `position: relative` (shadcn's, for the caret it may hold), so
 * they are POSITIONED and paint above the absolutely positioned input behind
 * them however it is ordered. A click on a box therefore landed on the box:
 * `document.activeElement` stayed `BODY`, no slot lit, and the component was
 * unusable with a mouse while all fifteen of its tests passed. The row is
 * `aria-hidden` decoration, so declining the pointer is what it meant all along.
 */
const drawn = ui({ pointerEvents: "none" });

const group = ui({ display: "flex", alignItems: "center" });

const slot = ui(text.sm, {
  position: "relative",
  display: "flex",
  height: "calc(var(--spacing) * 9)",
  width: "calc(var(--spacing) * 9)",
  alignItems: "center",
  justifyContent: "center",
  borderBlockStyle: "var(--ui-border-style)",
  borderBlockWidth: "1px",
  borderRightStyle: "var(--ui-border-style)",
  borderRightWidth: "1px",
  borderColor: "var(--input)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "all",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "&:first-child": {
    borderTopLeftRadius: "calc(var(--radius) - 2px)",
    borderBottomLeftRadius: "calc(var(--radius) - 2px)",
    borderLeftStyle: "var(--ui-border-style)",
    borderLeftWidth: "1px",
  },
  "&:last-child": {
    borderTopRightRadius: "calc(var(--radius) - 2px)",
    borderBottomRightRadius: "calc(var(--radius) - 2px)",
  },
  '&[aria-invalid="true"]': {
    borderColor: "var(--destructive)",
  },
  '&[data-active="true"]': {
    zIndex: "10",
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  '&[data-active="true"][aria-invalid="true"]': {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
  },
  "&:is(.dark *)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  '&:is(.dark *)[data-active="true"][aria-invalid="true"]': {
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
    },
  },
});

const caretWrapper = ui({
  pointerEvents: "none",
  position: "absolute",
  inset: "0px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const caret = ui({
  height: "calc(var(--spacing) * 4)",
  width: "1px",
  animation: "caret-blink 1.25s ease-out infinite",
  backgroundColor: "var(--foreground)",
  "--ui-duration": "1000ms",
  transitionDuration: "1000ms",
});

interface OtpValue {
  readonly value: () => string;
  readonly length: () => number;
  readonly isDisabled: () => boolean;
  readonly isInvalid: () => boolean;
  /** Which slots the caret or the selection is over. */
  readonly activeRange: () => readonly [number, number];
  readonly focused: () => boolean;
}

const OtpContext = context<OtpValue | null>(null);

function useOtp(): OtpValue {
  const value = getContext(OtpContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside an <InputOTP>.");
  }
  return value;
}

export interface InputOTPProps extends UiProps {
  /** How many characters. @default 6 */
  maxLength?: number;
  value?: string;
  defaultValue?: string;
  /** What a character may be. @default /[^0-9]/g strips everything else */
  pattern?: RegExp;
  isDisabled?: boolean;
  isInvalid?: boolean;
  name?: string;
  autoFocus?: boolean;
  onChange?: (value: string) => void;
  /** Called once the last slot is filled. */
  onComplete?: (value: string) => void;
}

/**
 * ```tsx
 * <InputOTP maxLength={6} onComplete={submit}>
 *   <InputOTPGroup>
 *     <InputOTPSlot index={0} />
 *     <InputOTPSlot index={1} />
 *     <InputOTPSlot index={2} />
 *   </InputOTPGroup>
 *   <InputOTPSeparator />
 *   <InputOTPGroup>
 *     <InputOTPSlot index={3} />
 *     <InputOTPSlot index={4} />
 *     <InputOTPSlot index={5} />
 *   </InputOTPGroup>
 * </InputOTP>
 * ```
 *
 * ONE input, invisible, over the whole row, with the slots drawn beneath it.
 * shadcn's is the `input-otp` package doing exactly that, and the arrangement is
 * not decoration: an input per character breaks paste (each takes one
 * character), breaks `autocomplete="one-time-code"` (the platform fills one
 * field), and gives a screen reader six unlabelled boxes instead of one field.
 * The engine is written here rather than taken, because `input-otp` is React:
 * hooks and a context, with no part that survives leaving it.
 */
export function InputOTP(props: Incoming<InputOTPProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const inner = signal("");
  const focused = signal(false);
  // The caret, tracked as a range so a selection lights every slot it covers.
  const range = signal<readonly [number, number]>([0, 0]);

  const length = (): number => props.maxLength?.() ?? 6;
  const value = (): string => props.value?.() ?? inner();

  const clean = (raw: string): string => {
    const pattern = props.pattern?.() ?? /[^0-9]/g;
    // `lastIndex` is state on a global regex, so a fresh one per call: reusing
    // the caller's would skip characters on every other keystroke.
    return raw.replace(new RegExp(pattern.source, pattern.flags), "").slice(0, length());
  };

  const track = (element: HTMLInputElement): void => {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    range.set([start, end]);
  };

  const write = (raw: string, element: HTMLInputElement): void => {
    const next = clean(raw);
    if (next !== element.value) element.value = next;
    if (props.value?.() === undefined) inner.set(next);
    props.onChange?.()?.(next);
    if (next.length === length()) props.onComplete?.()?.(next);
    track(element);
  };

  const shared: OtpValue = {
    value,
    length,
    isDisabled: () => props.isDisabled?.() === true,
    isInvalid: () => props.isInvalid?.() === true,
    activeRange: range,
    focused,
  };

  return (
    <div {...uiProps("input-otp-container", container, props)}>
      <div class={root}>
        <input
          {...controlProps("input-otp", control, props)}
          ref={inputRef.set}
          type="text"
          inputMode="numeric"
          autocomplete="one-time-code"
          maxLength={length()}
          value={value()}
          disabled={props.isDisabled?.()}
          name={props.name?.()}
          autoFocus={props.autoFocus?.()}
          aria-invalid={props.isInvalid?.() === true ? "true" : undefined}
          onInput={(event: Event) =>
            write((event.target as HTMLInputElement).value, event.target as HTMLInputElement)
          }
          onFocus={(event: FocusEvent) => {
            focused.set(true);
            const element = event.target as HTMLInputElement;
            // The caret goes to the END on focus, which is where the next
            // character lands. Without this a click on the third slot of an
            // empty field would type there and leave two holes behind it.
            const at = element.value.length;
            element.setSelectionRange(at, at);
            track(element);
          }}
          onBlur={() => focused.set(false)}
          onKeyUp={(event: KeyboardEvent) => track(event.target as HTMLInputElement)}
          onClick={(event: MouseEvent) => {
            const element = event.target as HTMLInputElement;
            const at = element.value.length;
            element.setSelectionRange(at, at);
            track(element);
          }}
          onSelect={(event: Event) => track(event.target as HTMLInputElement)}
        />
        <div class={ui(group, drawn)} aria-hidden="true">
          <Provider value={shared}>{props.children}</Provider>
        </div>
      </div>
    </div>
  );
}

/**
 * The context, and nothing else.
 *
 * `provide`'s callback builds no JSX of its own, which is the whole reason this
 * is a component: a callback that builds closes over the scope at the CALL site
 * rather than the one `provide` created, so the children go up beside the
 * context instead of under it and every slot fails to find it.
 */
function Provider(props: Incoming<{ value: OtpValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    OtpContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

export function InputOTPGroup(props: Incoming<UiProps>) {
  return <div {...uiProps("input-otp-group", group, props)}>{props.children}</div>;
}

export interface InputOTPSlotProps extends UiProps {
  index: number;
}

/**
 * One character's box.
 *
 * It draws rather than accepts: the character comes off the shared value and
 * the whole row is `aria-hidden`, because the field a screen reader should meet
 * is the one real input behind it.
 */
export function InputOTPSlot(props: Incoming<InputOTPSlotProps>) {
  const otp = useOtp();

  const at = (): number => props.index();
  const char = (): string => otp.value().charAt(at());

  const isActive = (): boolean => {
    if (!otp.focused()) return false;
    const [start, end] = otp.activeRange();
    // A caret rather than a selection: the slot it sits before is the active
    // one, and at the very end it is the last slot rather than one past it.
    if (start === end) return at() === Math.min(start, otp.length() - 1);
    return at() >= start && at() < end;
  };

  const hasCaret = (): boolean => isActive() && char() === "";

  return (
    <div
      {...uiProps("input-otp-slot", slot, props)}
      data-active={() => (isActive() ? "true" : "false")}
      aria-invalid={() => (otp.isInvalid() ? "true" : undefined)}
    >
      {char()}
      {hasCaret() ? (
        <div class={caretWrapper}>
          <div class={caret} />
        </div>
      ) : null}
    </div>
  );
}

export function InputOTPSeparator(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("input-otp-separator", "", props)} role="separator">
      <Minus />
    </div>
  );
}
