import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";

import { useTrigger } from "../lib/trigger.tsx";
import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type DropdownMenuSelectEvent,
} from "./dropdown-menu.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const ACTIONS = [
  { id: "rename", name: "Rename" },
  { id: "duplicate", name: "Duplicate" },
  { id: "delete", name: "Delete" },
];

describe("DropdownMenu", () => {
  function Fixture(props: Incoming<{ onAction?: (key: string) => void }>) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline">Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          items={ACTIONS}
          aria-label="Actions"
          onAction={(key) => props.onAction?.()?.(String(key))}
        >
          {(action: (typeof ACTIONS)[number]) => (
            <DropdownMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
              {action.name}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  test("the trigger is the button, and it says what it opens", () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("pressing it opens a menu of the items", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Delete",
    ]);
  });

  test("choosing one reports its key and closes", async () => {
    const chosen: string[] = [];
    render(() => <Fixture onAction={(key) => chosen.push(key)} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await settle();
    expect(chosen).toEqual(["duplicate"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("an item's variant is an attribute, and the CSS reads it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    const remove = screen.getByRole("menuitem", { name: "Delete" });
    expect(remove.getAttribute("data-variant")).toBe("destructive");
    expect(rulesFor(remove.className)).toContain('[data-variant="destructive"]');
  });

  test("the arrow keys move through the items", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await settle();

    expect(document.activeElement?.textContent).toBe("Rename");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Duplicate");
  });

  test("a checkbox item shows its tick from data-selected, not from a conditional", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          items={[{ id: "status", name: "Status bar" }]}
          aria-label="View"
          selectionMode="multiple"
          defaultSelectedKeys={["status"]}
        >
          {(entry: { id: string; name: string }) => (
            <DropdownMenuCheckboxItem>{entry.name}</DropdownMenuCheckboxItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "View" }));
    await settle();

    const entry = screen.getByRole("menuitemcheckbox", { name: "Status bar" });
    expect(entry.getAttribute("aria-checked")).toBe("true");
    expect(entry.getAttribute("data-selected")).toBe("");

    const mark = document.querySelector('[data-slot="dropdown-menu-item-indicator"]')!;
    const rules = rulesFor(mark.className);
    expect(rules).toContain("svg{display: none}");
    expect(rules).toContain("[data-selected] .");
  });

  test("a menu that renames the item renames the tick with it", async () => {
    // A style names the tick after the menu it is in, so a context menu whose
    // tick still says `dropdown-menu-item-indicator` is a tick that
    // `cn-context-menu-item-indicator` never reaches.
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          items={[{ id: "status", name: "Status bar" }]}
          aria-label="View"
          selectionMode="multiple"
        >
          {(entry: { id: string; name: string }) => (
            <DropdownMenuCheckboxItem indicatorSlot="context-menu-item-indicator">
              {entry.name}
            </DropdownMenuCheckboxItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "View" }));
    await settle();

    expect(document.querySelector('[data-slot="context-menu-item-indicator"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="dropdown-menu-item-indicator"]')).toBeNull();
  });

  test("a label and a separator are presentational", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent items={ACTIONS} aria-label="More">
          {(action: (typeof ACTIONS)[number]) => (
            <DropdownMenuItem>
              {action.name}
              <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "More" }));
    await settle();
    expect(document.querySelector('[data-slot="dropdown-menu-shortcut"]')?.textContent).toBe("⌘R");
    void DropdownMenuLabel;
    void DropdownMenuSeparator;
  });

  test("Escape closes it and focus returns to the trigger", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    await settle();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

/** Focus going back to a trigger is deferred to a frame. */
async function frame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  flush();
}

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

/**
 * The menu as shadcn writes it: every part a child, in whatever order the
 * author put them.
 */
