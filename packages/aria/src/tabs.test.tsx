import { describe, expect, test } from "bun:test";
import {
  createContext,
  flush,
  getContext,
  provide,
  createSignal,
  type ParentProps,
} from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { provideDirection } from "./i18n.ts";
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
  ValueTab,
  ValueTabList,
  ValueTabPanel,
  ValueTabs,
} from "./tabs.tsx";
import { SelectionIndicator } from "./selection-indicator.tsx";

interface Section {
  id: string;
  name: string;
  body: string;
  isDisabled?: boolean;
}

const SECTIONS: Section[] = [
  { id: "founding", name: "Founding", body: "How it began" },
  { id: "today", name: "Today", body: "Where it is" },
  { id: "later", name: "Later", body: "Not yet", isDisabled: true },
  { id: "notes", name: "Notes", body: "Odds and ends" },
];

interface SectionsProps {
  keyboardActivation?: "automatic" | "manual";
  orientation?: "horizontal" | "vertical";
  defaultSelectedKey?: Key;
  onSelectionChange?: (key: Key) => void;
}

function Sections(props: SectionsProps) {
  return (
    <Tabs
      items={SECTIONS}
      keyboardActivation={props.keyboardActivation}
      orientation={props.orientation}
      defaultSelectedKey={props.defaultSelectedKey}
      onSelectionChange={props.onSelectionChange}
    >
      <TabList aria-label="History">{(section: Section) => <Tab>{section.name}</Tab>}</TabList>
      <TabPanel>{(section: Section) => <p>{section.body}</p>}</TabPanel>
    </Tabs>
  );
}

/**
 * A panel is a SCOPE, and what proves it is a component that needs one.
 *
 * `<TabPanel>` named its `<Show keyed>` callback parameter `scope` and forwarded
 * it. A keyed `Show` calls its slot with (scope, VALUE) and the compiler
 * supplies the scope parameter itself, so a callback declaring one parameter
 * binds it to the value — the selected KEY. `renderPanel` was therefore handed
 * the string `"overview"` as its scope, and every component in a panel that
 * provides context died inside `enter()` on
 * `Cannot create property 'kids' on string`.
 *
 * Nothing caught it because a panel of PROSE needs no scope: the whole suite
 * rendered `<p>{section.body}</p>` and passed. It takes a provider to see.
 */
describe("a panel is a scope", () => {
  const Ctx = createContext<string | null>(null);

  function Provider(props: ParentProps) {
    return provide(
      Ctx,
      () => "provided",
      () => props.children,
    ) as never;
  }

  function Reader() {
    return <span data-testid="read">{getContext(Ctx) ?? "missing"}</span>;
  }

  test("a component that provides context survives inside a panel", () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabList aria-label="History">{(section: Section) => <Tab>{section.name}</Tab>}</TabList>
        <TabPanel>
          {(section: Section) => (
            <Provider>
              <Reader />
              <i>{section.name}</i>
            </Provider>
          )}
        </TabPanel>
      </Tabs>
    ));
    expect(screen.getByTestId("read").textContent).toBe("provided");
  });
});

