import { describe, expect, test } from "bun:test";
import { flush, type Incoming, signal } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { press, type PressEvent } from "./press.ts";

interface PressableProps {
  log: string[];
  isDisabled?: boolean;
  onPress?: (event: PressEvent) => void;
  preventFocusOnPress?: boolean;
  shouldCancelOnPointerExit?: boolean;
}

// Inside a component every prop is a Cell (`Incoming`), so a value option is
// read with `props.x?.()` and forwarded as the Cell itself.
function Pressable(props: Incoming<PressableProps>) {
  const log = (entry: string): void => {
    props.log().push(entry);
  };

  const { pressProps, isPressed } = press({
    isDisabled: props.isDisabled,
    preventFocusOnPress: props.preventFocusOnPress,
    shouldCancelOnPointerExit: props.shouldCancelOnPointerExit,
    onPressStart: (e) => log(`start:${e.pointerType}`),
    onPressEnd: (e) => log(`end:${e.pointerType}`),
    onPressUp: (e) => log(`up:${e.pointerType}`),
    onPress: (e) => {
      log(`press:${e.pointerType}`);
      props.onPress?.()?.(e);
    },
    onPressChange: (pressed) => log(`change:${pressed}`),
  });

  return (
    <button type="button" {...pressProps} data-pressed={isPressed}>
      Press me
    </button>
  );
}

function setup(options: { shouldCancelOnPointerExit?: boolean; isDisabled?: boolean } = {}): {
  log: string[];
  button: HTMLElement;
} {
  const log: string[] = [];
  render(() => (
    <Pressable
      log={log}
      isDisabled={options.isDisabled}
      shouldCancelOnPointerExit={options.shouldCancelOnPointerExit}
    />
  ));
  return { log, button: screen.getByRole("button") };
}

describe("press: pointer", () => {
  test("a mouse click fires the whole sequence in order", () => {
    const { log, button } = setup();

    user.click(button);

    expect(log).toEqual([
      "start:mouse",
      "change:true",
      "up:mouse",
      "end:mouse",
      "change:false",
      "press:mouse",
    ]);
  });

  test("the pressed state is on between down and up", () => {
    const { button } = setup();

    user.pointerHold(button);
    // A boolean attribute is written as its presence, which is what a
    // `[data-pressed]` selector matches.
    expect(button.hasAttribute("data-pressed")).toBe(true);

    user.pointerUp(button);
    user.click(button);
    expect(button.hasAttribute("data-pressed")).toBe(false);
  });

  test("a right click does nothing", () => {
    const { log, button } = setup();
    user.rightClick(button);
    expect(log).toEqual([]);
  });

  test("a pointer that leaves ends the press but does not fire it", () => {
    const { log, button } = setup();

    user.pointerHold(button);
    log.length = 0;

    button.dispatchEvent(
      new PointerEvent("pointerleave", { bubbles: false, pointerId: 1, pointerType: "mouse" }),
    );

    expect(log).toEqual(["end:mouse", "change:false"]);
  });

  test("a pointer that returns starts the press again", () => {
    const { log, button } = setup();

    user.pointerHold(button);
    button.dispatchEvent(
      new PointerEvent("pointerleave", { bubbles: false, pointerId: 1, pointerType: "mouse" }),
    );
    log.length = 0;
    button.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: false, pointerId: 1, pointerType: "mouse" }),
    );

    expect(log).toEqual(["start:mouse", "change:true"]);
  });

  test("shouldCancelOnPointerExit stops the press coming back", () => {
    const { log, button } = setup({ shouldCancelOnPointerExit: true });

    user.pointerHold(button);
    button.dispatchEvent(
      new PointerEvent("pointerleave", { bubbles: false, pointerId: 1, pointerType: "mouse" }),
    );
    log.length = 0;
    button.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: false, pointerId: 1, pointerType: "mouse" }),
    );

    expect(log).toEqual([]);
  });

  test("a pointercancel abandons the press with no onPress", () => {
    const { log, button } = setup();

    user.pointerHold(button);
    log.length = 0;
    user.pointerCancel(button);

    expect(log).toEqual(["end:mouse", "change:false"]);
    expect(log).not.toContain("press:mouse");
  });

  test("a tap fires the sequence with pointerType touch", () => {
    const { log, button } = setup();

    user.tap(button);

    expect(log.filter((entry) => entry.startsWith("press:"))).toEqual(["press:touch"]);
  });
});

