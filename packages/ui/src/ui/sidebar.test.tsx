import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetTooltipWarmup } from "@barqjs/aria/tooltip";
import { flush, type Child } from "@barqjs/core";
import { cleanup, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
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
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarInput,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  sidebarGroupLabelVariants,
  sidebarMenuActionVariants,
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

describe("SidebarMenuButton tooltip", () => {
  /**
   * Long enough for the tooltip's own timer to have run: until it is there, or
   * for the length of time that would have shown it if it were going to be.
   */
  async function after(ms: number): Promise<void> {
    for (let tries = 0; tries < 20 && tip() === null; tries++) {
      await new Promise((resolve) => setTimeout(resolve, ms + 15));
      flush();
    }
  }

  beforeEach(() => {
    resetTooltipWarmup();
  });
  afterEach(cleanup);

  function Rail(props: {
    defaultOpen?: boolean;
    tooltip: string | { children: string; placement?: "left" | "right" };
  }) {
    return (
      <SidebarProvider defaultOpen={props.defaultOpen}>
        <Sidebar collapsible="icon">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={props.tooltip}>Inbox</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    );
  }

  const button = (): HTMLElement =>
    document.querySelector('[data-slot="sidebar-menu-button"]') as HTMLElement;
  const tip = (): HTMLElement | null => document.querySelector('[data-slot="tooltip-content"]');

  test("collapsed to icons, hovering a row names it", async () => {
    render(() => <Rail defaultOpen={false} tooltip="Inbox" />);
    expect(tip()).toBeNull();

    await user.hover(button());
    await after(0);
    flush();
    expect(tip()?.textContent).toContain("Inbox");
    expect(tip()?.getAttribute("role")).toBe("tooltip");
    // The description is on the control, which is what a screen reader reads.
    expect(button().getAttribute("aria-describedby")).toBe(tip()?.getAttribute("id") ?? null);
  });

  test("keyboard focus names it too", async () => {
    render(() => <Rail defaultOpen={false} tooltip="Inbox" />);
    await user.tab();
    await after(0);
    flush();
    expect(document.activeElement).toBe(button());
    expect(tip()?.textContent).toContain("Inbox");
  });

  test("expanded, the label is already on screen and the tooltip stays away", async () => {
    render(() => <Rail tooltip="Inbox" />);
    await user.hover(button());
    await after(0);
    flush();
    expect(tip()).toBeNull();
    expect(button().hasAttribute("aria-describedby")).toBe(false);
  });

  test("collapsing afterwards turns it on without a remount", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Inbox">Inbox</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>
    ));
    const control = button();
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    await user.hover(button());
    await after(0);
    flush();
    expect(button()).toBe(control);
    expect(tip()?.textContent).toContain("Inbox");
  });

  test("the tooltip can be an object, for a side and a body of its own", async () => {
    render(() => (
      <Rail defaultOpen={false} tooltip={{ children: "All mail", placement: "left" }} />
    ));
    await user.hover(button());
    await after(0);
    flush();
    expect(tip()?.textContent).toContain("All mail");
    expect(tip()?.getAttribute("data-placement")).toBe("left");
  });

  test("the row keeps every attribute the rules select on", () => {
    render(() => <Rail tooltip="Inbox" />);
    expect(button().tagName).toBe("BUTTON");
    expect(button().getAttribute("type")).toBe("button");
    expect(button().getAttribute("data-sidebar")).toBe("menu-button");
    expect(button().getAttribute("data-size")).toBe("default");
    expect(button().getAttribute("data-active")).toBe("false");
  });
});

