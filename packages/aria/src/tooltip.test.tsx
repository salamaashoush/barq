import { beforeEach, describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import {
  accessibleDescription,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import { Button } from "./button.tsx";
import { Tooltip, TooltipTrigger, resetTooltipWarmup } from "./tooltip.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 15));
}

function Saver(
  props: Incoming<{
    delay?: number;
    closeDelay?: number;
    trigger?: "hover" | "focus";
    isDisabled?: boolean;
    shouldCloseOnPress?: boolean;
  }>,
) {
  return (
    <TooltipTrigger
      delay={props.delay?.() ?? 20}
      closeDelay={props.closeDelay?.() ?? 20}
      trigger={props.trigger?.()}
      isDisabled={props.isDisabled?.()}
      shouldCloseOnPress={props.shouldCloseOnPress?.()}
    >
      <Button>Save</Button>
      <Tooltip>Saves without closing</Tooltip>
    </TooltipTrigger>
  );
}

function target(): HTMLElement {
  return screen.getByRole("button", { name: "Save" });
}

describe("TooltipTrigger", () => {
  beforeEach(() => {
    resetTooltipWarmup();
  });

  test("shows nothing until something asks for it", () => {
    render(() => <Saver />);

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(target().hasAttribute("aria-describedby")).toBe(false);
  });

  test("hovering opens it, but only after the delay", async () => {
    render(() => <Saver delay={40} />);

    user.hover(target());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();

    await after(40);
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves without closing");
  });

  test("it describes the trigger rather than naming it", async () => {
    render(() => <Saver />);

    user.hover(target());
    await after(20);
    flush();

    expect(target().getAttribute("aria-label")).toBeNull();
    expect(accessibleDescription(target())).toBe("Saves without closing");
  });

  test("leaving closes it after the close delay", async () => {
    render(() => <Saver />);

    user.hover(target());
    await after(20);
    flush();
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    user.unhover(target());
    flush();
    // Still there: a pointer that left by mistake gets a moment to come back.
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    await after(20);
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("a second tooltip appears at once while the group is warm", async () => {
    render(() => (
      <>
        <TooltipTrigger delay={40} closeDelay={0}>
          <Button>Save</Button>
          <Tooltip>Saves</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger delay={40} closeDelay={0}>
          <Button>Undo</Button>
          <Tooltip>Undoes</Tooltip>
        </TooltipTrigger>
      </>
    ));

    user.hover(screen.getByRole("button", { name: "Save" }));
    await after(40);
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves");

    user.unhover(screen.getByRole("button", { name: "Save" }));
    user.hover(screen.getByRole("button", { name: "Undo" }));
    flush();

    // No wait: the group is warm, so the second one is the first one moving.
    const tooltips = screen.getAllByRole("tooltip");
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0]?.textContent).toBe("Undoes");
  });

  test("only one tooltip is ever on screen", async () => {
    render(() => (
      <>
        <TooltipTrigger delay={0} closeDelay={0}>
          <Button>Save</Button>
          <Tooltip>Saves</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger delay={0} closeDelay={0}>
          <Button>Undo</Button>
          <Tooltip>Undoes</Tooltip>
        </TooltipTrigger>
      </>
    ));

    user.hover(screen.getByRole("button", { name: "Save" }));
    flush();
    user.hover(screen.getByRole("button", { name: "Undo" }));
    flush();

    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  test("keyboard focus opens it without waiting", async () => {
    render(() => <Saver delay={5000} />);

    user.tab();
    await tick();
    flush();

    expect(screen.getByRole("tooltip").textContent).toBe("Saves without closing");
  });

  test("focus from a click does not open it", async () => {
    render(() => <Saver delay={5000} />);

    user.click(target());
    flush();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("blur closes it at once", async () => {
    render(() => <Saver delay={5000} closeDelay={5000} />);

    user.tab();
    await tick();
    flush();
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    user.blur(target());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Saver delay={5000} closeDelay={5000} />);

    user.tab();
    await tick();
    flush();
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    user.keyDown("Escape");
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("pressing the trigger closes it", async () => {
    render(() => <Saver delay={0} closeDelay={5000} />);

    user.hover(target());
    flush();
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    user.click(target());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("shouldCloseOnPress=false keeps it up", async () => {
    render(() => <Saver delay={0} closeDelay={5000} shouldCloseOnPress={false} />);

    user.hover(target());
    flush();
    user.click(target());
    flush();

    expect(screen.queryByRole("tooltip")).not.toBeNull();
  });

  test("trigger=focus ignores the pointer", async () => {
    render(() => <Saver delay={0} trigger="focus" />);

    user.hover(target());
    flush();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("a disabled trigger has no tooltip", async () => {
    render(() => <Saver delay={0} isDisabled />);

    user.hover(target());
    flush();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("the trigger keeps the tab order it already had", () => {
    render(() => <Saver />);
    expect(target().getAttribute("tabindex")).toBe("0");
  });

  test("has no ARIA violations while showing", async () => {
    const { container } = render(() => <Saver delay={0} />);

    user.hover(target());
    flush();

    expectNoAriaViolations(container);
  });
});
