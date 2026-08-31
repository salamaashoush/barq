import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./sidebar.tsx";

function Shell(props: { defaultOpen?: boolean }) {
  return (
    <SidebarProvider defaultOpen={props.defaultOpen}>
      <Sidebar>
        <SidebarHeader>Acme</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive>Inbox</SidebarMenuButton>
                <SidebarMenuBadge>12</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton href="/drafts">Drafts</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>Signed in</SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
      </SidebarInset>
    </SidebarProvider>
  );
}

const shell = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("Sidebar", () => {
  test("the widths are custom properties, so one element retargets every part", () => {
    render(() => <Shell />);
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    // A class would put the width in the stylesheet and out of a caller's reach.
    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("16rem");
    expect(wrapper.style.getPropertyValue("--sidebar-width-icon")).toBe("3rem");
  });

  test("the three elements are the gap, the fixed container and the drawn inner", () => {
    render(() => <Shell />);
    // Animating a FIXED element while a placeholder holds the space is what
    // moves the page content without relayout jitter; one element cannot.
    expect(document.querySelector('[data-slot="sidebar-gap"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="sidebar-container"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="sidebar-inner"]')).not.toBeNull();
  });

  test("state, side, variant and collapsible are all attributes", () => {
    // Every one of shadcn's `group-data-[…]` selectors reads one of these, so
    // a missing attribute is a whole family of rules that never matches.
    render(() => <Shell />);
    expect(shell().getAttribute("data-state")).toBe("expanded");
    expect(shell().getAttribute("data-side")).toBe("left");
    expect(shell().getAttribute("data-variant")).toBe("sidebar");
    expect(shell().getAttribute("data-collapsible")).toBe("");
  });

  test("the trigger collapses it, and names the collapsible mode when it does", async () => {
    render(() => <Shell />);
    // The rail carries the same accessible name, which is shadcn's own choice,
    // so this addresses the trigger by its slot rather than by that name.
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
    // Empty while expanded and the mode while collapsed, which is what makes
    // `group-data-[collapsible=icon]` select only a collapsed icon sidebar.
    expect(shell().getAttribute("data-collapsible")).toBe("offcanvas");
  });

  test("defaultOpen false starts collapsed", () => {
    render(() => <Shell defaultOpen={false} />);
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });

  test("the rail toggles too, and stays out of the tab order", async () => {
    render(() => <Shell />);
    const rail = document.querySelector('[data-slot="sidebar-rail"]') as HTMLElement;
    // It is a redundant target for the trigger, so reaching it by Tab would be
    // a second stop that does the same thing.
    expect(rail.getAttribute("tabindex")).toBe("-1");
    await user.click(rail);
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });

  test("a menu button is a button, or an anchor when it has an href", () => {
    render(() => <Shell />);
    const buttons = [...document.querySelectorAll('[data-slot="sidebar-menu-button"]')];
    expect(buttons[0]?.tagName).toBe("BUTTON");
    expect(buttons[1]?.tagName).toBe("A");
    expect(buttons[1]?.getAttribute("href")).toBe("/drafts");
  });

  test("the active row says so, and the size the badge lines up against", () => {
    render(() => <Shell />);
    const first = document.querySelector('[data-slot="sidebar-menu-button"]');
    expect(first?.getAttribute("data-active")).toBe("true");
    // `peer-data-[size=default]/menu-button:top-1.5` positions the badge off
    // this, so it is load-bearing rather than informational.
    expect(first?.getAttribute("data-size")).toBe("default");
  });

  test("the collapsed icon rail hides the label rather than shrinking it", () => {
    render(() => <Shell />);
    const label = document.querySelector('[data-slot="sidebar-group-label"]');
    const rules = rulesFor([...(label?.classList ?? [])].join(" "));
    // shadcn slides it out with a negative margin and fades it, so the icons
    // below do not jump when it goes.
    expect(rules).toContain('[data-collapsible="icon"]');
    expect(rules).toContain("opacity: 0%");
  });

  test("Ctrl+B toggles it, which is shadcn's shortcut", async () => {
    render(() => <Shell />);
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    wrapper.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }));
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });

  test("a plain b does nothing, or typing in the sidebar would collapse it", async () => {
    render(() => <Shell />);
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    wrapper.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    flush();
    expect(shell().getAttribute("data-state")).toBe("expanded");
  });

  test("a skeleton row varies its width, so a column is not a barcode", () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarMenu>
            <SidebarMenuSkeleton showIcon />
            <SidebarMenuSkeleton />
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ));
    const text = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="sidebar-menu-skeleton-text"]'),
    ];
    expect(text).toHaveLength(2);
    for (const each of text) {
      const width = Number.parseInt(each.style.maxWidth, 10);
      expect(width).toBeGreaterThanOrEqual(50);
      expect(width).toBeLessThanOrEqual(89);
    }
    // The icon is opt-in, so only the first row has one.
    expect(document.querySelectorAll('[data-slot="sidebar-menu-skeleton-icon"]')).toHaveLength(1);
  });

  test("using the context outside a provider says what is wrong", () => {
    function Loose() {
      useSidebar();
      return <div />;
    }
    expect(() => render(() => <Loose />)).toThrow("inside a <SidebarProvider>");
  });
});