describe("Sidebar on a narrow viewport", () => {
  interface FakeList {
    matches: boolean;
    listeners: Set<(event: { matches: boolean }) => void>;
    addEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
    removeEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
  }

  const realMatchMedia = window.matchMedia;
  let list: FakeList;

  beforeEach(() => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    list = {
      matches: false,
      listeners,
      addEventListener: (_type, handler) => listeners.add(handler),
      removeEventListener: (_type, handler) => listeners.delete(handler),
    };
    window.matchMedia = (() => list) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = realMatchMedia;
  });

  const narrow = (matches: boolean): void => {
    list.matches = matches;
    for (const handler of list.listeners) handler({ matches });
    flush();
  };

  test("it becomes a sheet the trigger opens, and a column again when wide", async () => {
    render(() => <Shell />);
    expect(shell().getAttribute("data-mobile")).toBeNull();

    narrow(true);
    expect(document.querySelector('[data-slot="sidebar-gap"]')).toBeNull();
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('[data-mobile="true"]')).not.toBeNull();
    expect(dialog?.querySelector('[data-slot="sidebar-content"]')).not.toBeNull();
    const title = document.getElementById(dialog?.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Sidebar");
    const mobile = document.querySelector('[data-slot="sidebar"]');
    expect(rulesFor(mobile?.className ?? "")).toContain("--sidebar-width: 18rem");

    narrow(false);
    expect(document.querySelector('[data-slot="sidebar-gap"]')).not.toBeNull();
  });

  test("the context says which it is", () => {
    let mobile: () => boolean = () => true;
    function Probe() {
      mobile = useSidebar().isMobile;
      return <div />;
    }
    render(() => (
      <SidebarProvider>
        <Probe />
      </SidebarProvider>
    ));
    expect(mobile()).toBe(false);
    narrow(true);
    expect(mobile()).toBe(true);
  });
});

describe("Sidebar parts", () => {
  afterEach(cleanup);

  test("every part carries shadcn's data-sidebar name beside its slot", () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <SidebarInput placeholder="Search" />
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupAction aria-label="Add project">+</SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Inbox</SidebarMenuButton>
                    <SidebarMenuAction aria-label="More">…</SidebarMenuAction>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="/starred">Starred</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>salama</SidebarFooter>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>
    ));
    const named: Record<string, string> = {
      "sidebar-header": "header",
      "sidebar-input": "input",
      "sidebar-separator": "separator",
      "sidebar-content": "content",
      "sidebar-group": "group",
      "sidebar-group-label": "group-label",
      "sidebar-group-action": "group-action",
      "sidebar-group-content": "group-content",
      "sidebar-menu": "menu",
      "sidebar-menu-item": "menu-item",
      "sidebar-menu-button": "menu-button",
      "sidebar-menu-action": "menu-action",
      "sidebar-menu-sub": "menu-sub",
      "sidebar-menu-sub-item": "menu-sub-item",
      "sidebar-menu-sub-button": "menu-sub-button",
      "sidebar-menu-skeleton": "menu-skeleton",
      "sidebar-menu-skeleton-icon": "menu-skeleton-icon",
      "sidebar-menu-skeleton-text": "menu-skeleton-text",
      "sidebar-footer": "footer",
      "sidebar-trigger": "trigger",
      "sidebar-inner": "sidebar",
    };
    for (const [slot, name] of Object.entries(named)) {
      const element = document.querySelector(`[data-slot="${slot}"]`);
      expect(element, slot).not.toBeNull();
      expect(element?.getAttribute("data-sidebar"), slot).toBe(name);
    }
  });

  test("what sits at the end of a row follows the reading direction", () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarGroup>
            <SidebarGroupAction aria-label="Add project">+</SidebarGroupAction>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Inbox</SidebarMenuButton>
                <SidebarMenuAction aria-label="More">…</SidebarMenuAction>
                <SidebarMenuBadge>12</SidebarMenuBadge>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton href="/starred">Starred</SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </Sidebar>
      </SidebarProvider>
    ));
    const rules = (slot: string): string =>
      rulesFor(document.querySelector(`[data-slot="${slot}"]`)?.className ?? "");
    for (const slot of ["sidebar-group-action", "sidebar-menu-action", "sidebar-menu-badge"]) {
      expect(rules(slot), slot).toContain("inset-inline-end:");
      // An atom is named for its property, so a base-level `right` would be one.
      expect(rules(slot), slot).not.toContain(".a-right_");
    }
    expect(rules("sidebar-menu-button")).toContain("text-align: start");
    expect(rules("sidebar-menu-button")).toContain("padding-inline-end:");
    expect(rules("sidebar-menu-sub")).toContain("border-inline-start-width: 1px");
  });

  test("the trigger runs the caller's handler and then toggles", async () => {
    let pressed = 0;
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarContent />
        </Sidebar>
        <SidebarTrigger onPress={() => pressed++} />
      </SidebarProvider>
    ));
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(pressed).toBe(1);
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });

  test("the shortcut works wherever focus is, as shadcn's does", () => {
    render(() => <Shell />);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true, cancelable: true }),
    );
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });

  test("the context answers to shadcn's toggleSidebar as well", () => {
    let toggle: () => void = () => {};
    function Probe() {
      toggle = useSidebar().toggleSidebar;
      return <div />;
    }
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarContent />
        </Sidebar>
        <Probe />
      </SidebarProvider>
    ));
    toggle();
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });
});