describe("press: keyboard", () => {
  test("Enter presses", () => {
    const { log, button } = setup();
    button.focus();

    user.key("Enter");

    expect(log).toEqual([
      "start:keyboard",
      "change:true",
      "up:keyboard",
      "end:keyboard",
      "change:false",
      "press:keyboard",
    ]);
  });

  test("Space presses", () => {
    const { log, button } = setup();
    button.focus();

    user.key(" ");

    expect(log.filter((entry) => entry.startsWith("press:"))).toEqual(["press:keyboard"]);
  });

  test("a key that is not Enter or Space does nothing", () => {
    const { log, button } = setup();
    button.focus();

    user.key("a");

    expect(log).toEqual([]);
  });

  test("a repeat does not start a second press", () => {
    const { log, button } = setup();
    button.focus();

    user.keyDown("Enter");
    user.keyDown("Enter", { repeat: true });

    expect(log.filter((entry) => entry === "start:keyboard")).toHaveLength(1);
  });
});

describe("press: virtual", () => {
  test("a screen reader click runs the whole sequence", () => {
    const { log, button } = setup();

    user.virtualClick(button);

    expect(log).toEqual([
      "start:virtual",
      "change:true",
      "up:virtual",
      "end:virtual",
      "change:false",
      "press:virtual",
    ]);
  });
});

describe("press: disabled", () => {
  test("no events fire", () => {
    const { log, button } = setup({ isDisabled: true });
    user.click(button);
    expect(log).toEqual([]);
  });

  test("becoming disabled mid-press ends it without firing", () => {
    const disabled = signal(false);
    const log: string[] = [];
    render(() => <Pressable log={log} isDisabled={disabled()} />);
    const button = screen.getByRole("button");

    user.pointerHold(button);
    expect(log).toContain("start:mouse");
    log.length = 0;

    disabled.set(true);
    flush();

    expect(log).toEqual(["end:mouse", "change:false"]);
    expect(log).not.toContain("press:mouse");
  });
});

describe("press: the event", () => {
  test("carries the modifier keys and the target", () => {
    let seen: PressEvent | undefined;
    const log: string[] = [];
    render(() => <Pressable log={log} onPress={(event) => (seen = event)} />);
    const button = screen.getByRole("button");

    user.click(button, { shiftKey: true, metaKey: true });

    expect(seen?.shiftKey).toBe(true);
    expect(seen?.metaKey).toBe(true);
    expect(seen?.ctrlKey).toBe(false);
    expect(seen?.target).toBe(button);
    expect(seen?.type).toBe("press");
  });
});

describe("press: propagation", () => {
  test("a press stops at the innermost pressable", () => {
    const outer: string[] = [];
    const inner: string[] = [];

    function Nested() {
      const outerPress = press({ onPress: () => outer.push("press") });
      const innerPress = press({ onPress: () => inner.push("press") });
      return (
        <div {...outerPress.pressProps} role="button" tabIndex={0} data-testid="outer">
          <button type="button" {...innerPress.pressProps}>
            inner
          </button>
        </div>
      );
    }

    render(() => <Nested />);
    user.click(screen.getByText("inner"));

    expect(inner).toEqual(["press"]);
    expect(outer).toEqual([]);
  });

  test("continuePropagation lets the outer one hear it too", () => {
    const outer: string[] = [];

    function Nested() {
      const outerPress = press({ onPress: () => outer.push("press") });
      const innerPress = press({
        onPressStart: (e) => e.continuePropagation(),
        onPressEnd: (e) => e.continuePropagation(),
        onPressUp: (e) => e.continuePropagation(),
        onPress: (e) => e.continuePropagation(),
      });
      return (
        <div {...outerPress.pressProps} role="button" tabIndex={0}>
          <button type="button" {...innerPress.pressProps}>
            inner
          </button>
        </div>
      );
    }

    render(() => <Nested />);
    user.click(screen.getByText("inner"));

    expect(outer).toEqual(["press"]);
  });
});
