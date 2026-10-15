import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import { provideDirection } from "@barqjs/aria/i18n";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "./menubar.tsx";

/** A menu is portalled, so it is built a microtask after whatever opened it. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/** Giving focus back to a trigger is deferred to a frame. */
async function frame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  flush();
}

/** shadcn's own demo, with the triggers given the pattern's role. */
function Application(
  props: Incoming<{
    value?: string;
    onValueChange?: (value: string) => void;
    loop?: boolean;
    onNewTab?: () => void;
    onProfile?: (value: string) => void;
  }>,
) {
  const [profile, setProfile] = createSignal("salama");
  return (
    <Menubar
      aria-label="Application"
      value={props.value?.()}
      onValueChange={props.onValueChange?.()}
      loop={props.loop?.()}
    >
      <MenubarMenu value="file">
        <MenubarTrigger role="menuitem">File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => props.onNewTab?.()?.()}>
            New tab <MenubarShortcut>⌘T</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled>New incognito window</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Share</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>Email link</MenubarItem>
              <MenubarItem>Messages</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem variant="destructive">Quit</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="view">
        <MenubarTrigger role="menuitem">View</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem>Always show bookmarks bar</MenubarCheckboxItem>
          <MenubarCheckboxItem checked>Always show full URLs</MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarGroup>
            <MenubarLabel inset>Page</MenubarLabel>
            <MenubarItem inset>Reload</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="profiles">
        <MenubarTrigger role="menuitem">Profiles</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup
            aria-label="Profile"
            value={profile()}
            onValueChange={(value) => {
              setProfile(value);
              props.onProfile?.()?.(value);
            }}
          >
            <MenubarRadioItem value="salama">Salama</MenubarRadioItem>
            <MenubarRadioItem value="acme">Acme Inc</MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarItem inset>Add profile</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}

function trigger(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[data-slot="menubar-trigger"]')].find(
    (each) => each.textContent === name,
  );
  if (found === undefined) throw new Error(`no trigger called ${name}`);
  return found;
}

function focused(): string | null | undefined {
  return document.activeElement?.textContent;
}

async function openWith(name: string, key = "{ArrowDown}"): Promise<void> {
  trigger(name).focus();
  await user.keyboard(key);
  await settle();
}