describe("Tabs", () => {
  test("is a named tablist of tabs with one panel", () => {
    render(() => <Sections />);

    expect(accessibleName(screen.getByRole("tablist"))).toBe("History");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  test("the first tab is selected when nothing says otherwise", () => {
    render(() => <Sections />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel").textContent).toBe("How it began");
  });

  test("the tab and its panel point at each other", () => {
    render(() => <Sections />);

    const selected = screen.getAllByRole("tab")[0] as HTMLElement;
    const panel = screen.getByRole("tabpanel");

    expect(selected.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
  });

  test("an unselected tab controls nothing", () => {
    render(() => <Sections />);
    expect(screen.getAllByRole("tab")[1]?.hasAttribute("aria-controls")).toBe(false);
  });

  test("clicking a tab shows its panel", () => {
    const chosen: Key[] = [];
    render(() => <Sections onSelectionChange={(key) => chosen.push(key)} />);

    user.click(screen.getByRole("tab", { name: "Today" }));
    flush();

    expect(chosen).toEqual(["today"]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Where it is");
  });

  test("a disabled tab cannot be chosen", () => {
    const chosen: Key[] = [];
    render(() => <Sections onSelectionChange={(key) => chosen.push(key)} />);

    const later = screen.getByRole("tab", { name: "Later" });
    expect(later.getAttribute("aria-disabled")).toBe("true");

    user.click(later);
    flush();
    expect(chosen).toEqual([]);
  });

  test("the tab list is ONE Tab stop, on the selected tab", () => {
    render(() => <Sections defaultSelectedKey="today" />);

    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist").hasAttribute("tabindex")).toBe(false);
    expect(tabs[1]?.getAttribute("tabindex")).toBe("0");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("-1");
  });

  test("the arrows move and select, skipping disabled tabs", () => {
    const chosen: Key[] = [];
    render(() => <Sections onSelectionChange={(key) => chosen.push(key)} />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);

    // "Later" is disabled, so Right lands on "Notes".
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[3] as HTMLElement);

    expect(chosen).toEqual(["today", "notes"]);
  });

  test("the arrows wrap round the ends", () => {
    render(() => <Sections />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();

    expect(document.activeElement).toBe(tabs[3] as HTMLElement);
  });

  test("manual activation moves focus without selecting", () => {
    const chosen: Key[] = [];
    render(() => (
      <Sections keyboardActivation="manual" onSelectionChange={(key) => chosen.push(key)} />
    ));

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();

    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
    expect(chosen).toEqual([]);
    expect(screen.getByRole("tabpanel").textContent).toBe("How it began");

    user.key("Enter");
    flush();
    expect(chosen).toEqual(["today"]);
  });

  test("a vertical list uses the vertical arrows and says so", () => {
    render(() => <Sections orientation="vertical" />);

    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("a panel of prose is a Tab stop", () => {
    render(() => <Sections />);
    expect(screen.getByRole("tabpanel").getAttribute("tabindex")).toBe("0");
  });

  test("a panel with something focusable inside is not", () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabList aria-label="History">{(s: Section) => <Tab>{s.name}</Tab>}</TabList>
        <TabPanel>{(s: Section) => <button type="button">{s.name}</button>}</TabPanel>
      </Tabs>
    ));
    flush();

    expect(screen.getByRole("tabpanel").hasAttribute("tabindex")).toBe(false);
  });

  test("the tabs are data, so changing them updates the list", () => {
    const [items, setItems] = createSignal<Section[]>([{ id: "a", name: "One", body: "1" }]);
    render(() => (
      <Tabs items={items()}>
        <TabList aria-label="History">{(s: Section) => <Tab>{s.name}</Tab>}</TabList>
        <TabPanel>{(s: Section) => <p>{s.body}</p>}</TabPanel>
      </Tabs>
    ));

    expect(screen.getAllByRole("tab")).toHaveLength(1);

    setItems([
      { id: "a", name: "One", body: "1" },
      { id: "b", name: "Two", body: "2" },
    ]);
    flush();

    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  test("removing the selected tab selects another", () => {
    const [items, setItems] = createSignal<Section[]>([
      { id: "a", name: "One", body: "1" },
      { id: "b", name: "Two", body: "2" },
    ]);
    render(() => (
      <Tabs items={items()} defaultSelectedKey="b">
        <TabList aria-label="History">{(s: Section) => <Tab>{s.name}</Tab>}</TabList>
        <TabPanel>{(s: Section) => <p>{s.body}</p>}</TabPanel>
      </Tabs>
    ));
    flush();
    expect(screen.getByRole("tabpanel").textContent).toBe("2");

    setItems([{ id: "a", name: "One", body: "1" }]);
    flush();

    expect(screen.getByRole("tabpanel").textContent).toBe("1");
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")).toBe("true");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Sections />);
    expectNoAriaViolations(container);
  });
});

interface SettingsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  activationMode?: "automatic" | "manual";
  dir?: "ltr" | "rtl";
  forceMount?: boolean;
}

function Settings(props: SettingsProps) {
  return (
    <ValueTabs
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={props.onValueChange}
      orientation={props.orientation}
      activationMode={props.activationMode}
      dir={props.dir}
    >
      <ValueTabList aria-label="Settings">
        <ValueTab value="account">Account</ValueTab>
        <ValueTab value="password">Password</ValueTab>
        <ValueTab value="billing" isDisabled>
          Billing
        </ValueTab>
        <ValueTab value="team">Team</ValueTab>
      </ValueTabList>
      <ValueTabPanel value="account" forceMount={props.forceMount}>
        Name and email
      </ValueTabPanel>
      <ValueTabPanel value="password" forceMount={props.forceMount}>
        Change it here
      </ValueTabPanel>
      <ValueTabPanel value="billing" forceMount={props.forceMount}>
        Invoices
      </ValueTabPanel>
      <ValueTabPanel value="team" forceMount={props.forceMount}>
        Members
      </ValueTabPanel>
    </ValueTabs>
  );
}

describe("tabs that name themselves", () => {
  test("is a named tablist of tabs, with the chosen value's panel", () => {
    render(() => <Settings defaultValue="password" />);

    expect(accessibleName(screen.getByRole("tablist"))).toBe("Settings");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel").textContent).toBe("Change it here");
    expect(screen.getByRole("tab", { name: "Password" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  test("with nothing chosen the first enabled tab is, and nobody is told", () => {
    const chosen: string[] = [];
    render(() => <Settings onValueChange={(value) => chosen.push(value)} />);

    expect(screen.getByRole("tab", { name: "Account" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Name and email");
    expect(chosen).toEqual([]);
  });

  test("the tab and its panel point at each other", () => {
    render(() => <Settings defaultValue="account" />);

    const selected = screen.getByRole("tab", { name: "Account" });
    const panel = screen.getByRole("tabpanel");
    expect(selected.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
    expect(screen.getByRole("tab", { name: "Password" }).hasAttribute("aria-controls")).toBe(false);
  });

  test("clicking a tab shows its panel and reports the value", () => {
    const chosen: string[] = [];
    render(() => <Settings defaultValue="account" onValueChange={(value) => chosen.push(value)} />);

    user.click(screen.getByRole("tab", { name: "Team" }));
    flush();

    expect(chosen).toEqual(["team"]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Members");
  });

  test("each part states its state and its orientation", () => {
    render(() => <Settings defaultValue="account" />);

    const account = screen.getByRole("tab", { name: "Account" });
    const password = screen.getByRole("tab", { name: "Password" });
    expect(account.getAttribute("data-state")).toBe("active");
    expect(account.hasAttribute("data-selected")).toBe(true);
    expect(password.getAttribute("data-state")).toBe("inactive");
    expect(password.hasAttribute("data-selected")).toBe(false);
    expect(account.getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.getByRole("tablist").getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.getByRole("tabpanel").getAttribute("data-state")).toBe("active");
    expect(screen.getByRole("tabpanel").getAttribute("data-orientation")).toBe("horizontal");
  });

  test("a disabled tab says so and cannot be chosen", () => {
    const chosen: string[] = [];
    render(() => <Settings defaultValue="account" onValueChange={(value) => chosen.push(value)} />);

    const billing = screen.getByRole("tab", { name: "Billing" });
    expect(billing.getAttribute("aria-disabled")).toBe("true");
    expect(billing.hasAttribute("data-disabled")).toBe(true);

    user.click(billing);
    flush();
    expect(chosen).toEqual([]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Name and email");
  });

  test("the tab list is one Tab stop, on the selected tab", () => {
    render(() => <Settings defaultValue="password" />);

    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist").hasAttribute("tabindex")).toBe(false);
    expect(tabs[1]?.getAttribute("tabindex")).toBe("0");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("-1");
    expect(tabs[3]?.getAttribute("tabindex")).toBe("-1");
  });

  test("the arrows move and select, skipping the disabled tab and wrapping", () => {
    const chosen: string[] = [];
    render(() => <Settings defaultValue="account" onValueChange={(value) => chosen.push(value)} />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[3] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[0] as HTMLElement);

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(tabs[3] as HTMLElement);

    expect(chosen).toEqual(["password", "team", "account", "team"]);
  });

  test("Home and End go to the ends", () => {
    render(() => <Settings defaultValue="password" />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[1] as HTMLElement);
    user.keyDown("End");
    flush();
    expect(document.activeElement).toBe(tabs[3] as HTMLElement);

    user.keyDown("Home");
    flush();
    expect(document.activeElement).toBe(tabs[0] as HTMLElement);
    expect(screen.getByRole("tabpanel").textContent).toBe("Name and email");
  });

  test("the arrows across the list mean nothing to it and are left alone", () => {
    render(() => <Settings defaultValue="account" />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    const unhandled = user.keyDown("ArrowDown");
    flush();
    expect(unhandled).toBe(true);
    expect(document.activeElement).toBe(tabs[0] as HTMLElement);
  });

  test("manual activation moves focus and waits for Enter", () => {
    const chosen: string[] = [];
    render(() => (
      <Settings
        defaultValue="account"
        activationMode="manual"
        onValueChange={(value) => chosen.push(value)}
      />
    ));

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
    expect(chosen).toEqual([]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Name and email");

    user.key("Enter");
    flush();
    expect(chosen).toEqual(["password"]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Change it here");
  });

  test("a vertical list uses the vertical arrows and says so", () => {
    render(() => <Settings defaultValue="account" orientation="vertical" />);

    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("right to left, Left is the next tab", () => {
    render(() => <Settings defaultValue="account" dir="rtl" />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[0] as HTMLElement);
  });

  test("a direction declared above is the one it follows", () => {
    function Mirrored(props: ParentProps) {
      const directionProps = provideDirection("rtl");
      return <div {...directionProps}>{props.children}</div>;
    }
    render(() => (
      <Mirrored>
        <Settings defaultValue="account" />
      </Mirrored>
    ));

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("a controlled value moves only when the caller moves it", () => {
    const chosen: string[] = [];
    const [value, setValue] = createSignal("account");
    render(() => <Settings value={value()} onValueChange={(next) => chosen.push(next)} />);

    user.click(screen.getByRole("tab", { name: "Team" }));
    flush();
    expect(chosen).toEqual(["team"]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Name and email");

    setValue("team");
    flush();
    expect(screen.getByRole("tabpanel").textContent).toBe("Members");
    expect(screen.getByRole("tab", { name: "Team" }).getAttribute("tabindex")).toBe("0");
  });

  test("a panel kept mounted is hidden rather than absent", () => {
    render(() => <Settings defaultValue="account" forceMount />);

    const panels = [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels).toHaveLength(4);
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[1]?.hidden).toBe(true);
    expect(panels[1]?.getAttribute("data-state")).toBe("inactive");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  test("a panel of prose is a Tab stop, and one holding a control is not", () => {
    render(() => (
      <ValueTabs defaultValue="prose">
        <ValueTabList aria-label="Kinds">
          <ValueTab value="prose">Prose</ValueTab>
          <ValueTab value="form">Form</ValueTab>
        </ValueTabList>
        <ValueTabPanel value="prose">Words</ValueTabPanel>
        <ValueTabPanel value="form">
          <button type="button">Save</button>
        </ValueTabPanel>
      </ValueTabs>
    ));
    flush();
    expect(screen.getByRole("tabpanel").getAttribute("tabindex")).toBe("0");

    user.click(screen.getByRole("tab", { name: "Form" }));
    flush();
    expect(screen.getByRole("tabpanel").hasAttribute("tabindex")).toBe(false);
  });

  test("a value with a space in it still makes one id", () => {
    render(() => (
      <ValueTabs defaultValue="my account">
        <ValueTabList aria-label="Kinds">
          <ValueTab value="my account">Account</ValueTab>
        </ValueTabList>
        <ValueTabPanel value="my account">Words</ValueTabPanel>
      </ValueTabs>
    ));
    const tab = screen.getByRole("tab");
    expect(tab.id).not.toContain(" ");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tab.id);
    expect(accessibleName(screen.getByRole("tabpanel"))).toBe("Account");
  });

  test("a tab outside its tabs says what is wrong", () => {
    expect(() => render(() => <ValueTab value="loose">Loose</ValueTab>)).toThrow(
      "inside a ValueTabs",
    );
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Settings defaultValue="account" />);
    expectNoAriaViolations(container);
  });
});

interface AnchorVisit {
  href: string | null;
  prevented: boolean;
}

interface Named {
  name: string;
}

describe("tabs that are links", () => {
  const PAGES = [
    { id: "home", name: "Home", href: "/home" },
    { id: "about", name: "About", href: "/about" },
  ];

  test("a tab with an href is an anchor and is followed", () => {
    const seen: AnchorVisit[] = [];
    function listener(event: Event): void {
      if (event.target instanceof HTMLAnchorElement) {
        seen.push({ href: event.target.getAttribute("href"), prevented: event.defaultPrevented });
      }
    }
    document.addEventListener("click", listener);
    try {
      render(() => (
        <Tabs items={PAGES}>
          <TabList aria-label="Site">{(page: Named) => <Tab>{page.name}</Tab>}</TabList>
          <TabPanel>{(page: Named) => <p>{page.name}</p>}</TabPanel>
        </Tabs>
      ));

      const about = screen.getByRole("tab", { name: "About" });
      expect(about.tagName).toBe("A");
      expect(about.getAttribute("href")).toBe("/about");

      user.click(about);
      flush();
      expect(seen.at(-1)).toEqual({ href: "/about", prevented: false });
    } finally {
      document.removeEventListener("click", listener);
    }
  });
});

describe("panels", () => {
  test("shouldForceMount keeps every panel, hidden and inert but the selected one", () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabList aria-label="History">{(section: Section) => <Tab>{section.name}</Tab>}</TabList>
        <TabPanel shouldForceMount>{(section: Section) => <p>{section.body}</p>}</TabPanel>
      </Tabs>
    ));

    const all = document.querySelectorAll('[role="tabpanel"]');
    expect(all).toHaveLength(SECTIONS.length);
    const hidden = [...all].filter((panel) => panel.hasAttribute("hidden"));
    expect(hidden).toHaveLength(SECTIONS.length - 1);
    expect(hidden.every((panel) => panel.getAttribute("data-inert") === "true")).toBe(true);
    expect(screen.getByRole("tabpanel").textContent).toBe("How it began");
  });

  test("a force-mounted panel keeps its state across a switch", () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabList aria-label="History">{(section: Section) => <Tab>{section.name}</Tab>}</TabList>
        <TabPanel shouldForceMount>
          {(section: Section) => <input aria-label={`Notes on ${section.name}`} />}
        </TabPanel>
      </Tabs>
    ));

    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Notes on Founding" });
    field.value = "salama";
    user.click(screen.getByRole("tab", { name: "Today" }));
    flush();
    user.click(screen.getByRole("tab", { name: "Founding" }));
    flush();

    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("salama");
  });

  test("a panel coming in is marked entering, and stops being once it has", async () => {
    render(() => <Sections />);
    user.click(screen.getByRole("tab", { name: "Today" }));
    flush();

    const panel = screen.getByRole("tabpanel");
    expect(panel.hasAttribute("data-entering")).toBe(true);
    await new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));
    flush();
    expect(panel.hasAttribute("data-entering")).toBe(false);
  });

  test("a panel leaving stays while its exit animation runs", async () => {
    render(() => <Sections />);
    const leaving = screen.getByRole("tabpanel");
    leaving.style.transitionDuration = "50ms";

    user.click(screen.getByRole("tab", { name: "Today" }));
    flush();

    expect(leaving.isConnected, "the panel was removed before it could animate out").toBe(true);
    expect(leaving.hasAttribute("data-exiting")).toBe(true);
    await new Promise<void>((done) => setTimeout(done, 80));
    flush();
    expect(leaving.isConnected).toBe(false);
  });
});

describe("a selection indicator", () => {
  test("is shown in the selected tab only, and follows the selection", async () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabList aria-label="History">
          {(section: Section) => (
            <Tab>
              {section.name}
              <SelectionIndicator data-testid="indicator" />
            </Tab>
          )}
        </TabList>
        <TabPanel>{(section: Section) => <p>{section.body}</p>}</TabPanel>
      </Tabs>
    ));
    function shown(role: string): (string | null)[] {
      return screen
        .queryAllByTestId("indicator")
        .map(
          (element: Element) =>
            element.closest(`[role="${role}"]`)?.getAttribute("data-key") ?? null,
        );
    }
    expect(shown("tab"), "the tab never told its indicator it was selected").toEqual(["founding"]);

    user.click(screen.getByRole("tab", { name: "Today" }));
    flush();
    await new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));
    flush();
    expect(shown("tab")).toEqual(["today"]);
  });
});
