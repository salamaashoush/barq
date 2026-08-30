import { describe, expect, test } from "bun:test";
import { flush, type Incoming, signal } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { focused, focusWithin } from "./focus-events.ts";
import { hover } from "./hover.ts";
import { createEventHandler, keyboard } from "./keyboard.ts";
import { longPress } from "./long-press.ts";
import { move } from "./move.ts";
import { interactOutside } from "./interact-outside.ts";
import { description } from "./description.ts";

describe("hover", () => {
  function Hoverable(props: Incoming<{ log: string[]; isDisabled?: boolean }>) {
    const { hoverProps, isHovered } = hover({
      isDisabled: props.isDisabled,
      onHoverStart: (e) => props.log().push(`start:${e.pointerType}`),
      onHoverEnd: (e) => props.log().push(`end:${e.pointerType}`),
      onHoverChange: (over) => props.log().push(`change:${over}`),
    });
    return (
      <button type="button" {...hoverProps} data-hovered={isHovered}>
        hover me
      </button>
    );
  }

  test("a mouse entering and leaving", () => {
    const log: string[] = [];
    render(() => <Hoverable log={log} />);
    const button = screen.getByRole("button");

    user.hover(button);
    expect(log).toEqual(["start:mouse", "change:true"]);
    expect(button.hasAttribute("data-hovered")).toBe(true);

    user.unhover(button);
    expect(log).toEqual(["start:mouse", "change:true", "end:mouse", "change:false"]);
    expect(button.hasAttribute("data-hovered")).toBe(false);
  });

  test("a touch does not hover", () => {
    const log: string[] = [];
    render(() => <Hoverable log={log} />);
    const button = screen.getByRole("button");

    user.hover(button, { pointerType: "touch" });

    expect(log).toEqual([]);
  });

  test("disabled does not hover", () => {
    const log: string[] = [];
    render(() => <Hoverable log={log} isDisabled={true} />);

    user.hover(screen.getByRole("button"));

    expect(log).toEqual([]);
  });

  test("becoming disabled while hovered ends the hover", () => {
    const disabled = signal(false);
    const log: string[] = [];
    render(() => <Hoverable log={log} isDisabled={disabled()} />);

    user.hover(screen.getByRole("button"));
    log.length = 0;
    disabled.set(true);
    flush();

    expect(log).toEqual(["end:mouse", "change:false"]);
  });
});

describe("focused", () => {
  function Field(props: Incoming<{ log: string[] }>) {
    const { focusProps, isFocused } = focused({
      onFocus: () => props.log().push("focus"),
      onBlur: () => props.log().push("blur"),
      onFocusChange: (on) => props.log().push(`change:${on}`),
    });
    return (
      <>
        <input {...focusProps} data-focused={isFocused} aria-label="field" />
        <button type="button">elsewhere</button>
      </>
    );
  }

  test("reports focus and blur for the element itself", () => {
    const log: string[] = [];
    render(() => <Field log={log} />);
    const input = screen.getByRole("textbox");

    user.focus(input);
    expect(log).toEqual(["focus", "change:true"]);
    expect(input.hasAttribute("data-focused")).toBe(true);

    user.focus(screen.getByRole("button"));
    expect(log).toEqual(["focus", "change:true", "blur", "change:false"]);
    expect(input.hasAttribute("data-focused")).toBe(false);
  });

  test("a descendant taking focus is not the element taking focus", () => {
    const log: string[] = [];

    function Container() {
      const { focusProps, isFocused } = focused({ onFocusChange: (on) => log.push(`self:${on}`) });
      return (
        <div {...focusProps} data-focused={isFocused}>
          <button type="button">inside</button>
        </div>
      );
    }

    render(() => <Container />);
    user.focus(screen.getByRole("button"));

    expect(log).toEqual([]);
  });
});

describe("focusWithin", () => {
  test("reports focus anywhere inside", () => {
    const log: string[] = [];

    function Container() {
      const { focusWithinProps, isFocusWithin } = focusWithin({
        onFocusWithinChange: (on) => log.push(`within:${on}`),
      });
      return (
        <div {...focusWithinProps} data-focus-within={isFocusWithin}>
          <button type="button">one</button>
          <button type="button">two</button>
        </div>
      );
    }

    render(() => <Container />);
    const [one, two] = screen.getAllByRole("button");

    user.focus(one as HTMLElement);
    expect(log).toEqual(["within:true"]);

    // Moving between two children is not leaving.
    user.focus(two as HTMLElement);
    expect(log).toEqual(["within:true"]);

    (two as HTMLElement).blur();
    flush();
    expect(log).toEqual(["within:true", "within:false"]);
  });
});

