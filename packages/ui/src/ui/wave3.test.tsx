import { beforeEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion.tsx";
import { Button } from "./button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "./tabs.tsx";
import { resetTooltipWarmup } from "@barqjs/aria/tooltip";

import { Tooltip, TooltipContent } from "./tooltip.tsx";

const SECTIONS = [
  { id: "overview", name: "Overview", body: "What it is" },
  { id: "usage", name: "Usage", body: "How to use it" },
];

describe("Tabs", () => {
  test("one panel, and it follows the selection", async () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabsList aria-label="Sections">
          {(section: (typeof SECTIONS)[number]) => <TabsTrigger>{section.name}</TabsTrigger>}
        </TabsList>
        <TabsContent>{(section: (typeof SECTIONS)[number]) => <p>{section.body}</p>}</TabsContent>
      </Tabs>
    ));

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel").textContent).toBe("What it is");

    await user.click(screen.getByRole("tab", { name: "Usage" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("How to use it");
  });

  test("the selected tab is marked for the CSS and for the reader", async () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabsList aria-label="Sections">
          {(section: (typeof SECTIONS)[number]) => <TabsTrigger>{section.name}</TabsTrigger>}
        </TabsList>
        <TabsContent>{() => <p>x</p>}</TabsContent>
      </Tabs>
    ));
    const first = screen.getByRole("tab", { name: "Overview" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(first.getAttribute("data-selected")).toBe("");
    expect(first.getAttribute("data-slot")).toBe("tabs-trigger");
  });

  test("the orientation is an attribute the list reads through its ancestor", () => {
    render(() => (
      <Tabs items={SECTIONS} orientation="vertical">
        <TabsList aria-label="Sections">
          {(section: (typeof SECTIONS)[number]) => <TabsTrigger>{section.name}</TabsTrigger>}
        </TabsList>
        <TabsContent>{() => <p>x</p>}</TabsContent>
      </Tabs>
    ));
    const list = document.querySelector('[data-slot="tabs-list"]')!;
    expect(document.querySelector('[data-slot="tabs"]')?.getAttribute("data-orientation")).toBe(
      "vertical",
    );
    expect(rulesFor(list.className)).toContain('[data-slot="tabs"][data-orientation="vertical"] .');
  });

  test("the line variant is a different class, not a different component", () => {
    expect(tabsListVariants({ variant: "line" })).not.toBe(tabsListVariants());
    const line = tabsListVariants({ variant: "line" });
    expect(rulesFor(line ?? "")).toContain("background-color: transparent");
  });
});

describe("Accordion", () => {
  const FAQS = [
    { id: "a", q: "First?", a: "Yes" },
    { id: "b", q: "Second?", a: "No" },
  ];

  function Fixture() {
    return (
      <Accordion items={FAQS}>
        {(faq: (typeof FAQS)[number]) => (
          <AccordionItem>
            <AccordionTrigger>{faq.q}</AccordionTrigger>
            <AccordionContent>{faq.a}</AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    );
  }

  test("a trigger opens its own panel", async () => {
    render(() => <Fixture />);
    const first = screen.getByRole("button", { name: /First/ });
    expect(first.getAttribute("aria-expanded")).toBe("false");
    await user.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
  });

  test("each section is an element, so the rule between two of them has something to sit on", () => {
    render(() => <Fixture />);
    const items = document.querySelectorAll('[data-slot="accordion-item"]');
    // `<DisclosureGroupItem>` renders nothing, so the class went nowhere and
    // the accordion had no dividers.
    expect(items).toHaveLength(2);
    const rules = rulesFor((items[0] as HTMLElement).className);
    expect(rules).toContain("border-bottom-width: 1px");
    expect(rules).toContain(":last-child{border-bottom-style");
  });

  test("the panel stays in the document while collapsed, so find-in-page reaches it", () => {
    render(() => <Fixture />);
    expect(screen.getByText("Yes")).toBeTruthy();
  });

  test("the panel collapses on grid-template-rows, with no height to measure", () => {
    render(() => <Fixture />);
    const panel = document.querySelector('[data-slot="accordion-content"]')!;
    const rules = rulesFor(panel.className);
    expect(rules).toContain("grid-template-rows: 0fr");
    expect(rules).toContain("[data-expanded]{grid-template-rows: 1fr}");
    expect(rules).not.toContain("--radix");
  });

  test("the chevron turns over when the section opens", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: /First/ });
    expect(rulesFor(trigger.className)).toContain(
      '[data-expanded] > [data-slot="accordion-chevron"]{rotate: 180deg}',
    );
    await user.click(trigger);
    expect(trigger.getAttribute("data-expanded")).toBe("");
  });
});

describe("Collapsible", () => {
  test("the trigger toggles the panel", async () => {
    render(() => (
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Hidden until asked for</CollapsibleContent>
      </Collapsible>
    ));
    const trigger = screen.getByRole("button", { name: "Details" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      document.querySelector('[data-slot="collapsible-content"]')?.getAttribute("data-expanded"),
    ).toBe("");
  });
});

describe("Tooltip", () => {
  /** Long enough for a timer scheduled at `ms` to have run. */
  function after(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms + 15));
  }

  beforeEach(() => {
    resetTooltipWarmup();
  });

  test("the trigger is the control itself, and it describes it", async () => {
    render(() => (
      <Tooltip delay={10}>
        <Button>Save</Button>
        <TooltipContent>Saves to the server</TooltipContent>
      </Tooltip>
    ));
    const button = screen.getByRole("button", { name: "Save" });
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();

    await user.hover(button);
    await after(10);
    flush();
    const tip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute("role")).toBe("tooltip");
    expect(button.getAttribute("aria-describedby")).toBe(tip!.getAttribute("id"));
  });

  test("it draws an arrow unless told not to", async () => {
    render(() => (
      <Tooltip delay={10}>
        <Button>Save</Button>
        <TooltipContent>Saves</TooltipContent>
      </Tooltip>
    ));
    await user.hover(screen.getByRole("button"));
    await after(10);
    flush();
    expect(document.querySelector('[data-slot="tooltip-arrow"]')).not.toBeNull();
  });

  test("the arrow is offset along the tooltip, not left at its far corner", async () => {
    render(() => (
      <Tooltip delay={10}>
        <Button>Save</Button>
        <TooltipContent>Saves</TooltipContent>
      </Tooltip>
    ));
    await user.hover(screen.getByRole("button"));
    await after(10);
    flush();
    // `overlayPosition` computes the offset only when it is given an
    // `arrowRef`. Without one `arrowProps` was empty, the arrow had no `left`
    // at all, and it fell to its static position at the end of the text.
    const arrow = document.querySelector('[data-slot="tooltip-arrow"]') as HTMLElement;
    expect(arrow.style.position).toBe("absolute");
    expect(arrow.style.left).not.toBe("");
  });

  test("no arrow when it is turned off", async () => {
    render(() => (
      <Tooltip delay={10}>
        <Button>Save</Button>
        <TooltipContent arrow={false}>Saves</TooltipContent>
      </Tooltip>
    ));
    await user.hover(screen.getByRole("button"));
    await after(10);
    flush();
    expect(document.querySelector('[data-slot="tooltip-arrow"]')).toBeNull();
  });
});
