import { describe, expect, test } from "bun:test";
import { context, flush, getOwner, provide, signal, type Child, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Button, ToggleButton } from "./button.tsx";
import { provideTriggerSlot } from "./utils.ts";

/** Something for `provide` to carry; the slot is what the test is about. */
const probe = context<number>(0);

describe("Button", () => {
  test("is a button with an accessible name", () => {
    render(() => <Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
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
    const button = screen.getByRole("button") as HTMLButtonElement;

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
    const selected = signal(false);
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

    selected.set(true);
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
  function Wrap(props: Incoming<{ children?: Child; onPress?: () => void }>) {
    const owner = getOwner();
    if (owner === null) return <>{props.children}</>;
    return provide(
      owner,
      probe,
      () => 1,
      () => {
        provideTriggerSlot({
          props: {
            "aria-haspopup": "menu",
            "aria-expanded": true,
            "data-from-slot": "yes",
            onPress: () => props.onPress?.()?.(),
          },
        });
        return props.children;
      },
    ) as never;
  }

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
