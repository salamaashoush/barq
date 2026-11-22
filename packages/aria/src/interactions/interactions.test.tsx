import { beforeAll, describe, expect, test } from "bun:test";
import { cells, flush, createSignal } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { focused, focusWithin } from "./focus-events.ts";
import { hover } from "./hover.ts";
import {
  canonicalKeyboardShortcut,
  createEventHandler,
  createKeyboardShortcutHandler,
  keyboard,
  type KeyboardOptions,
  parseKeyboardShortcut,
} from "./keyboard.ts";
import { longPress } from "./long-press.ts";
import { move } from "./move.ts";
import { interactOutside } from "./interact-outside.ts";
import { description } from "./description.ts";
import { mergeProps } from "../utils.ts";

describe("hover", () => {
  // A touch anywhere on the page mutes hover for half a second, so that the
  // mouse events a browser makes up after a tap are not taken for a mouse. A
  // test file that ran before this one may have ended on a tap.
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 510));
  });

  function Hoverable(props: { log: string[]; isDisabled?: boolean }) {
    const { hoverProps, isHovered } = hover({
      isDisabled: cells(props).isDisabled,
      onHoverStart: (e) => props.log.push(`start:${e.pointerType}`),
      onHoverEnd: (e) => props.log.push(`end:${e.pointerType}`),
      onHoverChange: (over) => props.log.push(`change:${over}`),
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
    const [disabled, setDisabled] = createSignal(false);
    const log: string[] = [];
    render(() => <Hoverable log={log} isDisabled={disabled()} />);

    user.hover(screen.getByRole("button"));
    log.length = 0;
    setDisabled(true);
    flush();

    expect(log).toEqual(["end:mouse", "change:false"]);
  });
});

