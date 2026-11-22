import { describe, expect, test } from "bun:test";
import { createContext, flush, provide, createSignal, type Child } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { button as buttonHook, Button, ToggleButton } from "./button.tsx";
import { ProgressBar } from "./link.tsx";
import { SelectionIndicator } from "./selection-indicator.tsx";
import { SharedElementTransition } from "./shared-element-transition.tsx";
import { clearAnnouncer } from "./live.ts";
import { clearTriggerSlot, provideTriggerSlot } from "./utils.ts";

/** Something for `provide` to carry; the slot is what the test is about. */
const probe = createContext<number>(0);

describe("Button", () => {
  test("is a button with an accessible name", () => {
    render(() => <Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  test("a click handler hears one click per click", async () => {
    let clicks = 0;
    render(() => <Button onClick={() => clicks++}>Save</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicks).toBe(1);
  });

  test("a toggle's click handler hears one click per click", async () => {
    let clicks = 0;
    render(() => <ToggleButton onClick={() => clicks++}>Bold</ToggleButton>);
    await user.click(screen.getByRole("button"));
    expect(clicks).toBe(1);
  });

  test("fires onPress for a click, a key and a screen reader", () => {
    const presses: string[] = [];
    render(() => <Button onPress={(e) => presses.push(e.pointerType)}>Save</Button>);
    const button = screen.getByRole("button");

    user.click(button);
    button.focus();
    user.key("Enter");
    user.key(" ");
    user.virtualClick(button);

    expect(presses).toEqual(["mouse", "keyboard", "keyboard", "virtual"]);
  });

  test("disabled is disabled to the platform and to assistive technology", () => {
    const presses: string[] = [];
    render(() => (
      <Button isDisabled onPress={() => presses.push("press")}>
        Save
      </Button>
    ));
    const button = screen.getByRole<HTMLButtonElement>("button");

    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("data-disabled")).toBe(true);

    user.click(button);
    expect(presses).toEqual([]);
  });

  test("reports its interaction states as data attributes", () => {
    render(() => <Button>Save</Button>);
    const button = screen.getByRole("button");

    user.hover(button);
    expect(button.hasAttribute("data-hovered")).toBe(true);

    user.pointerDown(button);
    expect(button.hasAttribute("data-pressed")).toBe(true);
    expect(button.hasAttribute("data-focused")).toBe(true);

    // The press ends at the CLICK, not at pointer up: the DOM may be mutated
    // between the two, and the platform fires the click last.
    user.pointerUp(button);
    expect(button.hasAttribute("data-pressed")).toBe(true);

    user.click(button);
    expect(button.hasAttribute("data-pressed")).toBe(false);
  });

  test("passes class, style and data attributes through", () => {
    render(() => (
      <Button class="primary" data-testid="save" style={{ color: "red" }}>
        Save
      </Button>
    ));
    const button = screen.getByTestId("save");

    expect(button.getAttribute("class")).toBe("primary");
    expect(button.style.color).toBe("red");
  });

  test("an icon-only button needs a label, and the check says so", () => {
    render(() => (
      <>
        <Button aria-label="Close">x</Button>
      </>
    ));
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    expectNoAriaViolations(screen.getByRole("button").parentElement as Element);
  });

  test("type submit reaches the form", () => {
    const submits: string[] = [];
    render(() => (
      <form
        onSubmit={(e: SubmitEvent) => {
          e.preventDefault();
          submits.push("submit");
        }}
      >
        <Button type="submit">Go</Button>
      </form>
    ));

    expect(screen.getByRole<HTMLButtonElement>("button").type).toBe("submit");
  });
});

describe("Button: form attributes", () => {
  test("the form overrides reach a native button", () => {
    render(() => (
      <form id="acme">
        <Button
          type="submit"
          form="acme"
          formAction="/save"
          formEncType="multipart/form-data"
          formMethod="post"
          formNoValidate
          formTarget="_blank"
          name="intent"
          value="save"
        >
          Save
        </Button>
      </form>
    ));
    const button = screen.getByRole<HTMLButtonElement>("button");

    expect(button.getAttribute("form")).toBe("acme");
    expect(button.getAttribute("formaction")).toBe("/save");
    expect(button.getAttribute("formenctype")).toBe("multipart/form-data");
    expect(button.getAttribute("formmethod")).toBe("post");
    expect(button.hasAttribute("formnovalidate")).toBe(true);
    expect(button.getAttribute("formtarget")).toBe("_blank");
    expect(button.getAttribute("name")).toBe("intent");
    expect(button.getAttribute("value")).toBe("save");
  });

  test("aria-disabled passes through", () => {
    render(() => <Button aria-disabled="true">Save</Button>);
    expect(screen.getByRole("button").getAttribute("aria-disabled")).toBe("true");
  });

  test("aria-disabled is absent by default", () => {
    render(() => <Button>Save</Button>);
    expect(screen.getByRole("button").hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("Button: hover callbacks", () => {
  test("onHoverStart, onHoverEnd and onHoverChange are called", () => {
    const log: string[] = [];
    render(() => (
      <Button
        onHoverStart={(e) => log.push(`start:${e.pointerType}`)}
        onHoverEnd={(e) => log.push(`end:${e.pointerType}`)}
        onHoverChange={(hovered) => log.push(`change:${hovered}`)}
      >
        Save
      </Button>
    ));
    const button = screen.getByRole("button");

    user.hover(button);
    user.unhover(button);

    expect(log).toEqual(["start:mouse", "change:true", "end:mouse", "change:false"]);
  });
});

describe("Button: allowFocusWhenDisabled", () => {
  test("a disabled button stays out of the Tab order but keeps a tabindex", () => {
    function Stepper() {
      const { buttonProps } = buttonHook({
        elementType: "div",
        isDisabled: true,
        allowFocusWhenDisabled: true,
      });
      return <div {...buttonProps}>+</div>;
    }
    render(() => <Stepper />);
    expect(screen.getByRole("button").getAttribute("tabindex")).toBe("-1");
  });

  test("without it a disabled button has no tabindex", () => {
    function Stepper() {
      const { buttonProps } = buttonHook({ elementType: "div", isDisabled: true });
      return <div {...buttonProps}>+</div>;
    }
    render(() => <Stepper />);
    expect(screen.getByRole("button").hasAttribute("tabindex")).toBe(false);
  });
});

describe("Button: isPending", () => {
  test("a press while pending does nothing, and the button stays focusable", () => {
    const presses: string[] = [];
    const [pending, setPending] = createSignal(false);
    render(() => (
      <Button
        isPending={pending()}
        onPress={() => {
          presses.push("press");
          setPending(true);
        }}
      >
        Save
      </Button>
    ));
    const button = screen.getByRole<HTMLButtonElement>("button");
    expect(button.hasAttribute("aria-disabled")).toBe(false);

    user.click(button);
    flush();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("data-pending")).toBe(true);
    expect(button.disabled).toBe(false);

    user.click(button);
    button.focus();
    user.key("Enter");
    user.virtualClick(button);
    flush();

    expect(presses).toEqual(["press"]);
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute("data-pressed")).toBe(false);
  });

  test("focus and blur handlers still run while pending", () => {
    const log: string[] = [];
    render(() => (
      <Button isPending onFocus={() => log.push("focus")} onBlur={() => log.push("blur")}>
        Save
      </Button>
    ));
    const button = screen.getByRole("button");

    user.click(button);
    button.blur();

    expect(log).toEqual(["focus", "blur"]);
  });

  test("a pending submit button is not a submit button", () => {
    const [pending, setPending] = createSignal(false);
    render(() => (
      <form>
        <Button type="submit" isPending={pending()}>
          Save
        </Button>
      </form>
    ));
    const button = screen.getByRole<HTMLButtonElement>("button");
    expect(button.type).toBe("submit");

    setPending(true);
    flush();
    expect(button.type).toBe("button");
  });

  test("a pending button is not hovered", () => {
    render(() => <Button isPending>Save</Button>);
    const button = screen.getByRole("button");
    user.hover(button);
    expect(button.hasAttribute("data-hovered")).toBe(false);
  });

  test("a pending button with aria-label is named by itself and its progress bar", () => {
    render(() => (
      <Button aria-label="Save" isPending>
        <ProgressBar aria-label="Saving" isIndeterminate />
      </Button>
    ));
    const button = screen.getByRole("button");
    const progress = screen.getByRole("progressbar");

    expect(button.id).not.toBe("");
    expect(progress.id).not.toBe("");
    expect(button.getAttribute("aria-labelledby")).toBe(`${button.id} ${progress.id}`);
  });

  test("a pending button with aria-labelledby adds its progress bar to it", () => {
    render(() => (
      <>
        <span id="salama-label">Save</span>
        <Button aria-labelledby="salama-label" isPending>
          <ProgressBar aria-label="Saving" isIndeterminate />
        </Button>
      </>
    ));
    const button = screen.getByRole("button");
    const progress = screen.getByRole("progressbar");

    expect(button.getAttribute("aria-labelledby")).toBe(`salama-label ${progress.id}`);
  });

  test("a focused button announces when it becomes pending and when it stops", () => {
    clearAnnouncer();
    const [pending, setPending] = createSignal(false);
    render(() => (
      <Button aria-label="Save" isPending={pending()}>
        <ProgressBar aria-label="Saving" isIndeterminate />
      </Button>
    ));
    const button = screen.getByRole("button");
    const progress = screen.getByRole("progressbar");
    const announced = (): string[] =>
      Array.from(document.querySelectorAll('[aria-live="assertive"] [aria-labelledby]')).map(
        (entry) => entry.getAttribute("aria-labelledby") ?? "",
      );

    button.focus();
    flush();
    expect(announced()).toEqual([]);

    setPending(true);
    flush();
    expect(announced()).toEqual([`${button.id} ${progress.id}`]);

    setPending(false);
    flush();
    expect(announced()).toEqual([`${button.id} ${progress.id}`, button.id]);
    clearAnnouncer();
  });

  test("an unfocused button announces nothing", () => {
    clearAnnouncer();
    const [pending, setPending] = createSignal(false);
    render(() => <Button isPending={pending()}>Save</Button>);

    setPending(true);
    flush();

    expect(document.querySelectorAll('[aria-live="assertive"] [aria-labelledby]').length).toBe(0);
  });
});

describe("ToggleButton", () => {
  test("announces its state with aria-pressed", () => {
    render(() => <ToggleButton>Bold</ToggleButton>);
    const button = screen.getByRole("button");

    expect(button.getAttribute("aria-pressed")).toBe("false");

    user.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.hasAttribute("data-selected")).toBe(true);

    user.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  test("controlled: the prop owns the state", () => {
    const [selected, setSelected] = createSignal(false);
    const changes: boolean[] = [];
    render(() => (
      <ToggleButton isSelected={selected()} onChange={(on) => changes.push(on)}>
        Bold
      </ToggleButton>
    ));
    const button = screen.getByRole("button");

    user.click(button);
    expect(changes).toEqual([true]);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    setSelected(true);
    flush();
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  test("defaultSelected starts on", () => {
    render(() => <ToggleButton defaultSelected>Bold</ToggleButton>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
});

/**
 * What a wrapper puts on the control it wraps.
 *
 * `provideTriggerSlot` is how `<TooltipTrigger>` and a dialog's trigger reach
 * the button without an element of their own. It used to reach only half way:
 * the props were merged onto the ELEMENT, where `onPress` is not a DOM event
 * and became `addEventListener("press")`, and where `aria-haspopup` lost to the
 * button's own accessor for that key — a function that yields `undefined` and
 * is still a value as far as `mergeProps` can tell.
 */
describe("the trigger slot", () => {
  function Wrap(props: { children?: Child; onPress?: () => void }) {
    return provide(
      probe,
      () => 1,
      () => {
        provideTriggerSlot({
          props: {
            "aria-haspopup": "menu",
            "aria-expanded": true,
            "data-from-slot": "yes",
            onPress: () => props.onPress?.(),
          },
        });
        return props.children;
      },
    ) as never;
  }

  test("it stops at what clears it, as an overlay's own content does", () => {
    function Content(props: { children?: Child }) {
      clearTriggerSlot();
      return <div>{props.children}</div>;
    }
    let pressed = 0;
    render(() => (
      <Wrap onPress={() => pressed++}>
        <Button>Open</Button>
        <Content>
          <Button>Close</Button>
        </Content>
        <Button>Also open</Button>
      </Wrap>
    ));
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.hasAttribute("aria-expanded")).toBe(false);
    expect(close.hasAttribute("data-from-slot")).toBe(false);
    user.click(close);
    expect(pressed).toBe(0);
    // A control written after the content still takes the slot.
    const later = screen.getByRole("button", { name: "Also open" });
    expect(later.getAttribute("data-from-slot")).toBe("yes");
    user.click(later);
    expect(pressed).toBe(1);
  });

  test("its aria attributes reach the button", () => {
    render(() => (
      <Wrap>
        <Button>Open</Button>
      </Wrap>
    ));
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("data-from-slot")).toBe("yes");
  });

  test("its onPress runs on a press", async () => {
    const presses: string[] = [];
    render(() => (
      <Wrap onPress={() => presses.push("slot")}>
        <Button>Open</Button>
      </Wrap>
    ));
    await user.click(screen.getByRole("button"));
    expect(presses).toEqual(["slot"]);
  });

  test("the button's own onPress runs as well, not instead", async () => {
    const presses: string[] = [];
    render(() => (
      <Wrap onPress={() => presses.push("slot")}>
        <Button onPress={() => presses.push("own")}>Open</Button>
      </Wrap>
    ));
    await user.click(screen.getByRole("button"));
    expect(presses.toSorted()).toEqual(["own", "slot"]);
  });

  test("the button's own aria-label is not overwritten by the slot", () => {
    render(() => (
      <Wrap>
        <Button aria-label="Actions">Open</Button>
      </Wrap>
    ));
    expect(screen.getByRole("button", { name: "Actions" })).toBeTruthy();
  });
});

describe("focus and blur handlers", () => {
  function SlotFocus(props: { log: string[]; children?: Child }) {
    return provide(
      createContext(0),
      () => 1,
      () => {
        provideTriggerSlot({
          props: {
            onFocus: () => props.log.push("slot focus"),
            onBlur: () => props.log.push("slot blur"),
          },
        });
        return props.children;
      },
    ) as never;
  }

  test("a Button's own run once each", () => {
    const log: string[] = [];
    render(() => (
      <Button onFocus={() => log.push("focus")} onBlur={() => log.push("blur")}>
        Save
      </Button>
    ));
    user.focus(screen.getByRole("button"));
    user.blur(screen.getByRole("button"));
    expect(log).toEqual(["focus", "blur"]);
  });

  test("a ToggleButton's own run once each", () => {
    const log: string[] = [];
    render(() => (
      <ToggleButton onFocus={() => log.push("focus")} onBlur={() => log.push("blur")}>
        Bold
      </ToggleButton>
    ));
    user.focus(screen.getByRole("button"));
    user.blur(screen.getByRole("button"));
    expect(log).toEqual(["focus", "blur"]);
  });

  test("a trigger slot's run once each, on a Button and on a ToggleButton", () => {
    const log: string[] = [];
    render(() => (
      <>
        <SlotFocus log={log}>
          <Button>Open</Button>
        </SlotFocus>
        <SlotFocus log={log}>
          <ToggleButton>Pin</ToggleButton>
        </SlotFocus>
      </>
    ));
    for (const name of ["Open", "Pin"]) {
      user.focus(screen.getByRole("button", { name }));
      user.blur(screen.getByRole("button", { name }));
    }
    expect(log).toEqual(["slot focus", "slot blur", "slot focus", "slot blur"]);
  });
});

describe("ToggleButton, with a selection indicator", () => {
  test("offers its pressed state to an indicator inside it", () => {
    render(() => (
      <SharedElementTransition>
        <ToggleButton>
          Bold
          <SelectionIndicator data-testid="indicator" />
        </ToggleButton>
      </SharedElementTransition>
    ));
    expect(screen.queryByTestId("indicator")).toBeNull();

    user.click(screen.getByRole("button"));
    flush();

    expect(screen.getByTestId("indicator")).not.toBeNull();
    expect(screen.getByRole("button").contains(screen.getByTestId("indicator"))).toBe(true);
  });
});

describe("a pending button's id", () => {
  test("an id prop that is undefined leaves the button its own, which names it", async () => {
    const given: string | undefined = undefined;
    render(() => (
      <Button id={given} aria-label="Save" isPending>
        <ProgressBar aria-label="Saving" isIndeterminate />
      </Button>
    ));
    flush();
    const element = screen.getByRole("button");
    const labelledBy = element.getAttribute("aria-labelledby") ?? "";
    expect(element.id).not.toBe("");
    expect(labelledBy.split(" ")[0]).toBe(element.id);
    expect(labelledBy).not.toContain("undefined");
  });
});
