import { beforeEach, describe, expect, test } from "bun:test";
import { resetTooltipWarmup } from "@barqjs/aria/tooltip";
import { createSignal, flush, onSettled, type Incoming } from "@barqjs/core";
import {
  accessibleDescription,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import { Kbd } from "./kbd.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type TooltipContentProps,
} from "./tooltip.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 15));
}

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function Toolbar(
  props: Incoming<{
    delayDuration?: number;
    skipDelayDuration?: number;
    disableHoverableContent?: boolean;
    content?: TooltipContentProps;
  }>,
) {
  return (
    <TooltipProvider
      delayDuration={props.delayDuration?.()}
      skipDelayDuration={props.skipDelayDuration?.()}
      disableHoverableContent={props.disableHoverableContent?.()}
    >
      <Tooltip>
        <TooltipTrigger>
          <Button>Save</Button>
        </TooltipTrigger>
        <TooltipContent
          side={props.content?.()?.side}
          align={props.content?.()?.align}
          sideOffset={props.content?.()?.sideOffset}
          alignOffset={props.content?.()?.alignOffset}
          placement={props.content?.()?.placement}
          offset={props.content?.()?.offset}
        >
          Saves to the server
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <Button>Undo</Button>
        </TooltipTrigger>
        <TooltipContent>Undoes the last change</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const save = (): HTMLElement => screen.getByRole("button", { name: "Save" });
const undo = (): HTMLElement => screen.getByRole("button", { name: "Undo" });
const tip = (): HTMLElement | null => document.querySelector('[data-slot="tooltip-content"]');

describe("Tooltip, written as upstream writes it", () => {
  beforeEach(() => {
    resetTooltipWarmup();
  });

  test("the trigger is the control inside, described by the tooltip and not renamed", async () => {
    render(() => <Toolbar />);
    expect(tip()).toBeNull();
    expect(save().getAttribute("data-state")).toBe("closed");

    user.hover(save());
    await settle();

    expect(tip()?.getAttribute("role")).toBe("tooltip");
    expect(save().getAttribute("aria-describedby")).toBe(tip()?.getAttribute("id") ?? "");
    expect(accessibleDescription(save())).toBe("Saves to the server");
    expect(save().getAttribute("aria-label")).toBeNull();
    expect(save().getAttribute("data-slot")).toBe("button");
    expectNoAriaViolations(document.body);
  });

  test("the provider's delay is shadcn's: none, unless it is given one", async () => {
    const view = render(() => <Toolbar />);
    user.hover(save());
    await settle();
    expect(tip()).not.toBeNull();
    view.unmount();
    resetTooltipWarmup();

    render(() => <Toolbar delayDuration={40} />);
    user.hover(save());
    await settle();
    expect(tip()).toBeNull();
    await after(40);
    flush();
    expect(tip()?.textContent).toBe("Saves to the server");
  });

  test("a tooltip's own delayDuration wins over the provider's", async () => {
    render(() => (
      <TooltipProvider delayDuration={5000}>
        <Tooltip delayDuration={20}>
          <TooltipTrigger>
            <Button>Save</Button>
          </TooltipTrigger>
          <TooltipContent>Saves</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ));
    user.hover(save());
    await after(20);
    flush();
    expect(tip()?.textContent).toBe("Saves");
  });

  test("it says how it opened and where it is, on the tooltip and on the trigger", async () => {
    render(() => <Toolbar content={{ side: "right", align: "start" }} />);
    user.hover(save());
    await settle();

    expect(tip()?.getAttribute("data-state")).toBe("delayed-open");
    expect(save().getAttribute("data-state")).toBe("delayed-open");
    expect(tip()?.getAttribute("data-side")).toBe("right");
    expect(tip()?.getAttribute("data-placement")).toBe("right");
    expect(tip()?.getAttribute("data-align")).toBe("start");
  });

  test("the keyboard opens it at once, and it says instant-open", async () => {
    render(() => <Toolbar delayDuration={5000} />);
    user.tab();
    await settle();

    expect(document.activeElement).toBe(save());
    expect(tip()?.getAttribute("data-state")).toBe("instant-open");

    user.keyDown("Escape");
    flush();
    expect(tip()).toBeNull();
  });

  test("the next tooltip skips the delay inside the provider's window", async () => {
    render(() => <Toolbar delayDuration={40} skipDelayDuration={200} disableHoverableContent />);
    user.hover(save());
    await after(40);
    flush();
    user.unhover(save());
    flush();
    expect(tip()).toBeNull();

    user.hover(undo());
    await settle();
    expect(tip()?.textContent).toBe("Undoes the last change");
    expect(tip()?.getAttribute("data-state")).toBe("instant-open");
  });

  test("disableHoverableContent: the tooltip goes when the pointer leaves the trigger", async () => {
    render(() => <Toolbar disableHoverableContent />);
    user.hover(save());
    await settle();
    expect(tip()).not.toBeNull();

    user.unhover(save());
    flush();
    expect(tip()).toBeNull();
  });

  test("sideOffset and alignOffset are the distances upstream names", async () => {
    render(() => (
      <Toolbar content={{ side: "bottom", align: "start", sideOffset: 20, alignOffset: 7 }} />
    ));
    save().getBoundingClientRect = () =>
      ({ top: 100, left: 300, width: 80, height: 30, right: 380, bottom: 130 }) as DOMRect;
    user.hover(save());
    await settle();

    // Under the trigger by its height and the offset, and along from its edge.
    expect(tip()?.style.top).toBe("150px");
    expect(tip()?.style.left).toBe("307px");
  });

  test("placement and offset, where given, win over side and sideOffset", async () => {
    render(() => (
      <Toolbar content={{ side: "bottom", placement: "left", sideOffset: 20, offset: 5 }} />
    ));
    save().getBoundingClientRect = () =>
      ({ top: 100, left: 300, width: 80, height: 30, right: 380, bottom: 130 }) as DOMRect;
    user.hover(save());
    await settle();

    expect(tip()?.getAttribute("data-side")).toBe("left");
    expect(tip()?.style.left).toBe("295px");
  });

  test("the arrow names its slot and follows the side", async () => {
    render(() => <Toolbar content={{ side: "bottom" }} />);
    user.hover(save());
    await settle();

    const arrow = document.querySelector('[data-slot="tooltip-arrow"]') as HTMLElement;
    expect(arrow.getAttribute("data-side")).toBe("bottom");
    expect(rulesFor(arrow.className)).toContain('[data-side="bottom"]');
  });

  test("a trigger can be any element given the trigger's props, and stays what it was", async () => {
    render(() => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={(trigger) => (
              <a {...trigger.props} ref={trigger.ref} href="https://example.com/help">
                Help
              </a>
            )}
          />
          <TooltipContent>What this does</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ));
    const help = screen.getByRole("link", { name: "Help" });
    expect(help.getAttribute("data-state")).toBe("closed");
    // A link stays a link: nothing about being a button was handed over.
    expect(help.hasAttribute("type")).toBe(false);
    expect(help.hasAttribute("role")).toBe(false);

    user.hover(help);
    await settle();
    expect(accessibleDescription(help)).toBe("What this does");
    expect(help.getAttribute("data-state")).toBe("delayed-open");
  });

  test("a shortcut key takes its padding off the inline end", async () => {
    render(() => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Button>Save</Button>
          </TooltipTrigger>
          <TooltipContent>
            Save <Kbd>S</Kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ));
    user.hover(save());
    await settle();

    const rules = rulesFor(tip()?.className ?? "");
    expect(rules).toContain("padding-inline-end:");
    expect(rules).not.toContain("padding-right:");
  });
});

describe("a controlled tooltip", () => {
  beforeEach(() => {
    resetTooltipWarmup();
  });

  test("opened as soon as the page settles is open", async () => {
    function Hint() {
      const [open, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <Tooltip isOpen={open()} onOpenChange={setOpen}>
          <TooltipTrigger>
            <Button>Save</Button>
          </TooltipTrigger>
          <TooltipContent>Saves to the server</TooltipContent>
        </Tooltip>
      );
    }

    render(() => <Hint />);
    await settle();
    await settle();
    expect(tip()?.textContent).toContain("Saves to the server");
    expect(accessibleDescription(save())).toBe("Saves to the server");
  });
});