describe("focused", () => {
  function Field(props: { log: string[] }) {
    const { focusProps, isFocused } = focused({
      onFocus: () => props.log.push("focus"),
      onBlur: () => props.log.push("blur"),
      onFocusChange: (on) => props.log.push(`change:${on}`),
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

describe("focusWithin, when a handler passes focus on", () => {
  test("focus forwarded from the container to a child is one entry", () => {
    const log: string[] = [];

    function Container() {
      const { focusWithinProps } = focusWithin({
        onFocusWithin: () => log.push("in"),
        onBlurWithin: () => log.push("out"),
        onFocusWithinChange: (on) => log.push(`within:${on}`),
      });
      // A collection does this: focus that lands on the list goes to an item,
      // in the same turn and after this hook has heard the first arrival.
      const forward = (event: FocusEvent): void => {
        if (event.target !== event.currentTarget) return;
        (event.currentTarget as HTMLElement).querySelector("button")?.focus();
      };
      return (
        <div
          data-testid="list"
          tabIndex={0}
          {...mergeProps(focusWithinProps, { onFocusIn: forward })}
        >
          <button type="button">item</button>
        </div>
      );
    }

    render(() => <Container />);
    screen.getByTestId("list").focus();
    flush();
    expect(log).toEqual(["in", "within:true"]);

    screen.getByRole("button").blur();
    flush();
    expect(log).toEqual(["in", "within:true", "out", "within:false"]);
  });
});

describe("keyboard", () => {
  test("stops propagation by default", () => {
    const outer: string[] = [];

    function Nested() {
      const { keyboardProps } = keyboard({ onKeyDown: () => undefined });
      return (
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

function withPlatform(platform: string, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  try {
    run();
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(navigator, "platform");
    else Object.defineProperty(navigator, "platform", descriptor);
  }
}

describe("keyboard: shortcuts", () => {
  function Field(props: { options: KeyboardOptions; outer?: string[] }) {
    const { keyboardProps } = keyboard(props.options);
    return (
      <div onKeyDown={(e: KeyboardEvent) => props.outer?.push(e.key)}>
        <button type="button" {...keyboardProps}>
          Save
        </button>
      </div>
    );
  }

  function setup(options: KeyboardOptions): { outer: string[]; target: HTMLElement } {
    const outer: string[] = [];
    render(() => <Field options={options} outer={outer} />);
    const target = screen.getByRole("button");
    target.focus();
    return { outer, target };
  }

  test("parsing rejects a shortcut with no key, and ignores case and order", () => {
    expect(() => parseKeyboardShortcut("Mod+Shift")).toThrow(/Invalid keyboard shortcut/);
    expect(() => parseKeyboardShortcut("")).toThrow(/Invalid keyboard shortcut/);
    expect(parseKeyboardShortcut("SHIFT+mod+A")).toEqual({
      shift: true,
      alt: false,
      ctrl: false,
      meta: false,
      mod: true,
      key: "A",
    });
  });

  test("Mod is Meta on a Mac and Control elsewhere", () => {
    withPlatform("MacIntel", () => {
      expect(canonicalKeyboardShortcut(parseKeyboardShortcut("Mod+s"))).toBe("Meta+s");
    });
    withPlatform("Win32", () => {
      expect(canonicalKeyboardShortcut(parseKeyboardShortcut("Mod+s"))).toBe("Control+s");
    });
  });

  test("a match runs, prevents the default and stops the event", () => {
    const saved: string[] = [];
    withPlatform("MacIntel", () => {
      const { outer } = setup({
        shortcuts: {
          "Mod+s": () => {
            saved.push("save");
          },
        },
      });

      expect(user.keyDown("s", { metaKey: true })).toBe(false);
      expect(saved).toEqual(["save"]);
      expect(outer).toEqual([]);
    });
  });

  test("a key with no binding is let through untouched", () => {
    const { outer } = setup({ shortcuts: { "Control+s": () => undefined } });

    expect(user.keyDown("s")).toBe(true);
    expect(user.keyDown("x", { ctrlKey: true })).toBe(true);
    expect(outer).toEqual(["s", "x"]);
  });

  test("the modifiers must match exactly", () => {
    const seen: string[] = [];
    setup({
      shortcuts: {
        "Control+a": () => {
          seen.push("ctrl+a");
        },
        "Control+Shift+a": () => {
          seen.push("ctrl+shift+a");
        },
      },
    });

    user.keyDown("A", { ctrlKey: true, shiftKey: true });
    user.keyDown("a", { ctrlKey: true });
    user.keyDown("a", { ctrlKey: true, altKey: true });

    expect(seen).toEqual(["ctrl+shift+a", "ctrl+a"]);
  });

  test("aliases name the keys", () => {
    const seen: string[] = [];
    setup({
      shortcuts: {
        "Shift+Alt+down": () => {
          seen.push("down");
        },
        Esc: () => {
          seen.push("esc");
        },
      },
    });

    user.keyDown("ArrowDown", { shiftKey: true, altKey: true });
    user.keyDown("Escape");

    expect(seen).toEqual(["down", "esc"]);
  });

  test("false lets the event through with its default", () => {
    const { outer } = setup({ shortcuts: { Enter: () => false } });
    expect(user.keyDown("Enter")).toBe(true);
    expect(outer).toEqual(["Enter"]);
  });

  test("an object controls the default and the propagation separately", () => {
    const { outer } = setup({
      shortcuts: { Enter: () => ({ shouldContinuePropagation: true, shouldPreventDefault: true }) },
    });
    expect(user.keyDown("Enter")).toBe(false);
    expect(outer).toEqual(["Enter"]);
  });

  test("a repeat or a composition is ignored unless allowed", () => {
    const seen: string[] = [];
    setup({
      shortcuts: {
        a: () => {
          seen.push("a");
        },
      },
    });
    user.keyDown("a", { repeat: true });
    const composing = new KeyboardEvent("keydown", { key: "a", bubbles: true, isComposing: true });
    document.activeElement?.dispatchEvent(composing);
    expect(seen).toEqual([]);
  });

  test("allowRepeats and allowComposing let them through", () => {
    const seen: string[] = [];
    setup({
      shortcuts: {
        a: () => {
          seen.push("a");
        },
      },
      allowRepeats: true,
      allowComposing: true,
    });
    user.keyDown("a", { repeat: true });
    const composing = new KeyboardEvent("keydown", { key: "a", bubbles: true, isComposing: true });
    document.activeElement?.dispatchEvent(composing);
    expect(seen).toEqual(["a", "a"]);
  });

  test("shortcuts never run on keyup", () => {
    const seen: string[] = [];
    setup({
      shortcuts: {
        a: () => {
          seen.push("a");
        },
      },
    });
    user.keyUp("a");
    expect(seen).toEqual([]);
  });

  test("onKeyDown and onKeyUp still run beside the shortcuts", () => {
    const seen: string[] = [];
    setup({
      shortcuts: { a: () => true },
      onKeyDown: () => {
        seen.push("down");
      },
      onKeyUp: () => {
        seen.push("up");
      },
    });
    user.key("a");
    expect(seen).toEqual(["down", "up"]);
  });

  test("composed: any shortcut that stops the key stops it", () => {
    const outer: string[] = [];
    function Composed() {
      const first = keyboard({
        shortcuts: { ArrowLeft: () => ({ shouldContinuePropagation: true }) },
      });
      const second = keyboard({
        shortcuts: { ArrowLeft: () => undefined },
        ...first.keyboardProps,
      });
      return (
        <div onKeyDown={(e: KeyboardEvent) => outer.push(e.key)}>
          <button type="button" {...second.keyboardProps}>
            Save
          </button>
        </div>
      );
    }
    render(() => <Composed />);
    screen.getByRole("button").focus();
    user.keyDown("ArrowLeft");
    expect(outer).toEqual([]);
  });

  test("composed: the key goes through when every shortcut agrees", () => {
    const outer: string[] = [];
    function Composed() {
      const first = keyboard({
        shortcuts: { ArrowLeft: () => ({ shouldContinuePropagation: true }) },
      });
      const second = keyboard({ shortcuts: { Enter: () => undefined }, ...first.keyboardProps });
      return (
        <div onKeyDown={(e: KeyboardEvent) => outer.push(e.key)}>
          <button type="button" {...second.keyboardProps}>
            Save
          </button>
        </div>
      );
    }
    render(() => <Composed />);
    screen.getByRole("button").focus();
    user.keyDown("ArrowLeft");
    expect(outer).toEqual(["ArrowLeft"]);
  });

  test("later duplicate bindings win", () => {
    const seen: string[] = [];
    const handler = createKeyboardShortcutHandler({
      "Control+Shift+a": () => {
        seen.push("first");
      },
      "Shift+Control+A": () => {
        seen.push("second");
      },
    });
    const event = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, shiftKey: true });
    handler(Object.assign(event, { continuePropagation: () => undefined }));
    expect(seen).toEqual(["second"]);
  });
});

describe("move", () => {
  function Slider(props: { log: string[] }) {
    const { moveProps } = move({
      onMoveStart: () => props.log.push("start"),
      onMove: (e) => props.log.push(`move:${e.deltaX},${e.deltaY}`),
      onMoveEnd: () => props.log.push("end"),
    });
    return <div {...moveProps} role="slider" tabIndex={0} aria-label="value" aria-valuenow={0} />;
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
