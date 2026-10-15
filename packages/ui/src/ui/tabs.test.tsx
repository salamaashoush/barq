import { describe, expect, test } from "bun:test";
import { provideDirection } from "@barqjs/aria/i18n";
import { createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.tsx";

function Settings(
  props: Incoming<{
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    orientation?: "horizontal" | "vertical";
    activationMode?: "automatic" | "manual";
    dir?: "ltr" | "rtl";
    variant?: "default" | "line";
  }>,
) {
  return (
    <Tabs
      value={props.value?.()}
      defaultValue={props.defaultValue?.()}
      onValueChange={props.onValueChange?.()}
      orientation={props.orientation?.()}
      activationMode={props.activationMode?.()}
      dir={props.dir?.()}
    >
      <TabsList aria-label="Settings" variant={props.variant?.()}>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="billing" disabled>
          Billing
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account">Name and email</TabsContent>
      <TabsContent value="password">Change it here</TabsContent>
      <TabsContent value="billing">Invoices</TabsContent>
    </Tabs>
  );
}

const SECTIONS = [
  { id: "overview", name: "Overview", body: "What it is" },
  { id: "usage", name: "Usage", body: "How to use it" },
];

function Sections(props: Incoming<{ orientation?: "horizontal" | "vertical" }>) {
  return (
    <Tabs items={SECTIONS} orientation={props.orientation?.()}>
      <TabsList aria-label="Sections">
        {(section: (typeof SECTIONS)[number]) => <TabsTrigger>{section.name}</TabsTrigger>}
      </TabsList>
      <TabsContent>{(section: (typeof SECTIONS)[number]) => <p>{section.body}</p>}</TabsContent>
    </Tabs>
  );
}

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

describe("Tabs written out with values", () => {
  test("each trigger and panel names its value, and the default one shows", () => {
    render(() => <Settings defaultValue="password" />);

    expect(screen.getByRole("tablist", { name: "Settings" })).toBe(slot("tabs-list"));
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("data-slot"))).toEqual([
      "tabs-trigger",
      "tabs-trigger",
      "tabs-trigger",
    ]);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel").getAttribute("data-slot")).toBe("tabs-content");
    expect(screen.getByRole("tabpanel").textContent).toBe("Change it here");
    expect(slot("tabs").getAttribute("data-orientation")).toBe("horizontal");
  });

  test("pressing a trigger shows its panel and reports the value", async () => {
    const chosen: string[] = [];
    render(() => <Settings defaultValue="account" onValueChange={(value) => chosen.push(value)} />);

    await user.click(screen.getByRole("tab", { name: "Password" }));
    flush();
    expect(chosen).toEqual(["password"]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Change it here");
  });

  test("the active trigger says so in both vocabularies", () => {
    render(() => <Settings defaultValue="account" />);

    const account = screen.getByRole("tab", { name: "Account" });
    const password = screen.getByRole("tab", { name: "Password" });
    expect(account.getAttribute("aria-selected")).toBe("true");
    expect(account.getAttribute("data-state")).toBe("active");
    expect(account.getAttribute("data-selected")).toBe("");
    expect(password.getAttribute("data-state")).toBe("inactive");
    expect(account.getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.getByRole("tabpanel").getAttribute("data-state")).toBe("active");
  });

  test("a written-out trigger wears the class a data-driven one does", () => {
    render(() => <Settings defaultValue="account" />);
    const written = screen.getAllByRole("tab")[0]?.className;
    const list = slot("tabs-list").className;
    document.body.innerHTML = "";

    render(() => <Sections />);
    expect(screen.getAllByRole("tab")[0]?.className).toBe(written ?? "");
    expect(slot("tabs-list").className).toBe(list);
  });

  test("a disabled trigger is announced, skipped by the arrows and inert", async () => {
    const chosen: string[] = [];
    render(() => (
      <Settings defaultValue="password" onValueChange={(value) => chosen.push(value)} />
    ));

    const tabs = screen.getAllByRole("tab");
    expect(tabs[2]?.getAttribute("aria-disabled")).toBe("true");
    expect(tabs[2]?.hasAttribute("data-disabled")).toBe(true);
    // Natively disabled it could not be focused, and so never announced.
    expect(tabs[2]?.hasAttribute("disabled")).toBe(false);
    expect(tabs[2]?.hasAttribute("value")).toBe(false);

    await user.click(tabs[2] as HTMLElement);
    flush();
    expect(chosen).toEqual([]);

    user.focus(tabs[1] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[0] as HTMLElement);
    expect(chosen).toEqual(["account"]);
  });

  test("manual activation waits for Enter", () => {
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

    user.key("Enter");
    flush();
    expect(chosen).toEqual(["password"]);
  });

  test("vertical tabs take the vertical arrows and say so", () => {
    render(() => <Settings defaultValue="account" orientation="vertical" />);

    expect(slot("tabs").getAttribute("data-orientation")).toBe("vertical");
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("dir mirrors the arrows and lays the text out that way", () => {
    render(() => <Settings defaultValue="account" dir="rtl" />);

    expect(slot("tabs").getAttribute("dir")).toBe("rtl");
    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("a controlled value moves when the caller moves it", async () => {
    const [value, setValue] = createSignal("account");
    render(() => <Settings value={value()} onValueChange={() => {}} />);

    await user.click(screen.getByRole("tab", { name: "Password" }));
    flush();
    expect(screen.getByRole("tabpanel").textContent).toBe("Name and email");

    setValue("password");
    flush();
    expect(screen.getByRole("tabpanel").textContent).toBe("Change it here");
  });

  test("the line variant is the list's, whichever way the tabs are written", () => {
    render(() => <Settings defaultValue="account" variant="line" />);
    expect(slot("tabs-list").getAttribute("data-variant")).toBe("line");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Settings defaultValue="account" />);
    expectNoAriaViolations(container);
  });
});

describe("Tabs from data", () => {
  test("the trigger and the panel carry upstream's state attributes too", () => {
    render(() => <Sections />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.getAttribute("data-state")).toBe("active");
    expect(tabs[1]?.getAttribute("data-state")).toBe("inactive");
    expect(tabs[0]?.getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.getByRole("tabpanel").getAttribute("data-state")).toBe("active");
    expect(screen.getByRole("tabpanel").getAttribute("data-orientation")).toBe("horizontal");
  });

  test("a direction declared above mirrors the arrows", () => {
    function Mirrored(props: Incoming<{ children?: Child }>) {
      const directionProps = provideDirection("rtl");
      return <div {...directionProps}>{props.children}</div>;
    }
    render(() => (
      <Mirrored>
        <Sections />
      </Mirrored>
    ));

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });
});

describe("Tabs in a right-to-left page", () => {
  test("the icon padding and the vertical indicator follow the text", () => {
    render(() => <Sections orientation="vertical" />);
    const rules = rulesFor(screen.getAllByRole("tab")[0]?.className ?? "");

    expect(rules).toContain('[data-icon="inline-end"]){padding-inline-end: var(--spacing)');
    expect(rules).toContain('[data-icon="inline-start"]){padding-inline-start: var(--spacing)');
    expect(rules).toContain("inset-inline-end: calc(var(--spacing) * -1)");
    expect(rules).not.toContain("padding-right");
    expect(rules).not.toContain("padding-left");
    expect(rules).not.toContain("{right:");
  });
});