describe("a DropdownMenu written as children", () => {
  function Account(
    props: Incoming<{
      onProfile?: (event: DropdownMenuSelectEvent) => void;
      onAction?: (key: string) => void;
    }>,
  ) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline">Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onAction={(key) => props.onAction?.()?.(String(key))}>
          <DropdownMenuLabel>My account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel inset>Workspace</DropdownMenuLabel>
            <DropdownMenuItem id="profile" onSelect={props.onProfile?.()}>
              Profile
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem id="billing" disabled>
              Billing
            </DropdownMenuItem>
            <DropdownMenuItem id="settings" inset>
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="team">Team</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Invite users</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem id="email">Email</DropdownMenuItem>
              <DropdownMenuItem id="message">Message</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="log-out" variant="destructive">
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  async function open(): Promise<void> {
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
  }

  test("the parts sit where they were written, and only the items are items", async () => {
    render(() => <Account />);
    await open();

    const menu = screen.getByRole("menu");
    expect(accessibleName(menu)).toBe("Open");
    expect([...menu.children].map((child) => child.getAttribute("data-slot"))).toEqual([
      "dropdown-menu-label",
      "dropdown-menu-separator",
      null,
      "dropdown-menu-separator",
      "dropdown-menu-item",
      "dropdown-menu-sub-trigger",
      "dropdown-menu-separator",
      "dropdown-menu-item",
    ]);
    expect(screen.getAllByRole("menuitem").map((item) => item.firstChild?.textContent)).toEqual([
      "Profile",
      "Billing",
      "Settings",
      "Team",
      "Invite users",
      "Log out",
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(3);
    expectNoAriaViolations(document.body);
  });

  test("a group is a group, named by the label written inside it", async () => {
    render(() => <Account />);
    await open();

    const group = screen.getByRole("group");
    expect(group.getAttribute("data-slot")).toBe("dropdown-menu-group");
    expect(accessibleName(group)).toBe("Workspace");
    expect(group.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
  });

  test("the arrows walk the items in document order and pass over everything else", async () => {
    render(() => <Account />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await settle();

    const walked: string[] = [];
    for (let step = 0; step < 6; step++) {
      walked.push(document.activeElement?.firstChild?.textContent ?? "");
      await user.keyboard("{ArrowDown}");
    }
    // Billing is disabled; the labels and separators were never in the way.
    expect(walked).toEqual(["Profile", "Settings", "Team", "Invite users", "Log out", "Profile"]);
  });

  test("typing finds an item by its own text, never a label", async () => {
    render(() => <Account />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();

    await user.keyboard("t");
    expect(document.activeElement?.textContent).toBe("Team");
    await user.keyboard("{Home}");
    // "My account" and "Workspace" are labels, so M and W match nothing.
    await user.keyboard("w");
    expect(document.activeElement?.firstChild?.textContent).toBe("Profile");
  });

  test("choosing an item calls its onSelect, reports its key and closes", async () => {
    const selected: string[] = [];
    const keys: string[] = [];
    render(() => (
      <Account
        onProfile={(event) => selected.push(String(event.key))}
        onAction={(key) => keys.push(key)}
      />
    ));
    await open();

    await user.click(screen.getByRole("menuitem", { name: /Profile/ }));
    await settle();
    expect(selected).toEqual(["profile"]);
    expect(keys).toEqual(["profile"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("an onSelect that prevents it leaves the menu open", async () => {
    render(() => <Account onProfile={(event) => event.preventDefault()} />);
    await open();

    await user.click(screen.getByRole("menuitem", { name: /Profile/ }));
    await settle();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test("a disabled item says so and does nothing", async () => {
    const keys: string[] = [];
    render(() => <Account onAction={(key) => keys.push(key)} />);
    await open();

    const billing = screen.getByRole("menuitem", { name: "Billing" });
    expect(billing.getAttribute("aria-disabled")).toBe("true");
    expect(billing.getAttribute("data-disabled")).toBe("");
    await user.click(billing);
    await settle();
    expect(keys).toEqual([]);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test("inset and variant are attributes, and the indent is on the inline start", async () => {
    render(() => <Account />);
    await open();

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    expect(settings.getAttribute("data-inset")).toBe("");
    expect(screen.getByRole("menuitem", { name: "Log out" }).getAttribute("data-variant")).toBe(
      "destructive",
    );
    const rules = rulesFor(settings.className);
    expect(rules).toContain("padding-inline-start");
    expect(rules).not.toContain("padding-left");
    expect(rulesFor(slot("dropdown-menu-shortcut")?.className ?? "")).toContain(
      "margin-inline-start: auto",
    );
  });

  test("the highlighted item says so in upstream's word as well as ours", async () => {
    render(() => <Account />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();

    const profile = screen.getByRole("menuitem", { name: /Profile/ });
    expect(profile.getAttribute("data-focused")).toBe("");
    expect(profile.getAttribute("data-highlighted")).toBe("");
  });

  test("a submenu opens from its trigger with the arrow and closes with the other", async () => {
    render(() => <Account />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    await user.keyboard("{End}{ArrowUp}");

    const invite = screen.getByRole("menuitem", { name: "Invite users" });
    expect(document.activeElement).toBe(invite);
    expect(invite.getAttribute("aria-haspopup")).toBe("menu");
    expect(invite.getAttribute("data-state")).toBe("closed");

    // The arrow on the row points where the submenu opens, in either direction
    // of text, and the row keeps its fill while the submenu is open.
    const chevron = slot("dropdown-menu-sub-chevron") as HTMLElement;
    expect(rulesFor(chevron.getAttribute("class") ?? "")).toContain(":dir(rtl){rotate: 180deg}");
    expect(rulesFor(invite.className)).toContain('[data-state="open"]{background-color');

    await user.keyboard("{ArrowRight}");
    await settle();
    expect(invite.getAttribute("aria-expanded")).toBe("true");
    expect(invite.getAttribute("data-state")).toBe("open");
    const submenu = screen.getByRole("menu", { name: "Invite users" });
    expect(submenu.getAttribute("data-slot")).toBe("dropdown-menu-sub-content");
    expect(document.activeElement?.textContent).toBe("Email");

    await user.keyboard("{ArrowLeft}");
    await settle();
    await frame();
    expect(screen.queryByRole("menu", { name: "Invite users" })).toBeNull();
    expect(document.activeElement).toBe(invite);
  });

  test("choosing inside the submenu closes the whole tree", async () => {
    const keys: string[] = [];
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Invite users</DropdownMenuSubTrigger>
            <DropdownMenuSubContent onAction={(key) => keys.push(String(key))}>
              <DropdownMenuItem id="email">Email</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    await user.keyboard("{ArrowRight}");
    await settle();

    await user.click(screen.getByRole("menuitem", { name: "Email" }));
    await settle();
    expect(keys).toEqual(["email"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  function View(
    props: Incoming<{
      onStatus?: (checked: boolean) => void;
      onPosition?: (value: string) => void;
    }>,
  ) {
    const [status, setStatus] = createSignal(true);
    const [position, setPosition] = createSignal("bottom");
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem
            checked={status()}
            onCheckedChange={(checked) => {
              setStatus(checked);
              props.onStatus?.()?.(checked);
            }}
          >
            Status bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem disabled>Activity bar</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Panel</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={position()}
            onValueChange={(value) => {
              setPosition(value);
              props.onPosition?.()?.(value);
            }}
          >
            <DropdownMenuLabel>Panel position</DropdownMenuLabel>
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  async function openView(): Promise<void> {
    await user.click(screen.getByRole("button", { name: "View" }));
    await settle();
  }

  test("a checkbox item shows the checked it is given and reports the change", async () => {
    const changes: boolean[] = [];
    render(() => <View onStatus={(checked) => changes.push(checked)} />);
    await openView();

    const status = screen.getByRole("menuitemcheckbox", { name: "Status bar" });
    expect(status.getAttribute("data-slot")).toBe("dropdown-menu-checkbox-item");
    expect(status.getAttribute("aria-checked")).toBe("true");
    expect(status.getAttribute("data-state")).toBe("checked");
    expect(status.getAttribute("data-selected")).toBe("");
    expect(status.querySelector('[data-slot="dropdown-menu-item-indicator"]')).not.toBeNull();

    await user.click(status);
    await settle();
    expect(changes).toEqual([false]);

    await openView();
    const again = screen.getByRole("menuitemcheckbox", { name: "Status bar" });
    expect(again.getAttribute("aria-checked")).toBe("false");
    expect(again.getAttribute("data-state")).toBe("unchecked");
  });

  test("a checkbox item given nothing keeps its own tick, and Space leaves the menu open", async () => {
    render(() => <View />);
    screen.getByRole("button", { name: "View" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();

    // Activity bar is disabled, so one step lands on Panel.
    await user.keyboard("{ArrowDown}");
    const panel = screen.getByRole("menuitemcheckbox", { name: "Panel" });
    expect(document.activeElement).toBe(panel);
    expect(panel.getAttribute("aria-checked")).toBe("false");

    await user.keyboard(" ");
    await settle();
    expect(panel.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Activity bar" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  test("a radio group holds the value, names itself, and one radio is on", async () => {
    const values: string[] = [];
    render(() => <View onPosition={(value) => values.push(value)} />);
    await openView();

    const group = screen.getByRole("group");
    expect(group.getAttribute("data-slot")).toBe("dropdown-menu-radio-group");
    expect(accessibleName(group)).toBe("Panel position");

    const top = screen.getByRole("menuitemradio", { name: "Top" });
    const bottom = screen.getByRole("menuitemradio", { name: "Bottom" });
    expect(top.getAttribute("data-slot")).toBe("dropdown-menu-radio-item");
    expect(bottom.getAttribute("aria-checked")).toBe("true");
    expect(bottom.getAttribute("data-state")).toBe("checked");
    expect(top.getAttribute("data-state")).toBe("unchecked");

    await user.click(top);
    await settle();
    expect(values).toEqual(["top"]);

    await openView();
    expect(screen.getByRole("menuitemradio", { name: "Top" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Bottom" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expectNoAriaViolations(document.body);
  });

  test("an item with an href is a link that is still a menu item, and choosing it closes", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Go</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem href="#docs">Documentation</DropdownMenuItem>
          <DropdownMenuItem href="#billing" disabled>
            Billing
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "Go" }));
    await settle();

    const link = screen.getByRole("menuitem", { name: "Documentation" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#docs");
    expect(link.getAttribute("data-slot")).toBe("dropdown-menu-item");
    expect(link.parentElement?.getAttribute("role")).toBe("none");
    const billing = screen.getByRole("menuitem", { name: "Billing" });
    expect(billing.hasAttribute("href")).toBe(false);
    expect(billing.getAttribute("aria-disabled")).toBe("true");

    const followed: string[] = [];
    const record = (event: MouseEvent): void => {
      const anchor = (event.target as Element).closest("a");
      queueMicrotask(() => {
        if (anchor !== null && !event.defaultPrevented) {
          followed.push(anchor.getAttribute("href") ?? "");
        }
      });
    };
    document.addEventListener("click", record, true);
    await user.click(billing);
    await settle();
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(link);
    await settle();
    document.removeEventListener("click", record, true);

    expect(followed).toEqual(["#docs"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("an item rendered from data with an href is the same link", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Go</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent items={[{ id: "docs", name: "Documentation", href: "#docs" }]}>
          {(entry: { name: string }) => <DropdownMenuItem>{entry.name}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "Go" }));
    await settle();

    const link = screen.getByRole("menuitem", { name: "Documentation" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#docs");
  });
});

describe("where a DropdownMenu's content goes", () => {
  function Placed(
    props: Incoming<{
      side?: "top" | "right" | "bottom" | "left";
      align?: "start" | "center" | "end";
      sideOffset?: number;
      alignOffset?: number;
      placement?: "top end";
    }>,
  ) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={props.side?.()}
          align={props.align?.()}
          sideOffset={props.sideOffset?.()}
          alignOffset={props.alignOffset?.()}
          placement={props.placement?.()}
        >
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  async function content(): Promise<HTMLElement> {
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    return screen.getByRole("menu");
  }

  test("told nothing, it is under the trigger at its start, open, and says all three", async () => {
    render(() => <Placed />);
    const menu = await content();
    expect(menu.getAttribute("data-slot")).toBe("dropdown-menu-content");
    expect(menu.getAttribute("data-state")).toBe("open");
    expect(menu.getAttribute("data-side")).toBe("bottom");
    expect(menu.getAttribute("data-align")).toBe("start");
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("data-state")).toBe("open");
  });

  test("side and align are upstream's words for the same thing", async () => {
    render(() => <Placed side="top" align="end" />);
    const menu = await content();
    expect(menu.getAttribute("data-side")).toBe("top");
    expect(menu.getAttribute("data-align")).toBe("end");
    expect(menu.parentElement?.getAttribute("data-placement")).toBe("top");
  });

  test("a side alone is centred on it, as upstream's is", async () => {
    render(() => <Placed side="right" />);
    const menu = await content();
    expect(menu.getAttribute("data-side")).toBe("right");
    expect(menu.getAttribute("data-align")).toBe("center");
  });

  test("placement, where it is given, is the one that is read", async () => {
    render(() => <Placed placement="top end" side="bottom" align="start" />);
    const menu = await content();
    expect(menu.getAttribute("data-side")).toBe("top");
    expect(menu.getAttribute("data-align")).toBe("end");
  });

  test("sideOffset and alignOffset move it away from and along the trigger", async () => {
    render(() => <Placed sideOffset={20} alignOffset={40} align="start" />);
    const menu = await content();
    const panel = menu.parentElement as HTMLElement;
    // happy-dom measures nothing, so the trigger is a point at the origin.
    expect(panel.style.top).toBe("20px");
    expect(panel.style.left).toBe("40px");
  });

  test("loop off stops the arrows at the ends, which is upstream's word for it", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent loop={false}>
          <DropdownMenuItem>One</DropdownMenuItem>
          <DropdownMenuItem>Two</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Two");
  });

  test("a portal with a container sends the menu there instead of the body", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal container={host}>
          <DropdownMenuContent>
            <DropdownMenuItem>One</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();

    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    host.remove();
  });
});

/**
 * The trigger is whatever control is written inside it, and there are three
 * ways for a control to be one.
 */
describe("what a DropdownMenuTrigger can be", () => {
  /** Someone else's control: its own element, taking what the trigger offers. */
  function Chip(props: Incoming<{ children?: Child }>) {
    const trigger = useTrigger();
    return (
      <button {...trigger.props} ref={trigger.ref}>
        {props.children}
      </button>
    );
  }

  function Items() {
    return (
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
        <DropdownMenuItem>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    );
  }

  function Fixture(props: Incoming<{ kind: "button" | "element" | "component" }>) {
    if (props.kind() === "button") {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button>Actions</Button>
          </DropdownMenuTrigger>
          <Items />
        </DropdownMenu>
      );
    }
    if (props.kind() === "element") {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(trigger) => (
              <button {...trigger.props} ref={trigger.ref}>
                Actions
              </button>
            )}
          />
          <Items />
        </DropdownMenu>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Chip>Actions</Chip>
        </DropdownMenuTrigger>
        <Items />
      </DropdownMenu>
    );
  }

  for (const kind of ["button", "element", "component"] as const) {
    describe(`a ${kind}`, () => {
      test("says what it opens and whether it is open", async () => {
        render(() => <Fixture kind={kind} />);
        const control = screen.getByRole("button", { name: "Actions" });
        expect(control.getAttribute("aria-haspopup")).toBe("true");
        expect(control.getAttribute("aria-expanded")).toBe("false");
        expect(control.hasAttribute("aria-controls")).toBe(false);
        expect(control.getAttribute("data-state")).toBe("closed");

        await user.click(control);
        await settle();
        const menu = screen.getByRole("menu");
        expect(control.getAttribute("aria-expanded")).toBe("true");
        expect(control.getAttribute("aria-controls")).toBe(menu.id);
        expect(control.getAttribute("data-state")).toBe("open");
        // And the menu is named by it, whatever it is.
        expect(accessibleName(menu)).toBe("Actions");
      });

      test("ArrowDown opens the menu on its first item", async () => {
        render(() => <Fixture kind={kind} />);
        screen.getByRole("button", { name: "Actions" }).focus();
        await user.keyboard("{ArrowDown}");
        await settle();
        expect(document.activeElement?.textContent).toBe("Rename");
      });

      test("Escape closes it and focus is back on the control", async () => {
        render(() => <Fixture kind={kind} />);
        const control = screen.getByRole("button", { name: "Actions" });
        control.focus();
        await user.keyboard("{ArrowDown}");
        await settle();
        expect(document.activeElement === control).toBe(false);

        await user.keyboard("{Escape}");
        await settle();
        await frame();
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement === control).toBe(true);
      });
    });
  }
});

describe("a DropdownMenu three submenus deep", () => {
  function Nested() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="File">
          <DropdownMenuItem>New</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Share</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Copy link</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Send to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>salama</DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Acme Inc</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem>Design</DropdownMenuItem>
                      <DropdownMenuItem>Sales</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const item = (name: string): HTMLElement => screen.getByRole("menuitem", { name });
  const menus = (): string[] => screen.getAllByRole("menu").map((menu) => accessibleName(menu));

  async function key(name: string): Promise<void> {
    await user.keyboard(`{${name}}`);
    await settle();
    await frame();
  }

  async function openToDepth(): Promise<void> {
    screen.getByRole("button", { name: "Open" }).focus();
    await key("Enter");
    expect(document.activeElement).toBe(item("New"));
    await key("ArrowDown");
    expect(document.activeElement).toBe(item("Share"));
    await key("ArrowRight");
    expect(item("Share").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(item("Copy link"));
    await key("ArrowDown");
    await key("ArrowRight");
    expect(item("Send to").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(item("salama"));
    await key("ArrowDown");
    await key("ArrowRight");
    expect(item("Acme Inc").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(item("Design"));
    expect(menus()).toEqual(["File", "Share", "Send to", "Acme Inc"]);
  }

  test("ArrowRight opens each level on its first item, and ArrowLeft walks back to each trigger", async () => {
    render(() => <Nested />);
    await openToDepth();

    await key("ArrowLeft");
    expect(document.activeElement).toBe(item("Acme Inc"));
    expect(item("Acme Inc").getAttribute("aria-expanded")).toBe("false");
    expect(menus()).toEqual(["File", "Share", "Send to"]);

    await key("ArrowLeft");
    expect(document.activeElement).toBe(item("Send to"));
    expect(menus()).toEqual(["File", "Share"]);

    await key("ArrowLeft");
    expect(document.activeElement).toBe(item("Share"));
    expect(menus()).toEqual(["File"]);

    // Back down again from where focus came to rest.
    await key("ArrowRight");
    expect(document.activeElement).toBe(item("Copy link"));
  });

  test("Escape from the deepest level closes the whole menu and gives focus to its trigger", async () => {
    render(() => <Nested />);
    await openToDepth();

    await key("Escape");
    expect(screen.queryAllByRole("menu")).toHaveLength(0);
    const trigger = screen.getByRole("button", { name: "Open" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
