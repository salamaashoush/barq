import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { cleanup, render, screen, user } from "@barqjs/testing";

import { Button } from "./button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "./sidebar.tsx";

afterEach(cleanup);

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

describe("Collapsible", () => {
  test("every part says open or closed", async () => {
    render(() => (
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    for (const name of ["collapsible", "collapsible-trigger", "collapsible-content"]) {
      expect(slot(name).getAttribute("data-state"), name).toBe("closed");
    }
    await user.click(screen.getByRole("button", { name: "Details" }));
    flush();
    for (const name of ["collapsible", "collapsible-trigger", "collapsible-content"]) {
      expect(slot(name).getAttribute("data-state"), name).toBe("open");
    }
  });

  test("asChild hands the trigger to the control written inside it", async () => {
    render(() => (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost">Details</Button>
        </CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull();
    const button = screen.getByRole("button", { name: "Details" });
    expect(button.getAttribute("data-slot")).toBe("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(slot("collapsible-content").id);

    await user.click(button);
    flush();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(slot("collapsible").getAttribute("data-state")).toBe("open");
  });

  test("render builds the trigger out of any element", async () => {
    render(() => (
      <Collapsible>
        <CollapsibleTrigger
          render={(part) => (
            <button {...part.props} ref={part.ref} class="row">
              Details
            </button>
          )}
        />
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const control = screen.getByRole("button", { name: "Details" });
    expect(control.className).toBe("row");
    expect(control.getAttribute("data-slot")).toBe("collapsible-trigger");
    expect(control.getAttribute("aria-expanded")).toBe("false");

    control.focus();
    await user.keyboard(" ");
    flush();
    expect(control.getAttribute("aria-expanded")).toBe("true");
  });

  test("defaultOpen starts it open and onOpenChange hears it shut", async () => {
    const seen: boolean[] = [];
    render(() => (
      <Collapsible defaultOpen onOpenChange={(open) => seen.push(open)}>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const trigger = screen.getByRole("button", { name: "Details" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await user.click(trigger);
    flush();
    expect(seen).toEqual([false]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("open is the owner's to change", async () => {
    const [open, setOpen] = createSignal(false);
    const asked: boolean[] = [];
    render(() => (
      <Collapsible open={open()} onOpenChange={(next) => asked.push(next)}>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const trigger = screen.getByRole("button", { name: "Details" });
    await user.click(trigger);
    flush();
    expect(asked).toEqual([true]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    setOpen(true);
    flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  test("disabled says so on every part and the trigger does nothing", async () => {
    render(() => (
      <Collapsible disabled>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ));
    const trigger = screen.getByRole("button", { name: "Details" });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    for (const name of ["collapsible", "collapsible-trigger", "collapsible-content"]) {
      expect(slot(name).getAttribute("data-disabled"), name).toBe("");
    }
    await user.click(trigger);
    flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Collapsible, rendered as another element", () => {
  test("render makes a sidebar menu item the collapsible, state and all", async () => {
    let held: Element | null = null;
    render(() => (
      <SidebarProvider>
        <SidebarMenu>
          <Collapsible
            defaultOpen
            class="group/collapsible"
            ref={(element) => {
              held = element;
            }}
            render={(root) => (
              <SidebarMenuItem {...root.props} ref={root.ref}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton>Projects</SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="/acme">Acme Inc</SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            )}
          />
        </SidebarMenu>
      </SidebarProvider>
    ));

    const item = slot("sidebar-menu-item");
    expect(item.tagName).toBe("LI");
    expect(document.querySelector('[data-slot="collapsible"]')).toBeNull();
    expect(item.classList.contains("group/collapsible")).toBe(true);
    expect(item.getAttribute("data-state")).toBe("open");
    expect(held === item).toBe(true);

    const button = screen.getByRole("button", { name: "Projects" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel?.getAttribute("data-slot")).toBe("collapsible-content");
    expect(screen.getByRole("link", { name: "Acme Inc" })).toBeTruthy();

    await user.click(button);
    flush();
    expect(item.getAttribute("data-state")).toBe("closed");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    button.focus();
    await user.keyboard("{Enter}");
    flush();
    expect(item.getAttribute("data-state")).toBe("open");
  });
});
