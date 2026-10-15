import {
  OTP_BADGE_SPACE,
  otpField,
  type OtpPasswordManagerStrategy,
  type OtpSlot,
} from "@barqjs/aria/otp";
import { mergeProps, type DOMProps } from "@barqjs/aria/utils";
import {
  createContext,
  createMemo,
  getContext,
  onCleanup,
  onSettled,
  provide,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { Minus } from "@barqjs/lucide/icons/minus";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { controlProps, omit, uiProps } from "../lib/slot.ts";
import { text } from "../lib/shared-text.ts";

import type { UiProps } from "../lib/props.ts";

export {
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "@barqjs/aria/otp";

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
 * Invisible by COLOUR, with its text, caret, selection and autofill paint all
 * transparent, and not by `opacity: 0`, `visibility: hidden` or a 1px box
 * off-screen. It has to stay hittable, because a tap on a slot is a tap on
 * THIS; and it has to stay a field as far as a password manager and the
 * platform's own code autofill are concerned, both of which skip one they
 * judge hidden and judge that by its opacity.
 *
 * The font is as tall as the row (`--root-height` is measured), so the
 * platform's own caret handles and magnifier sit over the boxes, and so iOS
 * does not zoom the page on focus as it does for any field under 16px.
 */
const control = ui({
  position: "absolute",
  inset: "0px",
  width: "100%",
  height: "100%",
  cursor: "text",
  color: "transparent",
  caretColor: "transparent",
  backgroundColor: "transparent",
  borderWidth: "0px",
  outlineStyle: "none",
  boxShadow: "none",
  lineHeight: "1",
  letterSpacing: "-0.5em",
  fontSize: "var(--root-height, 2rem)",
  fontFamily: "monospace",
  fontVariantNumeric: "tabular-nums",
  "&:disabled": {
    cursor: "not-allowed",
  },
  "&::selection": {
    backgroundColor: "transparent",
    color: "transparent",
  },
  "&::placeholder": {
    color: "transparent",
  },
  "&:autofill": {
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    "-webkit-text-fill-color": "transparent",
  },
  "&:-webkit-autofill": {
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    "-webkit-text-fill-color": "transparent",
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

const slotBox = ui(text.sm, {
  position: "relative",
  display: "flex",
  height: "calc(var(--spacing) * 8)",
  width: "calc(var(--spacing) * 8)",
  alignItems: "center",
  justifyContent: "center",
  borderBlockStyle: "var(--ui-border-style)",
  borderBlockWidth: "1px",
  borderInlineEndStyle: "var(--ui-border-style)",
  borderInlineEndWidth: "1px",
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
    borderStartStartRadius: "var(--radius)",
    borderEndStartRadius: "var(--radius)",
    borderInlineStartStyle: "var(--ui-border-style)",
    borderInlineStartWidth: "1px",
  },
  "&:last-child": {
    borderStartEndRadius: "var(--radius)",
    borderEndEndRadius: "var(--radius)",
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

const separator = ui({
  display: "flex",
  alignItems: "center",
  "& svg:not([class*='size-'])": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
});

interface OtpValue {
  readonly slot: (index: number) => OtpSlot;
  readonly isInvalid: () => boolean;
}

const EMPTY: OtpSlot = { char: null, placeholderChar: null, isActive: false, hasFakeCaret: false };

const OtpContext = createContext<OtpValue | null>(null);

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
  /**
   * What the value may be, in one of two forms.
   *
   * A STRING is the `pattern` attribute, as shadcn's takes it: a test of the
   * whole value, and a change that fails it is refused. `REGEXP_ONLY_DIGITS`,
   * `REGEXP_ONLY_CHARS` and `REGEXP_ONLY_DIGITS_AND_CHARS` are these.
   *
   * A REGEXP is the characters to remove, so `/[^a-f0-9]/g` keeps hex digits
   * out of whatever was typed or pasted.
   *
   * Without one, a numeric keyboard keeps digits and any other keyboard keeps
   * everything.
   */
  pattern?: RegExp | string;
  /** Which keyboard a phone raises. @default "numeric" */
  inputMode?: "numeric" | "text" | "decimal" | "tel" | "search" | "email" | "url" | "none";
  /** Where the platform draws its own caret and selection handles. @default "left" */
  textAlign?: "left" | "center" | "right";
  /** For the row the boxes are in. `class` goes to that row and to the control. */
  containerClassName?: string;
  containerClass?: string;
  /** Applied to pasted text before it is judged, for a code copied as `12-34-56`. */
  pasteTransformer?: (pasted: string) => string;
  /**
   * Move a password manager's badge out beside the boxes by widening the
   * control under it. @default "increase-width"
   */
  pushPasswordManagerStrategy?: OtpPasswordManagerStrategy;
  placeholder?: string;
  isDisabled?: boolean;
  /** The same as `isDisabled`, under the attribute's name. */
  disabled?: boolean;
  isInvalid?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  name?: string;
  /** @default "one-time-code" */
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  form?: string;
  onChange?: (value: string) => void;
  /** Called when the last slot is filled. */
  onComplete?: (value: string) => void;
}

/** What `controlProps` must not turn into an attribute or a DOM listener. */
const OWN = ["value", "defaultValue", "pattern", "onChange", "style"] as const;

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
 * The engine is `otpField` in `@barqjs/aria` rather than that package, because
 * `input-otp` is React: hooks and a context, with no part that survives leaving
 * it.
 *
 * Name the field: `aria-label`, or a `<Label>` pointing at its `id`. Both reach
 * the real control, which is the only thing a screen reader meets.
 */
export function InputOTP(props: Incoming<InputOTPProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const rootRef = makeRef<HTMLDivElement>();

  const length = (): number => props.maxLength?.() ?? 6;
  const inputMode = (): NonNullable<InputOTPProps["inputMode"]> => props.inputMode?.() ?? "numeric";
  const isDisabled = (): boolean => props.isDisabled?.() === true || props.disabled?.() === true;
  const isInvalid = (): boolean => {
    const attribute = props["aria-invalid"]?.();
    return props.isInvalid?.() === true || attribute === true || attribute === "true";
  };

  const strip = (raw: string): string => {
    const pattern = props.pattern?.();
    // `lastIndex` is state on a global regex, so a fresh one per call: reusing
    // the caller's would skip characters on every other keystroke.
    if (pattern instanceof RegExp)
      return raw.replace(new RegExp(pattern.source, pattern.flags), "");
    if (pattern === undefined && inputMode() === "numeric") return raw.replace(/[^0-9]/g, "");
    return raw;
  };

  const test = (): string | undefined => {
    const pattern = props.pattern?.();
    return typeof pattern === "string" ? pattern : undefined;
  };

  const otp = otpField(
    {
      maxLength: length,
      value: () => props.value?.(),
      defaultValue: () => props.defaultValue?.(),
      onChange: (next) => props.onChange?.()?.(next),
      onComplete: (next) => props.onComplete?.()?.(next),
      pattern: test,
      sanitize: strip,
      pasteTransformer: () => props.pasteTransformer?.(),
      placeholder: () => props.placeholder?.(),
      pushPasswordManagerStrategy: () => props.pushPasswordManagerStrategy?.(),
    },
    inputRef,
    rootRef,
  );

  const slots = createMemo(() => otp.slots());
  const shared: OtpValue = {
    slot: (index) => slots()[index] ?? EMPTY,
    isInvalid,
  };

  let observer: ResizeObserver | undefined;
  onSettled(() => {
    const element = rootRef();
    if (element === null || typeof ResizeObserver === "undefined") return;
    observer = new ResizeObserver(() => {
      element.style.setProperty("--root-height", `${String(element.clientHeight)}px`);
    });
    observer.observe(element);
  });
  onCleanup(() => observer?.disconnect());

  const controlStyle = (): Record<string, string> => {
    const style: Record<string, string> = { "text-align": props.textAlign?.() ?? "left" };
    if (otp.willPushPasswordManagerBadge()) {
      style.width = `calc(100% + ${OTP_BADGE_SPACE})`;
      style["clip-path"] = `inset(0 ${OTP_BADGE_SPACE} 0 0)`;
    }
    return style;
  };

  const containerProps: DOMProps = {
    class: () =>
      ui(
        container,
        props.class?.(),
        props.className?.(),
        props.containerClass?.(),
        props.containerClassName?.(),
      ),
    hidden: () => props.hidden?.(),
    "data-disabled": () => (isDisabled() ? "true" : undefined),
  };
  if (props.style !== undefined) containerProps.style = () => props.style?.();

  const controlAttributes = mergeProps(
    controlProps("input-otp", control, omit(props, OWN)),
    otp.inputProps,
    { style: controlStyle },
  );

  return (
    <div data-slot="input-otp-container" data-input-otp-container {...containerProps}>
      <div class={root} ref={rootRef.set}>
        <input
          {...controlAttributes}
          ref={inputRef.set}
          type="text"
          data-input-otp
          inputMode={inputMode()}
          pattern={test()}
          autocomplete={props.autoComplete?.() ?? "one-time-code"}
          spellcheck={false}
          maxLength={length()}
          value={otp.value()}
          disabled={isDisabled()}
          aria-invalid={isInvalid() ? "true" : undefined}
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
  return provide(
    OtpContext,
    () => props.value(),
    () => props.children,
  );
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
  const slot = (): OtpSlot => otp.slot(props.index());

  return (
    <div
      {...uiProps("input-otp-slot", slotBox, props)}
      data-active={() => (slot().isActive ? "true" : "false")}
      aria-invalid={() => (otp.isInvalid() ? "true" : undefined)}
    >
      {slot().char ?? ""}
      {slot().hasFakeCaret ? (
        <div data-slot="input-otp-caret" class={caretWrapper}>
          <div data-slot="input-otp-caret-line" class={caret} />
        </div>
      ) : null}
    </div>
  );
}

export function InputOTPSeparator(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("input-otp-separator", separator, props)} role="separator">
      <Minus />
    </div>
  );
}