describe("Sidebar parts as triggers", () => {
  afterEach(cleanup);

  async function settle(): Promise<void> {
    flush();
    await tick();
    flush();
  }

  const ACTIONS = [
    { id: "profile", name: "Profile" },
    { id: "sign-out", name: "Sign out" },
  ];

  function Account(props: { children?: Child }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>{props.children}</DropdownMenuTrigger>
        <DropdownMenuContent items={ACTIONS} aria-label="Account">
          {(action: (typeof ACTIONS)[number]) => <DropdownMenuItem>{action.name}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  test("a menu button opens the dropdown it is the trigger of", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarMenu>
            <SidebarMenuItem>
              <Account>
                <SidebarMenuButton size="lg">salama</SidebarMenuButton>
              </Account>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ));
    const trigger = document.querySelector('[data-slot="sidebar-menu-button"]') as HTMLElement;
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger);
    await settle();
    expect(screen.getByRole("menu", { name: "Account" })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // The row stays lit while its menu is open, which the rules read off this.
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Profile",
      "Sign out",
    ]);
  });

  test("the keyboard opens it too, and focus lands in the menu", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarMenu>
            <SidebarMenuItem>
              <Account>
                <SidebarMenuButton>salama</SidebarMenuButton>
              </Account>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ));
    const trigger = document.querySelector('[data-slot="sidebar-menu-button"]') as HTMLElement;
    trigger.focus();
    user.key("Enter");
    await settle();
    expect(screen.getByRole("menu", { name: "Account" })).toBeTruthy();
  });

  test("a menu action opens the dropdown it is the trigger of", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>Design</SidebarMenuButton>
              <Account>
                <SidebarMenuAction aria-label="More">…</SidebarMenuAction>
              </Account>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ));
    const action = screen.getByRole("button", { name: "More" });
    expect(action.getAttribute("data-slot")).toBe("sidebar-menu-action");
    expect(action.getAttribute("aria-haspopup")).toBe("true");
    // The row beside it is not the trigger and must not be made one.
    const row = document.querySelector('[data-slot="sidebar-menu-button"]') as HTMLElement;
    expect(row.hasAttribute("aria-haspopup")).toBe(false);

    await user.click(action);
    await settle();
    expect(screen.getByRole("menu", { name: "Account" })).toBeTruthy();
    expect(action.getAttribute("data-state")).toBe("open");
  });

  test("a link with a tooltip is still a link", async () => {
    render(() => (
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton href="/inbox" tooltip="Inbox">
                Inbox
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ));
    const link = document.querySelector('[data-slot="sidebar-menu-button"]') as HTMLElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/inbox");
    expect(link.hasAttribute("role")).toBe(false);
  });

  test("the action's classes are there for a control of the caller's own", () => {
    const plain = sidebarMenuActionVariants();
    const onHover = sidebarMenuActionVariants({ showOnHover: true });
    expect(rulesFor(plain)).toContain("inset-inline-end:");
    expect(onHover).not.toBe(plain);
    expect(rulesFor(onHover)).toContain("opacity: 0%");

    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuAction showOnHover aria-label="More">
                …
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        </Sidebar>
      </SidebarProvider>
    ));
    const action = screen.getByRole("button", { name: "More" });
    for (const name of onHover.split(" ")) expect(action.classList.contains(name)).toBe(true);
  });

  test("a group label's classes make a collapsible trigger the label", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <Collapsible defaultOpen>
            <SidebarGroup>
              <CollapsibleTrigger
                data-slot="sidebar-group-label"
                data-sidebar="group-label"
                class={sidebarGroupLabelVariants()}
              >
                Help
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>Docs</SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        </Sidebar>
      </SidebarProvider>
    ));
    const label = screen.getByRole("button", { name: "Help" });
    expect(label.getAttribute("data-slot")).toBe("sidebar-group-label");
    expect(label.getAttribute("aria-expanded")).toBe("true");
    for (const name of sidebarGroupLabelVariants().split(" ")) {
      expect(label.classList.contains(name)).toBe(true);
    }

    await user.click(label);
    flush();
    expect(label.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[data-slot="collapsible"]')?.getAttribute("data-state")).toBe(
      "closed",
    );
  });

  test("a group label inside a collapsible's trigger is that trigger", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <Collapsible defaultOpen>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel>Help</SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>Docs</SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        </Sidebar>
      </SidebarProvider>
    ));
    // One element: the label is the control, with nothing wrapped around it.
    expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull();
    const label = screen.getByRole("button", { name: "Help" });
    expect(label.getAttribute("data-slot")).toBe("sidebar-group-label");
    expect(label.getAttribute("tabindex")).toBe("0");
    expect(label.getAttribute("aria-expanded")).toBe("true");
    const panel = document.querySelector('[data-slot="collapsible-content"]') as HTMLElement;
    expect(label.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(label.id);

    await user.click(label);
    flush();
    expect(label.getAttribute("aria-expanded")).toBe("false");

    label.focus();
    await user.keyboard("{Enter}");
    flush();
    expect(label.getAttribute("aria-expanded")).toBe("true");
  });

  test("a group label written inside a trigger becomes that trigger", async () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarGroup>
            <Account>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            </Account>
          </SidebarGroup>
        </Sidebar>
      </SidebarProvider>
    ));
    const label = document.querySelector('[data-slot="sidebar-group-label"]') as HTMLElement;
    // A `<div>` that opens something has to say it is a button and be reachable.
    expect(label.getAttribute("role")).toBe("button");
    expect(label.getAttribute("tabindex")).toBe("0");
    expect(label.getAttribute("aria-haspopup")).toBe("true");

    await user.click(label);
    await settle();
    expect(screen.getByRole("menu", { name: "Account" })).toBeTruthy();
  });

  test("on its own a group label is a plain label", () => {
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
          </SidebarGroup>
        </Sidebar>
      </SidebarProvider>
    ));
    const label = document.querySelector('[data-slot="sidebar-group-label"]') as HTMLElement;
    expect(label.hasAttribute("role")).toBe(false);
    expect(label.hasAttribute("tabindex")).toBe(false);
  });
});

describe("Sidebar props that reach the element", () => {
  afterEach(cleanup);

  test("the input takes what any input takes", async () => {
    const typed: string[] = [];
    render(() => (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <SidebarInput
              type="search"
              name="q"
              placeholder="Search the docs"
              aria-label="Search"
              onInput={(event) => typed.push((event.target as HTMLInputElement).value)}
            />
          </SidebarHeader>
        </Sidebar>
      </SidebarProvider>
    ));
    const input = screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement;
    expect(input.getAttribute("placeholder")).toBe("Search the docs");
    expect(input.getAttribute("type")).toBe("search");
    expect(input.getAttribute("name")).toBe("q");
    user.type(input, "ab");
    expect(typed.at(-1)).toBe("ab");
  });

  test("a caller's width wins over the default, and the other default stays", () => {
    render(() => (
      <SidebarProvider style={{ "--sidebar-width": "20rem", color: "red" }}>
        <Sidebar>
          <SidebarContent />
        </Sidebar>
      </SidebarProvider>
    ));
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("20rem");
    expect(wrapper.style.getPropertyValue("--sidebar-width-icon")).toBe("3rem");
    expect(wrapper.style.color).toBe("red");
  });
});
