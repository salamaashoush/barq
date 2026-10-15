import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type Incoming } from "@barqjs/core";
import { cleanup, render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion.tsx";

afterEach(cleanup);

function Faq(
  props: Incoming<{
    type?: "single" | "multiple";
    collapsible?: boolean;
    defaultValue?: string | string[];
    onValueChange?: (value: string | string[]) => void;
    disabled?: boolean;
    orientation?: "vertical" | "horizontal";
    dir?: "ltr" | "rtl";
  }>,
) {
  return (
    <Accordion
      type={props.type?.() ?? "single"}
      collapsible={props.collapsible?.()}
      defaultValue={props.defaultValue?.()}
      onValueChange={props.onValueChange?.()}
      disabled={props.disabled?.()}
      orientation={props.orientation?.()}
      dir={props.dir?.()}
    >
      <AccordionItem value="shipping">
        <AccordionTrigger>Shipping</AccordionTrigger>
        <AccordionContent>Two days</AccordionContent>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionTrigger>Returns</AccordionTrigger>
        <AccordionContent>Thirty days</AccordionContent>
      </AccordionItem>
      <AccordionItem value="billing" disabled>
        <AccordionTrigger>Billing</AccordionTrigger>
        <AccordionContent>Monthly</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

const trigger = (name: string): HTMLElement => screen.getByRole("button", { name });
const open = (): string[] =>
  screen
    .getAllByRole("button")
    .filter((button: Element) => button.getAttribute("aria-expanded") === "true")
    .map((button: Element) => button.textContent ?? "");
const slots = (name: string): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`[data-slot="${name}"]`),
];

describe("Accordion, written out with a value per section", () => {
  test("each section is keyed by its value", async () => {
    render(() => <Faq defaultValue="returns" />);
    expect(open()).toEqual(["Returns"]);
    await user.click(trigger("Shipping"));
    flush();
    expect(open()).toEqual(["Shipping"]);
  });

  test("a single accordion keeps its open section open unless it is collapsible", async () => {
    render(() => <Faq defaultValue="shipping" />);
    await user.click(trigger("Shipping"));
    flush();
    expect(open()).toEqual(["Shipping"]);
    expect(trigger("Shipping").getAttribute("aria-disabled")).toBe("true");
  });

  test("collapsible lets the open section shut, and reports an empty value", async () => {
    const seen: (string | string[])[] = [];
    render(() => (
      <Faq collapsible defaultValue="shipping" onValueChange={(value) => seen.push(value)} />
    ));
    await user.click(trigger("Shipping"));
    flush();
    expect(open()).toEqual([]);
    expect(seen).toEqual([""]);
  });

  test("multiple keeps several open and reports them as an array", async () => {
    const seen: (string | string[])[] = [];
    render(() => (
      <Faq
        type="multiple"
        defaultValue={["shipping"]}
        onValueChange={(value) => seen.push(value)}
      />
    ));
    await user.click(trigger("Returns"));
    flush();
    expect(open()).toEqual(["Shipping", "Returns"]);
    expect(seen).toEqual([["shipping", "returns"]]);
  });

  test("a controlled value is the owner's to change", async () => {
    const [value, setValue] = createSignal("shipping");
    const asked: string[] = [];
    function Controlled() {
      return (
        <Accordion type="single" value={value()} onValueChange={(next) => asked.push(String(next))}>
          <AccordionItem value="shipping">
            <AccordionTrigger>Shipping</AccordionTrigger>
            <AccordionContent>Two days</AccordionContent>
          </AccordionItem>
          <AccordionItem value="returns">
            <AccordionTrigger>Returns</AccordionTrigger>
            <AccordionContent>Thirty days</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
    }
    render(() => <Controlled />);
    await user.click(trigger("Returns"));
    flush();
    expect(asked).toEqual(["returns"]);
    expect(open()).toEqual(["Shipping"]);
    setValue("returns");
    flush();
    expect(open()).toEqual(["Returns"]);
  });

  test("every part says open or closed, and which way the accordion runs", async () => {
    render(() => <Faq defaultValue="shipping" />);
    expect(slots("accordion")[0]?.getAttribute("data-orientation")).toBe("vertical");
    for (const slot of [
      "accordion-item",
      "accordion-header",
      "accordion-trigger",
      "accordion-content",
    ]) {
      const [first, second] = slots(slot);
      expect(first?.getAttribute("data-state"), slot).toBe("open");
      expect(second?.getAttribute("data-state"), slot).toBe("closed");
      expect(first?.getAttribute("data-orientation"), slot).toBe("vertical");
    }
    await user.click(trigger("Returns"));
    flush();
    expect(slots("accordion-item")[1]?.getAttribute("data-state")).toBe("open");
    expect(slots("accordion-item")[0]?.getAttribute("data-state")).toBe("closed");
  });

  test("the trigger sits in a heading, which is what makes a section navigable by headings", () => {
    render(() => <Faq />);
    const heading = screen.getAllByRole("heading")[0] as HTMLElement;
    expect(heading.tagName).toBe("H3");
    expect(heading.getAttribute("data-slot")).toBe("accordion-header");
    expect(heading.firstElementChild).toBe(trigger("Shipping"));
    expect(rulesFor(heading.className)).toContain("display: flex");
  });

  test("a disabled section says so on every part and does not open", async () => {
    render(() => <Faq />);
    for (const slot of [
      "accordion-item",
      "accordion-header",
      "accordion-trigger",
      "accordion-content",
    ]) {
      expect(slots(slot)[2]?.getAttribute("data-disabled"), slot).toBe("");
      expect(slots(slot)[0]?.hasAttribute("data-disabled"), slot).toBe(false);
    }
    expect(trigger("Billing").hasAttribute("disabled")).toBe(true);
  });

  test("disabled on the accordion reaches every section", () => {
    render(() => <Faq disabled />);
    expect(slots("accordion")[0]?.getAttribute("data-disabled")).toBe("");
    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  test("the arrows, Home and End move between the headers, past a disabled one", () => {
    render(() => <Faq />);
    trigger("Shipping").focus();
    user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(trigger("Returns"));
    user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(trigger("Shipping"));
    user.keyboard("{End}");
    expect(document.activeElement).toBe(trigger("Returns"));
    user.keyboard("{Home}");
    expect(document.activeElement).toBe(trigger("Shipping"));
  });

  test("a horizontal accordion reads left and right, mirrored right to left", () => {
    render(() => <Faq orientation="horizontal" dir="rtl" />);
    expect(slots("accordion")[0]?.getAttribute("data-orientation")).toBe("horizontal");
    expect(slots("accordion")[0]?.getAttribute("dir")).toBe("rtl");
    trigger("Shipping").focus();
    user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(trigger("Returns"));
    user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(trigger("Shipping"));
  });

  test("the trigger aligns to the start and pushes its chevron to the end, whichever side that is", () => {
    render(() => <Faq />);
    const rules = rulesFor(trigger("Shipping").className);
    expect(rules).toContain("text-align: start");
    expect(rules).toContain("margin-inline-start: auto");
    expect(rules).not.toContain("margin-left");
    expect(rules).not.toContain("text-align: left");
  });
});

describe("Accordion, from items", () => {
  const FAQS = [
    { id: "a", q: "First?", a: "Yes" },
    { id: "b", q: "Second?", a: "No" },
  ];

  test("the same attributes land, and an open section still shuts", async () => {
    render(() => (
      <Accordion items={FAQS} defaultExpandedKeys={["a"]}>
        {(faq: (typeof FAQS)[number]) => (
          <AccordionItem>
            <AccordionTrigger>{faq.q}</AccordionTrigger>
            <AccordionContent>{faq.a}</AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    ));
    expect(slots("accordion-item")[0]?.getAttribute("data-state")).toBe("open");
    await user.click(screen.getByRole("button", { name: /First/ }));
    flush();
    expect(slots("accordion-item")[0]?.getAttribute("data-state")).toBe("closed");
  });
});