describe("Menubar", () => {
  test("is one named menubar, and each trigger says what it opens", () => {
    render(() => <Application />);

    const bar = screen.getByRole("menubar");
    expect(accessibleName(bar)).toBe("Application");
    expect(bar.getAttribute("data-slot")).toBe("menubar");
    expect(bar.getAttribute("data-orientation")).toBe("horizontal");

    const file = trigger("File");
    expect(file.tagName).toBe("BUTTON");
    expect(file.getAttribute("role")).toBe("menuitem");
    expect(file.getAttribute("aria-haspopup")).toBe("true");
    expect(file.getAttribute("aria-expanded")).toBe("false");
    expect(file.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByRole("menu")).toBeNull();
    expectNoAriaViolations(document.body);
  });

  test("a trigger left without a role is a menuitem that opens a menu, inside a menubar", () => {
    render(() => (
      <Menubar aria-label="Application">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New tab</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ));

    const file = screen.getByRole("menuitem", { name: "File" });
    expect(file.tagName).toBe("BUTTON");
    expect(file.getAttribute("aria-haspopup")).toBe("true");
    expect(file.closest('[role="menubar"]')).toBe(screen.getByRole("menubar"));
    expect(screen.queryByRole("button", { name: "File" })).toBeNull();
    expectNoAriaViolations(document.body);
  });

  test("a trigger given the button role keeps it, and is still the trigger", () => {
    render(() => (
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger role="button">File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New tab</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ));

    const file = screen.getByRole("button", { name: "File" });
    expect(file.getAttribute("data-slot")).toBe("menubar-trigger");
    expect(file.getAttribute("aria-haspopup")).toBe("true");
  });

  test("the bar is one Tab stop, and the stop follows focus", async () => {
    render(() => <Application />);
    const stops = (): string[] =>
      [...document.querySelectorAll('[data-slot="menubar-trigger"]')]
        .filter((each) => each.getAttribute("tabindex") === "0")
        .map((each) => each.textContent ?? "");

    expect(stops()).toEqual(["File"]);
    trigger("File").focus();
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("View");
    expect(stops()).toEqual(["View"]);
    expect(trigger("View").getAttribute("data-highlighted")).toBe("");
  });

  test("the arrows, Home and End move between the triggers and go round", async () => {
    render(() => <Application />);

    trigger("File").focus();
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe("Profiles");
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("File");
    await user.keyboard("{End}");
    expect(focused()).toBe("Profiles");
    await user.keyboard("{Home}");
    expect(focused()).toBe("File");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("with loop off the last trigger is the end", async () => {
    render(() => <Application loop={false} />);

    trigger("Profiles").focus();
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("Profiles");
  });

  test("typing a letter moves to the trigger that starts with it", async () => {
    render(() => <Application />);

    trigger("File").focus();
    await user.keyboard("p");
    expect(focused()).toBe("Profiles");
  });

  test("ArrowDown, Enter and Space open on the first item; ArrowUp on the last", async () => {
    render(() => <Application />);

    await openWith("File");
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("data-slot")).toBe("menubar-content");
    expect(menu.getAttribute("data-state")).toBe("open");
    expect(menu.getAttribute("data-side")).toBe("bottom");
    expect(menu.getAttribute("data-align")).toBe("start");
    expect(accessibleName(menu)).toBe("File");
    expect(document.activeElement?.firstChild?.textContent).toBe("New tab ");
    expect(trigger("File").getAttribute("data-state")).toBe("open");

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await openWith("File", "{ArrowUp}");
    expect(focused()).toBe("Quit");

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await openWith("File", "{Enter}");
    expect(document.activeElement?.firstChild?.textContent).toBe("New tab ");
  });

  test("ArrowRight and ArrowLeft inside a menu carry the open menu to its neighbour", async () => {
    render(() => <Application />);

    await openWith("File");
    await user.keyboard("{ArrowRight}");
    await settle();

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("View");
    expect(focused()).toBe("Always show bookmarks bar");
    expect(trigger("File").getAttribute("aria-expanded")).toBe("false");
    expect(trigger("View").getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(accessibleName(screen.getByRole("menu"))).toBe("File");
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(accessibleName(screen.getByRole("menu"))).toBe("Profiles");
    expect(focused()).toBe("Salama");
  });

  test("an item with a submenu keeps the arrow that opens it, and the submenu the one that closes it", async () => {
    render(() => <Application />);

    await openWith("File");
    // New incognito window is disabled, so one step reaches Share.
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Share");
    await user.keyboard("{ArrowRight}");
    await settle();

    const submenu = screen.getByRole("menu", { name: "Share" });
    expect(submenu.getAttribute("data-slot")).toBe("menubar-sub-content");
    expect(trigger("File").getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("Email link");

    await user.keyboard("{ArrowLeft}");
    await settle();
    await frame();
    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(focused()).toBe("Share");

    await user.keyboard("{ArrowRight}");
    await settle();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("View");
  });

  test("pointing at another trigger switches menus only while one is open", async () => {
    render(() => <Application />);

    user.hover(trigger("View"));
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger("File"));
    await settle();
    user.hover(trigger("View"));
    await settle();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("View");
  });

  test("Escape closes the menu and focus is back on its trigger, also after a switch", async () => {
    render(() => <Application />);

    await openWith("File");
    await user.keyboard("{ArrowRight}");
    await settle();
    await frame();
    await user.keyboard("{Escape}");
    await settle();
    await frame();

    expect(screen.queryByRole("menu")).toBeNull();
    expect(focused()).toBe("View");
  });

  test("choosing an item runs its onSelect and closes the bar", async () => {
    let opened = 0;
    render(() => <Application onNewTab={() => opened++} />);

    await user.click(trigger("File"));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: /New tab/ }));
    await settle();

    expect(opened).toBe(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger("File").getAttribute("data-state")).toBe("closed");
  });

  test("checkbox and radio items hold their state and keep their ticks at the start", async () => {
    const profiles: string[] = [];
    render(() => <Application onProfile={(value) => profiles.push(value)} />);

    await user.click(trigger("View"));
    await settle();
    const urls = screen.getByRole("menuitemcheckbox", { name: "Always show full URLs" });
    expect(urls.getAttribute("data-slot")).toBe("menubar-checkbox-item");
    expect(urls.getAttribute("aria-checked")).toBe("true");
    expect(urls.getAttribute("data-state")).toBe("checked");
    const mark = urls.querySelector('[data-slot="menubar-checkbox-item-indicator"]') as HTMLElement;
    expect(rulesFor(mark.className)).toContain("inset-inline-start");
    expect(rulesFor(urls.className)).toContain("padding-inline-start");

    const group = screen.getByRole("group");
    expect(group.getAttribute("data-slot")).toBe("menubar-group");
    expect(accessibleName(group)).toBe("Page");
    expect(document.querySelector('[data-slot="menubar-label"]')?.getAttribute("data-inset")).toBe(
      "",
    );

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await user.click(trigger("Profiles"));
    await settle();
    expect(screen.getByRole("group").getAttribute("data-slot")).toBe("menubar-radio-group");
    const acme = screen.getByRole("menuitemradio", { name: "Acme Inc" });
    expect(acme.getAttribute("data-slot")).toBe("menubar-radio-item");
    expect(acme.getAttribute("data-state")).toBe("unchecked");
    await user.click(acme);
    await settle();
    expect(profiles).toEqual(["acme"]);
  });

  test("the bar's value is the open menu and can be held from outside", async () => {
    const changes: string[] = [];
    const [value, setValue] = createSignal("");
    render(() => (
      <Application
        value={value()}
        onValueChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    ));

    await openWith("View");
    expect(changes).toEqual(["view"]);

    setValue("profiles");
    await settle();
    expect(accessibleName(screen.getByRole("menu"))).toBe("Profiles");
  });

  function PerMenu(
    props: Incoming<{
      defaultOpen?: boolean;
      isOpen?: boolean;
      onOpenChange?: (isOpen: boolean) => void;
    }>,
  ) {
    return (
      <Menubar aria-label="Application">
        <MenubarMenu
          defaultOpen={props.defaultOpen?.()}
          isOpen={props.isOpen?.()}
          onOpenChange={props.onOpenChange?.()}
        >
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New tab</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Undo</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    );
  }

  test("one menu can still start open and report its own opening and closing", async () => {
    const changes: boolean[] = [];
    render(() => <PerMenu defaultOpen onOpenChange={(isOpen) => changes.push(isOpen)} />);
    await settle();

    const file = screen.getByRole("menuitem", { name: "File" });
    expect(file.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "New tab" })).toBeTruthy();

    await user.keyboard("{ArrowRight}");
    await settle();
    expect(file.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("menuitem", { name: "Edit" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(changes).toEqual([false]);

    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(changes).toEqual([false, true]);
  });

  test("one menu can be held open or shut from outside", async () => {
    const [open, setOpen] = createSignal(false);
    const asked: boolean[] = [];
    render(() => <PerMenu isOpen={open()} onOpenChange={(isOpen) => asked.push(isOpen)} />);
    await settle();

    const file = screen.getByRole("menuitem", { name: "File" });
    await user.click(file);
    await settle();
    expect(asked).toEqual([true]);
    expect(file.getAttribute("aria-expanded")).toBe("false");

    setOpen(true);
    await settle();
    expect(file.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "New tab" })).toBeTruthy();
  });

  test("in a right-to-left page the horizontal arrows are the other way round", async () => {
    function Mirrored(props: Incoming<{ children?: Child }>) {
      const directionProps = provideDirection("rtl");
      return <div {...directionProps}>{props.children}</div>;
    }
    render(() => (
      <Mirrored>
        <Application />
      </Mirrored>
    ));

    trigger("File").focus();
    await user.keyboard("{ArrowLeft}");
    expect(focused()).toBe("View");

    await user.keyboard("{ArrowDown}");
    await settle();
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(accessibleName(screen.getByRole("menu"))).toBe("Profiles");
  });

  test("a trigger can be another element, which then carries everything the button did", async () => {
    render(() => (
      <Menubar aria-label="Application">
        <MenubarMenu>
          <MenubarTrigger
            role="menuitem"
            render={(control) => (
              <a {...control.props} ref={control.ref}>
                File
              </a>
            )}
          />
          <MenubarPortal>
            <MenubarContent>
              <MenubarItem>New tab</MenubarItem>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
      </Menubar>
    ));

    const file = trigger("File");
    expect(file.tagName).toBe("A");
    expect(file.getAttribute("role")).toBe("menuitem");
    expect(file.getAttribute("tabindex")).toBe("0");
    file.focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(file.getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("New tab");
  });

  test("an open bar passes the aria rules", async () => {
    render(() => <Application />);
    await openWith("Profiles");
    expectNoAriaViolations(document.body);
  });
});
