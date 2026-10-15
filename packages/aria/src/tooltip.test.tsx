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
import { Tooltip, TooltipProvider, TooltipTrigger, resetTooltipWarmup } from "./tooltip.tsx";

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
    await tick();
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves");

    user.unhover(screen.getByRole("button", { name: "Save" }));
    user.hover(screen.getByRole("button", { name: "Undo" }));
    await tick();
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
    await tick();
    flush();
    user.hover(screen.getByRole("button", { name: "Undo" }));
    await tick();
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
    await tick();
    flush();
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    user.click(target());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("shouldCloseOnPress=false keeps it up", async () => {
    render(() => <Saver delay={0} closeDelay={5000} shouldCloseOnPress={false} />);

    user.hover(target());
    await tick();
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
    render(() => <Saver delay={0} />);

    user.hover(target());
    await tick();
    flush();

    // `document.body` and not the render container: the tooltip is PORTALLED,
    // so the trigger and the tooltip it describes are in different subtrees and
    // only the document holds both. An `aria-describedby` pointing outside the
    // container is exactly the shape this has to be able to check.
    expectNoAriaViolations(document.body);
  });
});

describe("how a tooltip says it opened", () => {
  beforeEach(() => {
    resetTooltipWarmup();
  });

  test("closed until it shows, and delayed-open when the pointer waited for it", async () => {
    render(() => <Saver delay={20} />);
    expect(target().getAttribute("data-state")).toBe("closed");

    user.hover(target());
    await after(20);
    flush();

    expect(target().getAttribute("data-state")).toBe("delayed-open");
    expect(screen.getByRole("tooltip").getAttribute("data-state")).toBe("delayed-open");
  });

  test("a pointer that waited no time at all still asked by hovering", async () => {
    render(() => <Saver delay={0} />);

    user.hover(target());
    await tick();
    flush();

    expect(screen.getByRole("tooltip").getAttribute("data-state")).toBe("delayed-open");
  });

  test("instant-open from the keyboard, which never waits", async () => {
    render(() => <Saver delay={5000} />);

    user.tab();
    await tick();
    flush();

    expect(target().getAttribute("data-state")).toBe("instant-open");
    expect(screen.getByRole("tooltip").getAttribute("data-state")).toBe("instant-open");
  });

  test("the tooltip says which side it is on", async () => {
    render(() => <Saver delay={0} />);

    user.hover(target());
    await tick();
    flush();

    expect(screen.getByRole("tooltip").getAttribute("data-side")).toBe("top");
  });
});

describe("TooltipProvider", () => {
  beforeEach(() => {
    resetTooltipWarmup();
  });

  function Toolbar(
    props: Incoming<{
      delay?: number;
      skipDelay?: number;
      closeDelay?: number;
      isContentHoverable?: boolean;
    }>,
  ) {
    return (
      <TooltipProvider
        delay={props.delay?.()}
        skipDelay={props.skipDelay?.()}
        isContentHoverable={props.isContentHoverable?.()}
      >
        <TooltipTrigger closeDelay={props.closeDelay?.()}>
          <Button>Save</Button>
          <Tooltip>Saves</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger closeDelay={0}>
          <Button>Undo</Button>
          <Tooltip>Undoes</Tooltip>
        </TooltipTrigger>
      </TooltipProvider>
    );
  }

  const save = (): HTMLElement => screen.getByRole("button", { name: "Save" });
  const undo = (): HTMLElement => screen.getByRole("button", { name: "Undo" });

  test("every tooltip inside waits as long as the provider says", async () => {
    render(() => <Toolbar delay={40} closeDelay={0} />);

    user.hover(save());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();

    await after(40);
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves");
  });

  test("a tooltip's own delay wins over the provider's", async () => {
    render(() => (
      <TooltipProvider delay={5000}>
        <TooltipTrigger delay={20} closeDelay={0}>
          <Button>Save</Button>
          <Tooltip>Saves</Tooltip>
        </TooltipTrigger>
      </TooltipProvider>
    ));

    user.hover(save());
    await after(20);
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves");
  });

  test("the next one skips the delay while the window is open, and says so", async () => {
    render(() => <Toolbar delay={40} skipDelay={200} closeDelay={0} />);

    user.hover(save());
    await after(40);
    flush();
    user.unhover(save());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();

    user.hover(undo());
    await tick();
    flush();
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Undoes");
    expect(tooltip.getAttribute("data-state")).toBe("instant-open");
  });

  test("once the window has passed, the next one waits again", async () => {
    render(() => <Toolbar delay={40} skipDelay={30} closeDelay={0} />);

    user.hover(save());
    await after(40);
    flush();
    user.unhover(save());
    await after(30);
    flush();

    user.hover(undo());
    await tick();
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();

    await after(40);
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Undoes");
  });

  test("a window of zero means every tooltip waits", async () => {
    render(() => <Toolbar delay={40} skipDelay={0} closeDelay={0} />);

    user.hover(save());
    await after(40);
    flush();
    user.unhover(save());
    flush();

    user.hover(undo());
    await tick();
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("with nothing to travel to, the tooltip goes the moment the pointer leaves", async () => {
    render(() => <Toolbar delay={0} isContentHoverable={false} />);

    user.hover(save());
    await tick();
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves");

    user.unhover(save());
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("content that is not hoverable does not hold it open", async () => {
    render(() => <Toolbar delay={0} closeDelay={20} isContentHoverable={false} />);

    user.hover(save());
    await tick();
    flush();
    const tooltip = screen.getByRole("tooltip");

    user.unhover(save());
    user.hover(tooltip);
    await after(20);
    flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("hoverable content, the default, stays while the pointer is on it", async () => {
    render(() => (
      <TooltipProvider delay={0}>
        <TooltipTrigger closeDelay={20}>
          <Button>Save</Button>
          <Tooltip>Saves</Tooltip>
        </TooltipTrigger>
      </TooltipProvider>
    ));

    user.hover(save());
    await tick();
    flush();
    user.unhover(save());
    user.hover(screen.getByRole("tooltip"));
    await after(20);
    flush();
    expect(screen.getByRole("tooltip").textContent).toBe("Saves");
  });
});