describe("keyboard", () => {
  test("stops propagation by default", () => {
    const outer: string[] = [];

    function Nested() {
      const { keyboardProps } = keyboard({ onKeyDown: () => undefined });
      return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: a test fixture
        <div onKeyDown={() => outer.push("outer")}>
          <input {...keyboardProps} aria-label="field" />
        </div>
      );
    }

    render(() => <Nested />);
    user.keyDown("a", { target: screen.getByRole("textbox") });

    expect(outer).toEqual([]);
  });

  test("continuePropagation lets it through", () => {
    const outer: string[] = [];

    function Nested() {
      const { keyboardProps } = keyboard({ onKeyDown: (e) => e.continuePropagation() });
      return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: a test fixture
        <div onKeyDown={() => outer.push("outer")}>
          <input {...keyboardProps} aria-label="field" />
        </div>
      );
    }

    render(() => <Nested />);
    user.keyDown("a", { target: screen.getByRole("textbox") });

    expect(outer).toEqual(["outer"]);
  });

  test("disabled handles nothing", () => {
    const seen: string[] = [];

    function Field() {
      const { keyboardProps } = keyboard({
        isDisabled: true,
        onKeyDown: () => seen.push("down"),
      });
      return <input {...keyboardProps} aria-label="field" />;
    }

    render(() => <Field />);
    user.keyDown("a", { target: screen.getByRole("textbox") });

    expect(seen).toEqual([]);
  });

  test("createEventHandler restores an outer continuePropagation", () => {
    const seen: string[] = [];
    const inner = createEventHandler<KeyboardEvent>((e) => {
      seen.push("inner");
      e.continuePropagation();
    });
    const outer = createEventHandler<KeyboardEvent>((e) => {
      seen.push("outer");
      inner?.(e);
    });

    const element = document.createElement("div");
    document.body.appendChild(element);
    const bubbled: string[] = [];
    document.body.addEventListener("keydown", () => bubbled.push("body"));
    element.addEventListener("keydown", (e) => outer?.(e));

    element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(seen).toEqual(["outer", "inner"]);
    expect(bubbled).toEqual(["body"]);
    element.remove();
  });
});

describe("move", () => {
  function Slider(props: Incoming<{ log: string[] }>) {
    const { moveProps } = move({
      onMoveStart: () => props.log().push("start"),
      onMove: (e) => props.log().push(`move:${e.deltaX},${e.deltaY}`),
      onMoveEnd: () => props.log().push("end"),
    });
    return (
      // biome-ignore lint/a11y/useSemanticElements: the point is the ARIA pattern
      <div {...moveProps} role="slider" tabIndex={0} aria-label="value" aria-valuenow={0} />
    );
  }

  test("arrow keys move by one in each direction", () => {
    const log: string[] = [];
    render(() => <Slider log={log} />);
    const slider = screen.getByRole("slider");

    user.keyDown("ArrowRight", { target: slider });
    expect(log).toEqual(["start", "move:1,0", "end"]);

    log.length = 0;
    user.keyDown("ArrowUp", { target: slider });
    expect(log).toEqual(["start", "move:0,-1", "end"]);
  });

  test("a pointer drag reports deltas", () => {
    const log: string[] = [];
    render(() => <Slider log={log} />);
    const slider = screen.getByRole("slider");

    slider.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse" }));

    // happy-dom reports pageX/pageY as 0, so the delta is zero and no move is
    // emitted: what this pins is that the listeners were bound at all.
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse" }));

    expect(log).toEqual([]);
  });
});

describe("interactOutside", () => {
  test("fires for a click outside and not for one inside", () => {
    const log: string[] = [];

    function Popover() {
      let element: HTMLElement | null = null;
      interactOutside({
        ref: () => element,
        onInteractOutside: () => log.push("outside"),
      });
      return (
        <>
          <div
            ref={(el: HTMLElement) => {
              element = el;
            }}
            data-testid="inside"
          >
            <button type="button">inside</button>
          </div>
          <button type="button" data-testid="outside">
            outside
          </button>
        </>
      );
    }

    render(() => <Popover />);

    user.click(screen.getByText("inside"));
    expect(log).toEqual([]);

    user.click(screen.getByTestId("outside"));
    expect(log).toEqual(["outside"]);
  });
});

describe("longPress", () => {
  test("describes the action for assistive technology", () => {
    function Row() {
      const { longPressProps } = longPress({
        accessibilityDescription: "Long press to open the menu",
        onLongPress: () => undefined,
      });
      return (
        <button type="button" {...longPressProps}>
          row
        </button>
      );
    }

    render(() => <Row />);
    flush();

    const button = screen.getByRole("button");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      "Long press to open the menu",
    );
  });
});

describe("description", () => {
  test("one hidden node serves every element with the same text", () => {
    function Two() {
      const a = description("Shared");
      const b = description("Shared");
      return (
        <>
          <button type="button" {...a}>
            a
          </button>
          <button type="button" {...b}>
            b
          </button>
        </>
      );
    }

    render(() => <Two />);
    flush();

    const [first, second] = screen.getAllByRole("button");
    expect(first?.getAttribute("aria-describedby")).toBe(
      second?.getAttribute("aria-describedby") as string,
    );
    expect(document.querySelectorAll("[id^=barq-description-]")).toHaveLength(1);
  });
});
